// 彩票分析与推荐平台 — Electron 桌面端主进程
// 内嵌 Node 运行时启动 Express 服务端 + PyInstaller 打包的 ML 服务,
// 窗口加载本地 http 地址,买家双击即用,无需安装任何环境。
const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const SERVER_PORT = 17891; // 不常见端口,避免与常见开发端口冲突
const ML_PORT = 15001;

let serverProc = null;
let mlProc = null;
let mainWin = null;

function resolveRuntime() {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      node: path.join(res, 'runtime', 'node.exe'),
      serverEntry: path.join(res, 'server', 'src', 'index.js'),
      mlExe: path.join(res, 'ml', 'lottery-ml.exe'),
      mlCwd: path.join(res, 'ml'),
    };
  }
  // 开发模式:使用系统 Node 与本地 ml 虚拟环境
  const root = path.join(__dirname, '..');
  return {
    node: 'node',
    serverEntry: path.join(root, 'server', 'src', 'index.js'),
    mlExe: null,
    mlCmd: path.join(root, 'ml', '.venv', 'Scripts', 'python.exe'),
    mlArgs: ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(ML_PORT)],
    mlCwd: path.join(root, 'ml'),
  };
}

function waitForPort(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.connect({ host: '127.0.0.1', port }, () => {
        sock.end();
        resolve();
      });
      sock.on('error', () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`服务启动超时(端口 ${port})`));
        } else {
          setTimeout(tryConnect, 300);
        }
      });
    };
    tryConnect();
  });
}

function pipeLogs(proc, tag) {
  if (!proc) return;
  proc.stdout?.on('data', (d) => console.log(`[${tag}]`, d.toString().trim()));
  proc.stderr?.on('data', (d) => console.warn(`[${tag}]`, d.toString().trim()));
  proc.on('exit', (code) => console.warn(`[${tag}] 进程退出, code=${code}`));
}

async function startServices() {
  const rt = resolveRuntime();
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  const modelsDir = path.join(userData, 'ml-models');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(modelsDir, { recursive: true });

  const env = {
    ...process.env,
    PORT: String(SERVER_PORT),
    ML_SERVICE_URL: `http://127.0.0.1:${ML_PORT}`,
    LOTTERY_DATA_DIR: dataDir,
  };

  serverProc = spawn(rt.node, [rt.serverEntry], { env, windowsHide: true });
  pipeLogs(serverProc, 'server');

  const mlEnv = { ...process.env, ML_PORT: String(ML_PORT), ML_MODELS_DIR: modelsDir };
  if (rt.mlExe && fs.existsSync(rt.mlExe)) {
    mlProc = spawn(rt.mlExe, [], { env: mlEnv, cwd: rt.mlCwd, windowsHide: true });
    pipeLogs(mlProc, 'ml');
  } else if (rt.mlCmd && fs.existsSync(rt.mlCmd)) {
    mlProc = spawn(rt.mlCmd, rt.mlArgs, { env: mlEnv, cwd: rt.mlCwd, windowsHide: true });
    pipeLogs(mlProc, 'ml');
  } else {
    console.warn('[ml] 未找到 ML 运行时,AI 功能不可用(统计分析功能不受影响)');
  }

  await waitForPort(SERVER_PORT);
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: '#0d1220',
    title: '彩票分析与推荐平台',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadURL(`http://127.0.0.1:${SERVER_PORT}`);
  // 外部链接用系统浏览器打开
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWin.on('closed', () => (mainWin = null));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startServices();
    } catch (err) {
      dialog.showErrorBox('启动失败', String(err.message || err));
    }
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('quit', () => {
    serverProc?.kill();
    mlProc?.kill();
  });
}
