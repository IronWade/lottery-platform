import { Router } from 'express';
import { LOTTERIES, VALID_LOTTERIES } from '../config.js';
import { listDraws, insertDraw, deleteDraw, latestDraw, countDraws } from '../db.js';
import { syncLottery } from '../services/syncService.js';
import { getOverview, getTrend, getReport } from '../services/analysisService.js';
import { getRecommendations, STRATEGIES, STRATEGY_NAMES } from '../services/recommendService.js';
import { dlStatus, dlTrain, dlPredict, dlBacktest } from '../services/dlService.js';
import {
  savePredictions,
  addBet,
  deleteBet,
  listBets,
  listPredictions,
  deletePrediction,
  checkPending,
} from '../services/trackingService.js';
import { generateTickets } from '../services/generatorService.js';

const router = Router();

function checkLottery(req, res) {
  const lottery = req.query.lottery || req.body?.lottery;
  if (!VALID_LOTTERIES.includes(lottery)) {
    res.status(400).json({ error: `lottery 必须是: ${VALID_LOTTERIES.join(' / ')}` });
    return null;
  }
  return lottery;
}

// 彩种元信息
router.get('/meta', (req, res) => {
  res.json({
    lotteries: Object.values(LOTTERIES).map(({ key, name, red, blue }) => ({
      key,
      name,
      red,
      blue,
    })),
    strategies: STRATEGIES.map((k) => ({ key: k, name: STRATEGY_NAMES[k] })),
  });
});

// 各彩种最新一期 + 数据量(首页用)
router.get('/latest', (req, res) => {
  const result = {};
  for (const key of VALID_LOTTERIES) {
    result[key] = { latest: latestDraw(key), total: countDraws(key) };
  }
  res.json(result);
});

// 历史开奖(分页)
router.get('/draws', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(req.query.size, 10) || 30, 1), 200);
  res.json(listDraws(lottery, page, size));
});

// 同步官方数据(同步后自动核对预测/投注)
router.post('/draws/sync', async (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  try {
    const result = await syncLottery(lottery);
    result.checked = checkPending(lottery);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// 导出 CSV(带 BOM,Excel 中文兼容)
router.get('/draws/export', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const meta = LOTTERIES[lottery];
  const { items } = listDraws(lottery, 1, 2000);
  const header = ['期号', '日期', `${meta.red.label}(${meta.red.count})`, `${meta.blue.label}(${meta.blue.count})`, '来源'];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = items
    .slice()
    .reverse()
    .map((d) =>
      [d.issue, d.date, d.reds.join(' '), d.blues.join(' '), d.source].map(esc).join(',')
    );
  const csv = '﻿' + header.map(esc).join(',') + '\n' + lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${lottery}_draws.csv"`);
  res.send(csv);
});

// 手动录入一期
router.post('/draws', (req, res) => {
  const { lottery, issue, date, reds, blues } = req.body || {};
  if (!VALID_LOTTERIES.includes(lottery)) {
    return res.status(400).json({ error: `lottery 必须是: ${VALID_LOTTERIES.join(' / ')}` });
  }
  const meta = LOTTERIES[lottery];
  const validNums = (arr, cfg) =>
    Array.isArray(arr) &&
    arr.length === cfg.count &&
    [...new Set(arr)].length === cfg.count &&
    arr.every((n) => Number.isInteger(n) && n >= cfg.min && n <= cfg.max);
  if (!validNums(reds, meta.red) || !validNums(blues, meta.blue)) {
    return res.status(400).json({
      error: `号码不合法:${meta.red.label}需 ${meta.red.count} 个(${meta.red.min}-${meta.red.max})不重复整数,${meta.blue.label}需 ${meta.blue.count} 个(${meta.blue.min}-${meta.blue.max})`,
    });
  }
  if (!issue || !date) {
    return res.status(400).json({ error: '期号与日期不能为空' });
  }
  const info = insertDraw({
    lottery,
    issue: String(issue),
    date: String(date).slice(0, 10),
    reds: [...reds].sort((a, b) => a - b),
    blues: [...blues].sort((a, b) => a - b),
  });
  res.status(201).json(info);
});

// 删除一期
router.delete('/draws/:id', (req, res) => {
  const changes = deleteDraw(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: '记录不存在' });
  res.json({ deleted: changes });
});

// 综合概览
router.get('/analysis/overview', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const periods = Math.min(Math.max(parseInt(req.query.periods, 10) || 30, 5), 200);
  try {
    res.json(getOverview(lottery, periods));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// 走势图
router.get('/analysis/trend', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const periods = Math.min(Math.max(parseInt(req.query.periods, 10) || 30, 5), 100);
  try {
    res.json(getTrend(lottery, periods));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// 统计报告
router.get('/report', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const periods = Math.min(Math.max(parseInt(req.query.periods, 10) || 100, 20), 500);
  try {
    res.json(getReport(lottery, periods));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// 智能推荐(save=1 时自动存档为预测)
router.get('/recommend', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  try {
    const result = getRecommendations(lottery, req.query.strategy || 'balanced', req.query.count, req.query.periods);
    if (req.query.save === '1') {
      result.saved = savePredictions(lottery, result.strategy, result.bets);
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// ---------- 深度学习(AI) ----------

// 模型状态
router.get('/dl/status', async (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  try {
    res.json(await dlStatus(lottery));
  } catch (err) {
    res.status(503).json({ error: err.message, mlUnavailable: true });
  }
});

// 训练模型(同步最新数据后训练,可能需要 1-3 分钟)
router.post('/dl/train', async (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  try {
    // 训练前先尝试同步,保证数据最新
    await syncLottery(lottery);
    const result = await dlTrain(lottery);
    result.checked = checkPending(lottery);
    res.json(result);
  } catch (err) {
    res.status(err.code === 'ML_UNAVAILABLE' ? 503 : 400).json({
      error: err.message,
      mlUnavailable: err.code === 'ML_UNAVAILABLE',
    });
  }
});

// 回测评估(walk-forward,需数十秒)
router.post('/dl/backtest', async (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const points = Math.min(Math.max(parseInt(req.body?.points, 10) || 20, 5), 40);
  const epochs = Math.min(Math.max(parseInt(req.body?.epochs, 10) || 60, 20), 100);
  try {
    res.json(await dlBacktest(lottery, points, epochs));
  } catch (err) {
    res.status(err.code === 'ML_UNAVAILABLE' ? 503 : 400).json({
      error: err.message,
      mlUnavailable: err.code === 'ML_UNAVAILABLE',
    });
  }
});

// 模型预测推荐
router.get('/dl/predict', async (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 5, 1), 20);
  try {
    const result = await dlPredict(lottery, count);
    if (req.query.save === '1') {
      result.saved = savePredictions(lottery, 'dl', result.bets);
    }
    res.json(result);
  } catch (err) {
    res.status(err.code === 'ML_UNAVAILABLE' ? 503 : 400).json({
      error: err.message,
      mlUnavailable: err.code === 'ML_UNAVAILABLE',
    });
  }
});

// ---------- 预测追踪 ----------
router.get('/predictions', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  const strategy = req.query.strategy || null;
  try {
    res.json(listPredictions(lottery, strategy));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

router.delete('/predictions/:id', (req, res) => {
  const changes = deletePrediction(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: '记录不存在' });
  res.json({ deleted: changes });
});

// ---------- 我的投注 ----------
router.get('/bets', (req, res) => {
  const lottery = checkLottery(req, res);
  if (!lottery) return;
  res.json(listBets(lottery));
});

router.post('/bets', (req, res) => {
  const { lottery, reds, blues, cost, note, source } = req.body || {};
  if (!VALID_LOTTERIES.includes(lottery)) {
    return res.status(400).json({ error: `lottery 必须是: ${VALID_LOTTERIES.join(' / ')}` });
  }
  const meta = LOTTERIES[lottery];
  const validNums = (arr, cfg) =>
    Array.isArray(arr) &&
    arr.length === cfg.count &&
    [...new Set(arr)].length === cfg.count &&
    arr.every((n) => Number.isInteger(n) && n >= cfg.min && n <= cfg.max);
  if (!validNums(reds, meta.red) || !validNums(blues, meta.blue)) {
    return res.status(400).json({ error: '号码不合法:数量/范围/重复校验未通过' });
  }
  try {
    res.status(201).json(
      addBet({
        lottery,
        reds: [...reds].sort((a, b) => a - b),
        blues: [...blues].sort((a, b) => a - b),
        cost: Math.min(Math.max(parseInt(cost, 10) || 2, 2), 20000),
        note: String(note || '').slice(0, 100),
        source: ['manual', 'recommend', 'dl', 'generator'].includes(source) ? source : 'manual',
      })
    );
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

router.delete('/bets/:id', (req, res) => {
  const changes = deleteBet(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: '记录不存在' });
  res.json({ deleted: changes });
});

// ---------- 胆拖/杀号生成器 ----------
router.post('/generator', (req, res) => {
  const { lottery, dan, kill, maxBets, filters } = req.body || {};
  if (!VALID_LOTTERIES.includes(lottery)) {
    return res.status(400).json({ error: `lottery 必须是: ${VALID_LOTTERIES.join(' / ')}` });
  }
  try {
    res.json(generateTickets(lottery, { dan, kill, maxBets, filters }));
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

export default router;
