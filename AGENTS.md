# 项目说明(AGENTS.md)

## 项目

彩票分析与推荐平台:Vue3 + Express + better-sqlite3,支持双色球(ssq)与大乐透(dlt)。

## 结构

- `ml/` — Python AI 服务,FastAPI,端口 5001(`ml/.venv` 独立虚拟环境,PyTorch CPU);`lottery_lstm.py` 含模型/训练/回测/选号过滤,模型产物在 `ml/models/`(不入库)
- `server/` — Express 后端,端口 3001,ESM(`"type": "module"`),Node ≥ 18
  - `src/config.js` 彩种元信息(号码范围、官方接口地址),新增彩种在此扩展
  - `src/db.js` SQLite 数据访问层(draws/predictions/bets 三表;draws 唯一约束 lottery+issue,upsert 语义)
  - `src/services/trackingService.js` 预测存档 + 投注单 + 中奖规则 `prizeOf()`(双色球六等/大乐透九等)+ 开奖后自动核对 `checkPending()`
  - `src/services/generatorService.js` 胆拖/杀号组合生成(带均衡/和值/连号过滤)
  - `src/services/schedulerService.js` 定时任务:开奖日 21:40 后自动同步→核对→重训(内存记录当日已同步状态)
  - `src/services/syncService.js` 官方数据抓取;失败时若库空则写 seed 兜底(source 字段:official/seed/manual)
  - `src/services/analysisService.js` 冷热/遗漏/走势/统计计算
  - `src/services/recommendService.js` 推荐算法(balanced/hot/cold 三策略 + 过滤规则)
  - `src/services/dlService.js` Python AI 服务代理(默认 127.0.0.1:5001,`ML_SERVICE_URL` 可覆盖);不可达时抛出带启动指引的错误;训练/预测取库中最近 1000 期(`MAX_DRAWS_FOR_ML`)
  - `src/services/syncService.js` 官方数据同步,默认抓 1000 期(体彩接口单页上限 100,自动分页)
  - server dev 脚本用 `node --watch-path=src`(不能裸 `--watch`,否则 SQLite 写入会触发重启)
- `web/` — Vue3 + Vite + Pinia + Vue Router + ECharts + Element Plus(中文语言包)
  - `src/api/index.js` 统一 fetch 封装,错误抛出 `Error(data.error)`
  - `src/components/Chart.vue` ECharts 封装(shallowRef + ResizeObserver)
  - `src/views/` 五个页面:Home / History / Trend / Recommend / Report

## 约定

- 后端返回错误统一为 `{ error: string }`,HTTP 4xx/5xx
- 开奖号码 reds/blues 以 JSON 字符串存储,读出后为升序整数数组
- 前端深色主题样式在 `web/src/styles.css`(CSS 变量),Element Plus 深色适配也在其中
- 数据库文件 `server/data/lottery.db` 与 `ml/models/` 训练产物均为运行时产物,已 gitignore
- ML 训练/预测数据由 Node 从 SQLite 组装、以旧→新时序 POST 给 Python 服务,Python 不直接访问数据库
- 新增彩种需同步修改:`server/src/config.js`、`web` 中 metaMap(各视图)、`ml` 的 spec 由 Node 端动态下发无需改 Python

- 定时任务:`server/src/services/schedulerService.js`,开奖日 21:40 后自动同步→核对→重训(内存记录当日已同步状态)

## 常用命令

```bash
npm run dev      # 开发模式(server 3001 + web 5173 + ml 5001)
npm run ml       # 仅启动 AI 服务
npm run build    # 构建前端到 server/public
npm start        # 生产模式单端口 3001(AI 服务需另行 npm run ml)
```

## 桌面端(desktop/)

- `main.js` Electron 主进程:内嵌 `runtime/node.exe` 启动 server、内嵌 `ml-dist/lottery-ml/`(PyInstaller onedir)启动 ML,窗口加载 127.0.0.1:17891;数据/模型写入系统 userData 目录(经 `LOTTERY_DATA_DIR`/`ML_MODELS_DIR` 环境变量)
- 打包:`cd desktop && npm install && npx electron-builder --win`(NSIS 安装包,产物在 `desktop/release/`)
- ML 重新打包:在 `ml/` 下用 venv 执行 PyInstaller(见 `desktop/package.json` extraResources 引用 `ml-dist/lottery-ml`)
- `capture.js` 产品截图脚本:`CAPTURE_URL=http://localhost:5173 npx electron capture.js`
- 销售物料:`docs/产品说明与销售文案.md` + `docs/screenshots/`(9 张)

