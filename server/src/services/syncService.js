import { LOTTERIES } from '../config.js';
import { upsertDraw, countDraws } from '../db.js';
import { buildSeedData } from '../data/seed.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 解析双色球(福彩官网返回结构)
function parseSsq(result) {
  // 典型字段:code(期号) date(开奖日期) red(逗号分隔红球) blue(蓝球)
  if (!result || !result.code || !result.red) return null;
  const reds = String(result.red)
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 33);
  const blue = parseInt(result.blue, 10);
  if (reds.length !== 6 || !(blue >= 1 && blue <= 16)) return null;
  return {
    issue: String(result.code),
    date: (result.date || '').slice(0, 10),
    reds: reds.sort((a, b) => a - b),
    blues: [blue],
  };
}

// 解析大乐透(体彩网返回结构 value.list)
function parseDlt(item) {
  if (!item || !item.lotteryDrawNum || !item.lotteryDrawResult) return null;
  const parts = String(item.lotteryDrawResult).split(/\s+/);
  if (parts.length !== 7) return null;
  const nums = parts.map((s) => parseInt(s, 10));
  if (nums.some((n) => !Number.isInteger(n))) return null;
  const reds = nums.slice(0, 5).sort((a, b) => a - b);
  const blues = nums.slice(5).sort((a, b) => a - b);
  if (reds.some((n) => n < 1 || n > 35) || blues.some((n) => n < 1 || n > 12))
    return null;
  return {
    issue: String(item.lotteryDrawNum),
    date: (item.lotteryDrawTime || '').slice(0, 10),
    reds,
    blues,
  };
}

async function fetchOnePage(lotteryKey, pageNo, pageSize) {
  const meta = LOTTERIES[lotteryKey];
  const url = meta.apiUrl
    .replace('{pageSize}', String(pageSize))
    .replace('pageNo=1', `pageNo=${pageNo}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        Referer: lotteryKey === 'ssq' ? 'https://www.cwl.gov.cn/' : 'https://static.sporttery.cn/',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (lotteryKey === 'ssq') {
      return (data?.result || []).map(parseSsq).filter(Boolean);
    }
    return (data?.value?.list || []).map(parseDlt).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemote(lotteryKey, pageSize) {
  // 体彩接口单页上限 100,多页抓取凑够 pageSize
  const pageCap = 100;
  const totalPages = Math.max(1, Math.ceil(pageSize / pageCap));
  const all = [];
  for (let p = 1; p <= totalPages; p++) {
    const list = await fetchOnePage(lotteryKey, p, Math.min(pageCap, pageSize - all.length));
    if (!list.length) break;
    all.push(...list);
    if (list.length < pageCap) break; // 没有更多数据
  }
  return all;
}

/**
 * 同步某彩种数据:
 * 1. 尝试抓取官方最新数据并入库
 * 2. 失败(网络/反爬/字段变动)时,若库中无数据则写入示例数据兜底
 * 返回 { added, source: 'remote'|'seed', error? }
 */
export async function syncLottery(lotteryKey, pageSize = 1000) {
  try {
    const draws = await fetchRemote(lotteryKey, pageSize);
    if (!draws.length) throw new Error('远端数据为空');
    for (const d of draws) {
      upsertDraw({ lottery: lotteryKey, ...d, source: 'official' });
    }
    return { added: draws.length, source: 'remote' };
  } catch (err) {
    if (countDraws(lotteryKey) === 0) {
      const seeds = buildSeedData().filter((d) => d.lottery === lotteryKey);
      for (const d of seeds) {
        upsertDraw({ ...d, source: 'seed' });
      }
      return { added: seeds.length, source: 'seed', error: String(err.message || err) };
    }
    // 库中已有数据,同步失败不算错误
    return { added: 0, source: 'cached', error: String(err.message || err) };
  }
}
