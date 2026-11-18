import { LOTTERIES } from '../config.js';

/**
 * 胆拖/杀号生成器:
 * - dan: 胆码(必出),tuo: 拖码(与胆码组合补足),kill: 杀号(排除)
 * - 若 dan+tuo 恰好等于所需个数 → 单式;否则从拖码中组合
 * - filters: { balanced(奇偶/大小均衡), sumTight(和值收紧), noConsecutive(禁连号) }
 */
export function generateTickets(lotteryKey, { dan = [], kill = [], maxBets = 30, filters = {} }) {
  const meta = LOTTERIES[lotteryKey];
  if (!meta) throw new Error('未知彩种');
  const { count, min, max } = meta.red;
  const need = count - dan.length;

  if (dan.length > count) throw new Error(`胆码不能超过 ${count} 个`);
  if (need < 0 || dan.length === 0) {
    throw new Error('请至少选择 1 个胆码(最多 ' + (count - 1) + ' 个,需留位置给拖码)');
  }
  if (new Set(dan).size !== dan.length) throw new Error('胆码有重复');

  const pool = [];
  for (let n = min; n <= max; n++) {
    if (!dan.includes(n) && !kill.includes(n)) pool.push(n);
  }
  if (pool.length < need) {
    throw new Error(`可用拖码不足:杀掉 ${kill.length} 个后只剩 ${pool.length} 个,需要 ${need} 个`);
  }

  const danSum = dan.reduce((a, b) => a + b, 0);
  const mid = (min + max) / 2;
  const avgTotal = ((min + max) / 2) * count;
  const sumLimit = filters.sumTight ? 0.25 : 0.45;

  function valid(nums) {
    const total = danSum + nums.reduce((a, b) => a + b, 0);
    if (Math.abs(total - avgTotal) > avgTotal * sumLimit) return false;
    if (filters.balanced) {
      const all = [...dan, ...nums];
      const odd = all.filter((n) => n % 2 === 1).length;
      const big = all.filter((n) => n >= mid).length;
      const minShare = count >= 6 ? 2 : 1;
      if (odd < minShare || count - odd < minShare) return false;
      if (big < minShare || count - big < minShare) return false;
    }
    if (filters.noConsecutive && consecutiveGroups([...dan, ...nums]) > 1) return false;
    return true;
  }

  maxBets = Math.min(Math.max(parseInt(maxBets, 10) || 30, 1), 100);
  const tickets = [];
  const seen = new Set();
  let attempts = 0;
  while (tickets.length < maxBets && attempts < maxBets * 200) {
    attempts++;
    // 不放回随机取样 need 个拖码
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, need);
    if (valid(picked)) {
      const reds = [...dan, ...picked].sort((a, b) => a - b);
      const key = reds.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        tickets.push({ reds, dan: [...dan].sort((a, b) => a - b), sum: reds.reduce((a, b) => a + b, 0) });
      }
    }
  }

  const blueCount = meta.blue.count;
  const blues = [];
  while (blues.length < blueCount) {
    const n = meta.blue.min + Math.floor(Math.random() * (meta.blue.max - meta.blue.min + 1));
    if (!blues.includes(n)) blues.push(n);
  }
  blues.sort((a, b) => a - b);

  return {
    lottery: meta,
    dan: [...dan].sort((a, b) => a - b),
    kill: [...kill].sort((a, b) => a - b),
    poolSize: pool.length,
    generated: tickets.length,
    attempts,
    tickets,
    blues,
  };
}

function consecutiveGroups(nums) {
  const s = [...nums].sort((a, b) => a - b);
  let groups = 0;
  let inGroup = false;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) {
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
