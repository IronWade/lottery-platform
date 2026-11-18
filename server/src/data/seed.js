// 离线兜底示例数据:确定性伪随机生成,保证平台在无网络时可用
// 仅用于演示,真实数据请通过「同步数据」抓取官方开奖结果

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickUnique(rand, count, min, max) {
  const set = new Set();
  while (set.size < count) set.add(min + Math.floor(rand() * (max - min + 1)));
  return [...set].sort((a, b) => a - b);
}

// 生成双色球与大乐透示例数据(双色球 60 期、大乐透 40 期)
export function buildSeedData() {
  const ssq = [];
  const randSsq = mulberry32(20240001);
  for (let i = 0; i < 60; i++) {
    const issueNum = 24061 - i;
    const date = new Date(2024, 5, 2);
    date.setDate(date.getDate() - i * 3); // 每 3 天一期
    ssq.push({
      lottery: 'ssq',
      issue: String(issueNum),
      date: date.toISOString().slice(0, 10),
      reds: pickUnique(randSsq, 6, 1, 33),
      blues: pickUnique(randSsq, 1, 1, 16),
    });
  }
  const dlt = [];
  const randDlt = mulberry32(20240002);
  for (let i = 0; i < 40; i++) {
    const issueNum = 24051 - i;
    const date = new Date(2024, 5, 3);
    date.setDate(date.getDate() - i * 3);
    dlt.push({
      lottery: 'dlt',
      issue: String(issueNum),
      date: date.toISOString().slice(0, 10),
      reds: pickUnique(randDlt, 5, 1, 35),
      blues: pickUnique(randDlt, 2, 1, 12),
    });
  }
  return [...ssq, ...dlt];
}
