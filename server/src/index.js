import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

// 生产模式:托管前端构建产物(若存在)
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// 首次启动:若无数据则写入示例数据兜底
import { countDraws } from './db.js';
import { syncLottery } from './services/syncService.js';
import { startScheduler } from './services/schedulerService.js';
for (const key of ['ssq', 'dlt']) {
  if (countDraws(key) === 0) {
    syncLottery(key)
      .then((r) => console.log(`[init] ${key}: ${r.added} 条 (${r.source})`))
      .catch((e) => console.warn(`[init] ${key} 初始化失败:`, e.message));
  }
}

app.listen(PORT, () => {
  console.log(`Lottery server listening on http://localhost:${PORT}`);
  startScheduler(30); // 开奖日自动同步 + 核对 + 重训
});
