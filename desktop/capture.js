// 产品截图脚本:用 Electron 无界面遍历各页面并抓图为 PNG
// 用法: 先启动服务(npm run dev 或 npm start),再执行
//   cd desktop && CAPTURE_URL=http://localhost:5173 npx electron capture.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_URL || 'http://localhost:3001';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 每个页面:文件名、路由、等待毫秒、可选注入脚本(触发交互后渲染内容)
const PAGES = [
  { name: '01-首页', url: '/', wait: 4000 },
  { name: '02-历史数据', url: '/history', wait: 4000 },
  { name: '03-走势分析', url: '/trend', wait: 6000 },
  {
    name: '04-智能推荐',
    url: '/recommend',
    wait: 2000,
    action: `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('生成推荐'))?.click()`,
    afterWait: 5000,
  },
  { name: '05-AI深度学习', url: '/dl', wait: 9000 }, // 已训练模型会自动加载概率与推荐
  {
    name: '06-胆拖生成',
    url: '/generator',
    wait: 2500,
    action: `
      const grids = document.querySelectorAll('.ball-grid');
      if (grids[0]) { grids[0].children[6]?.click(); grids[0].children[20]?.click(); }
      if (grids[1]) { grids[1].children[0]?.click(); grids[1].children[1]?.click(); grids[1].children[2]?.click(); }
      setTimeout(() => {
        [...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('生成'))?.click();
      }, 500);
    `,
    afterWait: 5000,
  },
  { name: '07-预测追踪', url: '/predictions', wait: 4500 },
  { name: '08-我的投注', url: '/bets', wait: 4000 },
  { name: '09-统计报告', url: '/report', wait: 5000 },
];

async function captureAll() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setZoomFactor(1);

  for (const p of PAGES) {
    try {
      await win.loadURL(BASE + p.url);
      await sleep(p.wait);
      if (p.action) {
        await win.webContents.executeJavaScript(p.action).catch(() => {});
        await sleep(p.afterWait || 4000);
      }
      const img = await win.webContents.capturePage();
      const file = path.join(OUT, `${p.name}.png`);
      fs.writeFileSync(file, img.toPNG());
      console.log('✓', file);
    } catch (err) {
      console.error('✗', p.name, err.message);
    }
  }
  app.quit();
}

app.whenReady().then(captureAll);
