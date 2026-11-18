import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 桌面版(Electron)通过环境变量指定可写的数据目录;默认仍用项目内 data/
const dataDir = process.env.LOTTERY_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'lottery.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery TEXT NOT NULL,
  issue TEXT NOT NULL,
  date TEXT NOT NULL,
  reds TEXT NOT NULL,
  blues TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(lottery, issue)
);
CREATE INDEX IF NOT EXISTS idx_draws_lottery_issue ON draws(lottery, issue DESC);

-- 预测存档(AI/统计策略每次推荐自动留存,开奖后自动核对)
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery TEXT NOT NULL,
  base_issue TEXT NOT NULL,        -- 生成时的最新期号
  target_issue TEXT,               -- 核对时匹配到的开奖期号
  reds TEXT NOT NULL,
  blues TEXT NOT NULL,
  strategy TEXT DEFAULT 'dl',
  hits_red INTEGER DEFAULT -1,     -- -1 = 待开奖
  hits_blue INTEGER DEFAULT -1,
  prize_level INTEGER DEFAULT 0,   -- 0 = 未中奖或未核对
  prize_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  checked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_predictions_lottery ON predictions(lottery, id DESC);

-- 我的投注单
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lottery TEXT NOT NULL,
  base_issue TEXT NOT NULL,
  target_issue TEXT,
  reds TEXT NOT NULL,
  blues TEXT NOT NULL,
  cost INTEGER DEFAULT 2,
  note TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',    -- manual / recommend / dl
  hits_red INTEGER DEFAULT -1,
  hits_blue INTEGER DEFAULT -1,
  prize_level INTEGER DEFAULT 0,
  prize_name TEXT,
  prize_amount INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  checked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bets_lottery ON bets(lottery, id DESC);
`);

// ---------- 数据访问 ----------
const insertStmt = db.prepare(
  `INSERT INTO draws (lottery, issue, date, reds, blues, source)
   VALUES (@lottery, @issue, @date, @reds, @blues, @source)
   ON CONFLICT(lottery, issue) DO UPDATE SET
     date=excluded.date, reds=excluded.reds, blues=excluded.blues,
     source=excluded.source`
);

export function upsertDraw({ lottery, issue, date, reds, blues, source = 'manual' }) {
  insertStmt.run({
    lottery,
    issue: String(issue),
    date,
    reds: JSON.stringify(reds),
    blues: JSON.stringify(blues),
    source,
  });
}

const rowToDraw = (row) => ({
  id: row.id,
  lottery: row.lottery,
  issue: row.issue,
  date: row.date,
  reds: JSON.parse(row.reds),
  blues: JSON.parse(row.blues),
  source: row.source,
});

export function listDraws(lottery, page = 1, size = 30) {
  const total = db
    .prepare('SELECT COUNT(*) AS c FROM draws WHERE lottery = ?')
    .get(lottery).c;
  const rows = db
    .prepare(
      'SELECT * FROM draws WHERE lottery = ? ORDER BY issue DESC LIMIT ? OFFSET ?'
    )
    .all(lottery, size, (page - 1) * size);
  return { total, page, size, items: rows.map(rowToDraw) };
}

export function recentDraws(lottery, limit = 30) {
  const rows = db
    .prepare(
      'SELECT * FROM draws WHERE lottery = ? ORDER BY issue DESC LIMIT ?'
    )
    .all(lottery, limit);
  return rows.map(rowToDraw);
}

export function latestDraw(lottery) {
  const row = db
    .prepare(
      'SELECT * FROM draws WHERE lottery = ? ORDER BY issue DESC LIMIT 1'
    )
    .get(lottery);
  return row ? rowToDraw(row) : null;
}

export function countDraws(lottery) {
  return db.prepare('SELECT COUNT(*) AS c FROM draws WHERE lottery = ?').get(lottery).c;
}

export function getMaxIssue(lottery) {
  const row = db
    .prepare('SELECT MAX(issue) AS m FROM draws WHERE lottery = ?')
    .get(lottery);
  return row?.m || null;
}

export function insertDraw({ lottery, issue, date, reds, blues }) {
  const info = insertStmt.run({
    lottery,
    issue: String(issue),
    date,
    reds: JSON.stringify(reds),
    blues: JSON.stringify(blues),
    source: 'manual',
  });
  return { id: info.lastInsertRowid };
}

export function deleteDraw(id) {
  return db.prepare('DELETE FROM draws WHERE id = ?').run(id).changes;
}

export default db;
