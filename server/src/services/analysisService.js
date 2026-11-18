import { LOTTERIES } from '../config.js';
import { recentDraws, latestDraw } from '../db.js';

/**
 * 计算单个号码池的统计:
 * @param draws 近期开奖(新→旧)
 * @param min/max 号码范围
 * 返回 [{ num, freq, currentOmit, maxOmit, avgOmit }]
 */
function computeBallStats(draws, min, max, getBalls) {
  const stats = [];
  for (let n = min; n <= max; n++) {
    let freq = 0;
    let currentOmit = 0; // 从最新一期往回数,遇到出现则停止
    let maxOmit = 0;
    let run = 0;
    let totalOmitRuns = 0;
    let omitSum = 0;
    let seenFirst = false;

    for (let i = 0; i < draws.length; i++) {
      const hit = getBalls(draws[i]).includes(n);
      if (hit) {
        freq++;
        if (!seenFirst) {
          currentOmit = i;
          seenFirst = true;
        }
        if (run > 0) {
          omitSum += run;
          totalOmitRuns++;
        }
        maxOmit = Math.max(maxOmit, run);
        run = 0;
      } else {
        run++;
      }
    }
    if (!seenFirst) currentOmit = draws.length; // 从未出现过
    maxOmit = Math.max(maxOmit, run); // 末尾遗漏段
    const avgOmit = totalOmitRuns > 0 ? omitSum / totalOmitRuns : 0;

    stats.push({ num: n, freq, currentOmit, maxOmit, avgOmit: Math.round(avgOmit * 10) / 10 });
  }
  return stats;
}

/** 按频率分档:热(前 1/3)、温(中 1/3)、冷(后 1/3) */
function classifyHotCold(stats) {
  const sorted = [...stats].sort((a, b) => b.freq - a.freq || a.num - b.num);
  const third = Math.ceil(sorted.length / 3);
  const hot = sorted.slice(0, third).map((s) => s.num);
  const cold = sorted.slice(-third).map((s) => s.num);
  const warm = sorted.slice(third, -third).map((s) => s.num);
  return { hot, warm, cold };
}

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

/** 综合概览:冷热、遗漏、和值、重号等 */
export function getOverview(lotteryKey, periods = 30) {
  const meta = LOTTERIES[lotteryKey];
  if (!meta) throw new Error('未知彩种');
  const draws = recentDraws(lotteryKey, periods); // 新→旧
  const redStats = computeBallStats(draws, meta.red.min, meta.red.max, (d) => d.reds);
  const blueStats = computeBallStats(draws, meta.blue.min, meta.blue.max, (d) => d.blues);

  const sumRange = {
    min: meta.red.min * meta.red.count,
    max: meta.red.max * meta.red.count,
  };
  const actualSums = draws.map((d) => sum(d.reds));
  const avgSum = actualSums.length
    ? Math.round(actualSums.reduce((a, b) => a + b, 0) / actualSums.length)
    : 0;

  let repeatCountTotal = 0;
  for (let i = 0; i < draws.length - 1; i++) {
    repeatCountTotal += draws[i].reds.filter((n) => draws[i + 1].reds.includes(n)).length;
  }

  return {
    lottery: meta,
    periods: draws.length,
    redStats,
    blueStats,
    hotCold: {
      red: classifyHotCold(redStats),
      blue: classifyHotCold(blueStats),
    },
    sumStats: {
      range: sumRange,
      avg: avgSum,
      recent: actualSums.slice(0, 10).reverse(),
    },
    repeatFromPrev: draws.length > 1 ? (repeatCountTotal / (draws.length - 1)).toFixed(2) : 0,
    latest: latestDraw(lotteryKey),
  };
}

/** 走势图数据:逐期号码矩阵(出现=号码本身,未出现=遗漏值) */
export function getTrend(lotteryKey, periods = 30) {
  const meta = LOTTERIES[lotteryKey];
  if (!meta) throw new Error('未知彩种');
  const draws = recentDraws(lotteryKey, periods); // 新→旧
  const asc = [...draws].reverse(); // 旧→新,便于遗漏递增

  const build = (min, max, getBalls) => {
    const rows = [];
    let omit = new Map();
    for (let n = min; n <= max; n++) omit.set(n, 0);
    for (const d of asc) {
      const balls = new Set(getBalls(d));
      const row = { issue: d.issue, date: d.date, values: [] };
      for (let n = min; n <= max; n++) {
        if (balls.has(n)) {
          row.values.push({ num: n, hit: true, omit: 0 });
          omit.set(n, 0);
        } else {
          const o = omit.get(n) + 1;
          omit.set(n, o);
          row.values.push({ num: n, hit: false, omit: o });
        }
      }
      rows.push(row);
    }
    return rows;
  };

  return {
    lottery: meta,
    redTrend: build(meta.red.min, meta.red.max, (d) => d.reds),
    blueTrend: build(meta.blue.min, meta.blue.max, (d) => d.blues),
  };
}

/** 统计报告:和值分布、奇偶比、大小比、区间比、连号 */
export function getReport(lotteryKey, periods = 100) {
  const meta = LOTTERIES[lotteryKey];
  if (!meta) throw new Error('未知彩种');
  const draws = recentDraws(lotteryKey, periods); // 新→旧

  // 和值分布(按 10 分段)
  const sumBuckets = new Map();
  for (const d of draws) {
    const s = sum(d.reds);
    const bucket = Math.floor(s / 10) * 10;
    sumBuckets.set(bucket, (sumBuckets.get(bucket) || 0) + 1);
  }

  // 奇偶比 / 大小比 / 区间比(前中后三等分)
  const oddEven = new Map();
  const bigSmall = new Map();
  const zones = new Map();
  const { min, max, count } = meta.red;
  const mid = (min + max) / 2;
  const zoneSize = Math.ceil((max - min + 1) / 3);
  let consecutiveDraws = 0;

  for (const d of draws) {
    const reds = d.reds;
    const odd = reds.filter((n) => n % 2 === 1).length;
    oddEven.set(`${odd}:${count - odd}`, (oddEven.get(`${odd}:${count - odd}`) || 0) + 1);
    const big = reds.filter((n) => n >= mid).length;
    bigSmall.set(`${big}:${count - big}`, (bigSmall.get(`${big}:${count - big}`) || 0) + 1);
    const z = [
      reds.filter((n) => n < min + zoneSize).length,
      reds.filter((n) => n >= min + zoneSize && n < min + zoneSize * 2).length,
      reds.filter((n) => n >= min + zoneSize * 2).length,
    ];
    const zKey = z.join(':');
    zones.set(zKey, (zones.get(zKey) || 0) + 1);
    if (countConsecutiveGroups(reds) > 0) consecutiveDraws++;
  }

  const toArr = (map) =>
    [...map.entries()].map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count);

  return {
    lottery: meta,
    periods: draws.length,
    sumDist: [...sumBuckets.entries()]
      .map(([bucket, count]) => ({ range: `${bucket}-${bucket + 9}`, count }))
      .sort((a, b) => parseInt(a.range) - parseInt(b.range)),
    oddEven: toArr(oddEven),
    bigSmall: toArr(bigSmall),
    zones: toArr(zones),
    consecutiveRatio:
      draws.length > 0 ? Math.round((consecutiveDraws / draws.length) * 1000) / 10 : 0,
  };
}
