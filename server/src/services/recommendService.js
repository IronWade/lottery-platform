import { LOTTERIES } from '../config.js';
import { recentDraws, latestDraw } from '../db.js';

const STRATEGIES = ['balanced', 'hot', 'cold'];
const STRATEGY_NAMES = { balanced: '均衡分布', hot: '热号加权', cold: '冷号回补' };

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function countConsecutiveGroups(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  let groups = 0;
  let inGroup = false;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      if (!inGroup) {
        groups++;
        inGroup = true;
      }
    } else {
      inGroup = false;
    }
  }
  return groups;
}

/** 按权重不放回抽取 count 个号码 */
function weightedPick(pool, count) {
  const available = [...pool];
  const picked = [];
  while (picked.length < count && available.length > 0) {
    const totalW = available.reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * totalW;
    let idx = 0;
    for (; idx < available.length; idx++) {
      r -= available[idx].weight;
      if (r <= 0) break;
    }
    idx = Math.min(idx, available.length - 1);
    picked.push(available[idx].num);
    available.splice(idx, 1);
  }
  return picked.sort((a, b) => a - b);
}

/** 构造红球(前区)权重池 */
function buildPool(lotteryKey, draws, strategy, zone) {
  const meta = LOTTERIES[lotteryKey];
  const range = zone === 'blue' ? meta.blue : meta.red;
  const getBalls = (d) => (zone === 'blue' ? d.blues : d.reds);

  const freq = new Map();
  for (let n = range.min; n <= range.max; n++) freq.set(n, 0);
  for (const d of draws) for (const n of getBalls(d)) freq.set(n, (freq.get(n) || 0) + 1);

  const maxFreq = Math.max(...freq.values(), 1);
  const maxOmit = draws.length;

  return [...freq.entries()].map(([num, f]) => {
    let weight;
    if (strategy === 'hot') {
      weight = 1 + (f / maxFreq) * 9; // 频率越高权重越大
    } else if (strategy === 'cold') {
      weight = 1 + (1 - f / maxFreq) * 9; // 频率越低权重越大
    } else {
      weight = 1 + Math.abs(f / maxFreq - 0.5) * 2; // 均衡:温号权重最高
    }
    // 所有策略都轻微偏好当前遗漏较长的号码(回补倾向)
    const currentOmit = draws.findIndex((d) => getBalls(d).includes(num));
    const omitRatio = currentOmit === -1 ? 1 : currentOmit / maxOmit;
    weight *= 1 + omitRatio * 0.3;
    return { num, weight };
  });
}

/** 校验一注红球是否符合过滤规则 */
function validPick(lotteryKey, nums, latest) {
  const meta = LOTTERIES[lotteryKey];
  const s = sum(nums);
  const avgBase = ((meta.red.min + meta.red.max) / 2) * meta.red.count;
  if (Math.abs(s - avgBase) > avgBase * 0.45) return false; // 和值不过于极端

  const odd = nums.filter((n) => n % 2 === 1).length;
  const mid = (meta.red.min + meta.red.max) / 2;
  const big = nums.filter((n) => n >= mid).length;
  // 奇偶、大小至少各占 1/4(双色球 6 球即 >=2,大乐透 5 球即 >=1)
  const minShare = meta.red.count >= 6 ? 2 : 1;
  if (odd < minShare || meta.red.count - odd < minShare) return false;
  if (big < minShare || meta.red.count - big < minShare) return false;

  if (countConsecutiveGroups(nums) > 1) return false; // 最多一组连号
  if (latest && nums.every((n) => latest.reds.includes(n))) return false; // 不与上期完全相同
  return true;
}

function generateOne(lotteryKey, strategy, draws) {
  const meta = LOTTERIES[lotteryKey];
  const latest = draws[0] || null;

  let reds = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const pool = buildPool(lotteryKey, draws, strategy, 'red');
    const candidate = weightedPick(pool, meta.red.count);
    if (validPick(lotteryKey, candidate, latest)) {
      reds = candidate;
      break;
    }
  }
  if (!reds) reds = weightedPick(buildPool(lotteryKey, draws, 'balanced', 'red'), meta.red.count);

  const bluePool = buildPool(lotteryKey, draws, strategy, 'blue');
  const blues = weightedPick(bluePool, meta.blue.count);

  return { reds, blues, sum: sum(reds) };
}

/** 生成 count 注互不相同的推荐号码 */
export function getRecommendations(lotteryKey, strategy = 'balanced', count = 5, periods = 30) {
  const meta = LOTTERIES[lotteryKey];
  if (!meta) throw new Error('未知彩种');
  if (!STRATEGIES.includes(strategy)) throw new Error(`未知策略: ${strategy}`);
  count = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
  periods = Math.min(Math.max(parseInt(periods, 10) || 30, 10), 200);

  const draws = recentDraws(lotteryKey, periods);
  if (draws.length === 0) throw new Error('该彩种暂无数据,请先同步或录入数据');

  const seen = new Set();
  const bets = [];
  for (let i = 0; i < count * 10 && bets.length < count; i++) {
    const bet = generateOne(lotteryKey, strategy, draws);
    const key = bet.reds.join(',') + '|' + bet.blues.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    bets.push(bet);
  }

  return {
    lottery: meta,
    strategy,
    strategyName: STRATEGY_NAMES[strategy],
    periods,
    basePeriod: draws[0]?.issue || null,
    latest: latestDraw(lotteryKey),
    bets,
  };
}

export { STRATEGIES, STRATEGY_NAMES };
