// 统一 API 封装
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (HTTP ${res.status})`);
  }
  return data;
}

export const api = {
  meta: () => request('/api/meta'),
  latest: () => request('/api/latest'),

  draws: (lottery, page = 1, size = 30) =>
    request(`/api/draws?lottery=${lottery}&page=${page}&size=${size}`),
  sync: (lottery) =>
    request(`/api/draws/sync`, { method: 'POST', body: JSON.stringify({ lottery }) }),
  addDraw: (payload) =>
    request(`/api/draws`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteDraw: (id) => request(`/api/draws/${id}`, { method: 'DELETE' }),

  overview: (lottery, periods = 30) =>
    request(`/api/analysis/overview?lottery=${lottery}&periods=${periods}`),
  trend: (lottery, periods = 30) =>
    request(`/api/analysis/trend?lottery=${lottery}&periods=${periods}`),
  report: (lottery, periods = 100) =>
    request(`/api/report?lottery=${lottery}&periods=${periods}`),
  recommend: (lottery, strategy = 'balanced', count = 5, periods = 30, save = false) =>
    request(
      `/api/recommend?lottery=${lottery}&strategy=${strategy}&count=${count}&periods=${periods}${save ? '&save=1' : ''}`
    ),

  // 深度学习
  dlStatus: (lottery) => request(`/api/dl/status?lottery=${lottery}`),
  dlTrain: (lottery) =>
    request(`/api/dl/train`, { method: 'POST', body: JSON.stringify({ lottery }) }),
  dlPredict: (lottery, count = 5, save = false) =>
    request(`/api/dl/predict?lottery=${lottery}&count=${count}${save ? '&save=1' : ''}`),
  dlBacktest: (lottery, points = 20, epochs = 60) =>
    request(`/api/dl/backtest`, {
      method: 'POST',
      body: JSON.stringify({ lottery, points, epochs }),
    }),

  // 导出
  exportCsv: (lottery) => {
    window.open(`/api/draws/export?lottery=${lottery}`, '_blank');
  },

  // 胆拖生成器
  generator: (payload) =>
    request(`/api/generator`, { method: 'POST', body: JSON.stringify(payload) }),

  // 预测追踪
  predictions: (lottery, strategy = '') =>
    request(`/api/predictions?lottery=${lottery}&strategy=${strategy}`),
  deletePrediction: (id) => request(`/api/predictions/${id}`, { method: 'DELETE' }),

  // 我的投注
  bets: (lottery) => request(`/api/bets?lottery=${lottery}`),
  addBet: (payload) => request(`/api/bets`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteBet: (id) => request(`/api/bets/${id}`, { method: 'DELETE' }),
};
