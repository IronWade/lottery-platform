import db, { latestDraw } from '../db.js';

// ---------- 中奖规则 ----------
// 返回 { level, name, amount } ;level=0 表示未中奖
export function prizeOf(lottery, hitsRed, hitsBlue) {
  if (lottery === 'ssq') {
    // 双色球:红球全中+蓝中=一等;固定奖 三等3000 四等200 五等10 六等5
    if (hitsRed === 6 && hitsBlue === 1) return { level: 1, name: '一等奖', amount: null };
    if (hitsRed === 6 && hitsBlue === 0) return { level: 2, name: '二等奖', amount: null };
    if (hitsRed === 5 && hitsBlue === 1) return { level: 3, name: '三等奖', amount: 3000 };
    if ((hitsRed === 5 && hitsBlue === 0) || (hitsRed === 4 && hitsBlue === 1))
      return { level: 4, name: '四等奖', amount: 200 };
    if ((hitsRed === 4 && hitsBlue === 0) || (hitsRed === 3 && hitsBlue === 1))
      return { level: 5, name: '五等奖', amount: 10 };
    if (hitsBlue === 1 && hitsRed <= 2) return { level: 6, name: '六等奖', amount: 5 };
    return { level: 0, name: '未中奖', amount: 0 };
  }
  // 大乐透(2019 规则):三~九等固定奖
  if (hitsRed === 5 && hitsBlue === 2) return { level: 1, name: '一等奖', amount: null };
  if (hitsRed === 5 && hitsBlue === 1) return { level: 2, name: '二等奖', amount: null };
  if (hitsRed === 5 && hitsBlue === 0) return { level: 3, name: '三等奖', amount: 10000 };
  if (hitsRed === 4 && hitsBlue === 2) return { level: 4, name: '四等奖', amount: 3000 };
  if (hitsRed === 4 && hitsBlue === 1) return { level: 5, name: '五等奖', amount: 300 };
  if (hitsRed === 3 && hitsBlue === 2) return { level: 6, name: '六等奖', amount: 200 };
  if (hitsRed === 4 && hitsBlue === 0) return { level: 7, name: '七等奖', amount: 100 };
  if ((hitsRed === 3 && hitsBlue === 1) || (hitsRed === 2 && hitsBlue === 2))
    return { level: 8, name: '八等奖', amount: 15 };
  if (
    (hitsRed === 3 && hitsBlue === 0) ||
    (hitsRed === 2 && hitsBlue === 1) ||
    (hitsRed === 1 && hitsBlue === 2) ||
    (hitsRed === 0 && hitsBlue === 2)
  )
    return { level: 9, name: '九等奖', amount: 5 };
  return { level: 0, name: '未中奖', amount: 0 };
}

const issueNum = (issue) => parseInt(issue, 10);

/** 找到比 base_issue 新的最近一期开奖(按期号数值比较,跨年也成立) */
function findNextDraw(lottery, baseIssue) {
  const base = issueNum(baseIssue);
  return db
    .prepare(
      `SELECT * FROM draws
       WHERE lottery = ? AND CAST(issue AS INTEGER) > ?
       ORDER BY CAST(issue AS INTEGER) ASC LIMIT 1`
    )
    .get(lottery, base);
}

function evalRow(row, draw) {
  const reds = JSON.parse(row.reds);
  const blues = JSON.parse(row.blues);
  const hitsRed = reds.filter((n) => draw.reds.includes(n)).length;
  const hitsBlue = blues.filter((n) => draw.blues.includes(n)).length;
  return { hitsRed, hitsBlue, prize: prizeOf(row.lottery, hitsRed, hitsBlue) };
}

// ---------- 预测存档 ----------
const insertPrediction = db.prepare(
  `INSERT INTO predictions (lottery, base_issue, reds, blues, strategy)
   VALUES (@lottery, @baseIssue, @reds, @blues, @strategy)`
);

export function savePredictions(lottery, strategy, bets) {
  const latest = latestDraw(lottery);
  if (!latest || !bets?.length) return 0;
  for (const b of bets) {
    insertPrediction.run({
      lottery,
      baseIssue: latest.issue,
      reds: JSON.stringify(b.reds),
      blues: JSON.stringify(b.blues),
      strategy,
    });
  }
  return bets.length;
}

// ---------- 投注单 ----------
const insertBet = db.prepare(
  `INSERT INTO bets (lottery, base_issue, reds, blues, cost, note, source)
   VALUES (@lottery, @baseIssue, @reds, @blues, @cost, @note, @source)`
);

export function addBet({ lottery, reds, blues, cost = 2, note = '', source = 'manual' }) {
  const latest = latestDraw(lottery);
  if (!latest) throw new Error('该彩种暂无开奖数据,无法创建投注单');
  const info = insertBet.run({
    lottery,
    baseIssue: latest.issue,
    reds: JSON.stringify(reds),
    blues: JSON.stringify(blues),
    cost,
    note,
    source,
  });
  return { id: info.lastInsertRowid };
}

export function deleteBet(id) {
  return db.prepare('DELETE FROM bets WHERE id = ?').run(id).changes;
}

export function listBets(lottery) {
  const rows = db
    .prepare('SELECT * FROM bets WHERE lottery = ? ORDER BY id DESC LIMIT 500')
    .all(lottery);
  const items = rows.map((r) => ({
    id: r.id,
    lottery: r.lottery,
    baseIssue: r.base_issue,
    targetIssue: r.target_issue,
    reds: JSON.parse(r.reds),
    blues: JSON.parse(r.blues),
    cost: r.cost,
    note: r.note,
    source: r.source,
    hitsRed: r.hits_red,
    hitsBlue: r.hits_blue,
    prizeLevel: r.prize_level,
    prizeName: r.prize_name,
    prizeAmount: r.prize_amount,
    createdAt: r.created_at,
    checkedAt: r.checked_at,
  }));
  const summary = {
    totalCost: rows.reduce((a, r) => a + r.cost, 0),
    totalPrize: rows.reduce((a, r) => a + (r.prize_amount || 0), 0),
    pending: rows.filter((r) => r.hits_red === -1).length,
    winCount: rows.filter((r) => r.prize_level > 0).length,
  };
  return { items, summary };
}

// ---------- 预测列表 ----------
export function listPredictions(lottery, strategy = null) {
  const rows = strategy
    ? db.prepare('SELECT * FROM predictions WHERE lottery = ? AND strategy = ? ORDER BY id DESC LIMIT 500').all(lottery, strategy)
    : db.prepare('SELECT * FROM predictions WHERE lottery = ? ORDER BY id DESC LIMIT 500').all(lottery);
  const items = rows.map((r) => ({
    id: r.id,
    lottery: r.lottery,
    baseIssue: r.base_issue,
    targetIssue: r.target_issue,
    reds: JSON.parse(r.reds),
    blues: JSON.parse(r.blues),
    strategy: r.strategy,
    hitsRed: r.hits_red,
    hitsBlue: r.hits_blue,
    prizeLevel: r.prize_level,
    prizeName: r.prize_name,
    createdAt: r.created_at,
    checkedAt: r.checked_at,
  }));

  // 追踪曲线:按期号统计已核对预测的平均红球命中
  const byIssue = new Map();
  for (const it of items) {
    if (it.hitsRed < 0 || !it.targetIssue) continue;
    if (!byIssue.has(it.targetIssue)) byIssue.set(it.targetIssue, { sum: 0, n: 0 });
    const e = byIssue.get(it.targetIssue);
    e.sum += it.hitsRed;
    e.n += 1;
  }
  const trackCurve = [...byIssue.entries()]
    .sort((a, b) => issueNum(a[0]) - issueNum(b[0]))
    .map(([issue, e]) => ({ issue, avgHits: Math.round((e.sum / e.n) * 100) / 100, count: e.n }));

  const checked = items.filter((i) => i.hitsRed >= 0);
  const summary = {
    total: rows.length,
    pending: rows.filter((r) => r.hits_red === -1).length,
    checked: checked.length,
    avgRedHits: checked.length
      ? Math.round((checked.reduce((a, i) => a + i.hitsRed, 0) / checked.length) * 100) / 100
      : 0,
    winCount: checked.filter((i) => i.prizeLevel > 0).length,
  };
  return { items, summary, trackCurve };
}

export function deletePrediction(id) {
  return db.prepare('DELETE FROM predictions WHERE id = ?').run(id).changes;
}

/** 核对某彩种所有待开奖记录(预测 + 投注),返回核对条数 */
export function checkPending(lottery) {
  const predictions = db
    .prepare('SELECT * FROM predictions WHERE lottery = ? AND hits_red = -1')
    .all(lottery);
  const bets = db.prepare('SELECT * FROM bets WHERE lottery = ? AND hits_red = -1').all(lottery);

  let checked = 0;
  const updatePrediction = db.prepare(
    `UPDATE predictions SET target_issue=@target, hits_red=@hr, hits_blue=@hb,
     prize_level=@pl, prize_name=@pn, checked_at=datetime('now','localtime')
     WHERE id=@id`
  );
  const updateBet = db.prepare(
    `UPDATE bets SET target_issue=@target, hits_red=@hr, hits_blue=@hb,
     prize_level=@pl, prize_name=@pn, prize_amount=@pa, checked_at=datetime('now','localtime')
     WHERE id=@id`
  );

  for (const row of predictions) {
    const draw = findNextDraw(lottery, row.base_issue);
    if (!draw) continue;
    const { hitsRed, hitsBlue, prize } = evalRow(row, draw);
    updatePrediction.run({
      id: row.id,
      target: draw.issue,
      hr: hitsRed,
      hb: hitsBlue,
      pl: prize.level,
      pn: prize.name,
    });
    checked++;
  }
  for (const row of bets) {
    const draw = findNextDraw(lottery, row.base_issue);
    if (!draw) continue;
    const { hitsRed, hitsBlue, prize } = evalRow(row, draw);
    updateBet.run({
      id: row.id,
      target: draw.issue,
      hr: hitsRed,
      hb: hitsBlue,
      pl: prize.level,
      pn: prize.name,
      pa: prize.amount || 0,
    });
    checked++;
  }
  return checked;
}
