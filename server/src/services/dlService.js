import { LOTTERIES } from '../config.js';
import { recentDraws, latestDraw } from '../db.js';

const ML_BASE = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';
const MAX_DRAWS_FOR_ML = 1000; // 训练/预测使用库中最近 1000 期

class MLUnavailableError extends Error {
  constructor(cause) {
    super(
      `AI 深度学习服务未启动或不可达(${cause})。请先运行: cd ml && .venv/Scripts/python.exe -m uvicorn app:app --port 5001`
    );
    this.code = 'ML_UNAVAILABLE';
  }
}

async function mlFetch(path, body, timeoutMs = 300000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ML_BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || `ML 服务返回 HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new MLUnavailableError('请求超时');
    if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED' || err instanceof TypeError) {
      throw new MLUnavailableError(err.message);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 旧→新 排序的开奖数据(ML 训练/预测需要时序顺序) */
function chronologicalDraws(lotteryKey, limit = MAX_DRAWS_FOR_ML) {
  return recentDraws(lotteryKey, limit)
    .reverse()
    .map((d) => ({ issue: d.issue, date: d.date, reds: d.reds, blues: d.blues }));
}

function specOf(lotteryKey) {
  const meta = LOTTERIES[lotteryKey];
  return {
    redMax: meta.red.max,
    redCount: meta.red.count,
    blueMax: meta.blue.max,
    blueCount: meta.blue.count,
  };
}

export async function dlStatus(lotteryKey) {
  return mlFetch(`/status/${lotteryKey}`);
}

export async function dlTrain(lotteryKey) {
  return mlFetch('/train', {
    lottery: lotteryKey,
    spec: specOf(lotteryKey),
    draws: chronologicalDraws(lotteryKey),
  });
}

export async function dlBacktest(lotteryKey, points = 20, epochs = 60) {
  return mlFetch('/backtest', {
    lottery: lotteryKey,
    spec: specOf(lotteryKey),
    draws: chronologicalDraws(lotteryKey),
    points,
    epochs,
  });
}

export async function dlPredict(lotteryKey, count = 5) {
  const latest = latestDraw(lotteryKey);
  return mlFetch('/predict', {
    lottery: lotteryKey,
    spec: specOf(lotteryKey),
    count,
    draws: chronologicalDraws(lotteryKey),
    latestReds: latest ? latest.reds : [],
  });
}

export { ML_BASE, MAX_DRAWS_FOR_ML };
