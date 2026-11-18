import { syncLottery } from './syncService.js';
import { dlTrain } from './dlService.js';
import { checkPending } from './trackingService.js';
import { countDraws } from '../db.js';

// 开奖日:双色球 周二/周四/周日;大乐透 周一/周三/周六
const DRAW_DAYS = { ssq: [2, 4, 0], dlt: [1, 3, 6] };
// 官方开奖约 21:15,数据接口通常 21:30 后可用
const SYNC_HOUR = 21;
const SYNC_MINUTE = 40;

const lastSyncDate = { ssq: null, dlt: null }; // 内存记录,防止一天内重复同步
let timer = null;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function syncAndRetrain(lotteryKey, reason) {
  try {
    const result = await syncLottery(lotteryKey);
    console.log(`[scheduler] ${lotteryKey} 同步完成(${reason}):新增 ${result.added},来源 ${result.source}`);
    const checked = checkPending(lotteryKey);
    if (checked > 0) console.log(`[scheduler] ${lotteryKey} 核对了 ${checked} 条预测/投注`);
    // 有新数据且本地已有模型时自动重训
    if (result.added > 0 && countDraws(lotteryKey) > 0) {
      try {
        await dlTrain(lotteryKey);
        console.log(`[scheduler] ${lotteryKey} 模型已自动重训`);
      } catch (e) {
        console.warn(`[scheduler] ${lotteryKey} 自动重训跳过: ${e.message}`);
      }
    }
  } catch (err) {
    console.warn(`[scheduler] ${lotteryKey} 同步失败: ${err.message}`);
  }
}

function tick() {
  const now = new Date();
  const day = now.getDay();
  const hh = now.getHours();
  const mm = now.getMinutes();
  if (hh < SYNC_HOUR || (hh === SYNC_HOUR && mm < SYNC_MINUTE)) return;

  for (const [lottery, days] of Object.entries(DRAW_DAYS)) {
    if (!days.includes(day)) continue;
    if (lastSyncDate[lottery] === todayStr()) continue;
    lastSyncDate[lottery] = todayStr();
    syncAndRetrain(lottery, `开奖日 ${SYNC_HOUR}:${SYNC_MINUTE} 后自动同步`);
  }
}

/** 启动定时器;intervalMinutes 为检查间隔 */
export function startScheduler(intervalMinutes = 30) {
  if (timer) return;
  timer = setInterval(tick, intervalMinutes * 60 * 1000);
  timer.unref?.();
  console.log(`[scheduler] 定时同步已启动(每 ${intervalMinutes} 分钟检查,开奖日 ${SYNC_HOUR}:${SYNC_MINUTE} 后执行)`);
}

export { syncAndRetrain };
