<template>
  <div>
    <h2 class="page-title">🤖 AI 深度学习预测</h2>
    <p class="page-sub">LSTM 时序神经网络学习开奖序列特征 · 输出各号码概率并生成推荐 · 仅供娱乐参考</p>

    <div class="panel">
      <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap">
        <LotteryTabs v-model="lottery" />
        <el-button type="warning" :loading="training" :disabled="predicting" @click="handleTrain">
          {{ trained ? '🔄 重新训练模型' : '🧠 训练模型' }}
        </el-button>
        <el-button type="primary" :loading="predicting" :disabled="!trained" @click="handlePredict">
          🎲 生成 AI 推荐
        </el-button>
        <el-button :loading="backtesting" :disabled="!trained" @click="handleBacktest">
          📐 回测评估
        </el-button>
        <span v-if="statusMeta" class="text-dim" style="font-size: 13px">
          最近训练:{{ statusMeta.trainedAt }} · 迭代 {{ statusMeta.epochs }} 轮 · 样本 {{ statusMeta.samples }} 期
        </span>
      </div>
      <el-alert
        v-if="mlError"
        :title="mlError"
        type="error"
        show-icon
        :closable="false"
        style="margin-top: 14px"
      />
      <el-alert
        v-else-if="!trained && !loadingStatus"
        title="该彩种尚未训练模型。训练将自动同步最近 300 期官方数据,由 LSTM 神经网络学习走势特征(CPU 上约需 1-3 分钟)。"
        type="info"
        show-icon
        :closable="false"
        style="margin-top: 14px"
      />
    </div>

    <el-skeleton v-if="loadingStatus || training" :rows="6" animated style="--el-skeleton-color: #1d2740" />

    <template v-if="trained && !training">
      <!-- 训练指标 -->
      <div class="grid-2" v-if="statusMeta">
        <div class="panel">
          <h3 class="panel-title">训练指标</h3>
          <div class="stat-cards" style="margin-bottom: 0">
            <div class="stat-card">
              <div class="label">最终训练损失</div>
              <div class="value" style="font-size: 18px">{{ statusMeta.finalTrainLoss }}</div>
            </div>
            <div class="stat-card">
              <div class="label">最终验证损失</div>
              <div class="value" style="font-size: 18px">{{ statusMeta.finalValLoss }}</div>
            </div>
            <div class="stat-card">
              <div class="label">时序窗口 / 隐层</div>
              <div class="value" style="font-size: 18px">{{ statusMeta.window }} / {{ statusMeta.hidden }}</div>
            </div>
          </div>
        </div>
        <div class="panel">
          <h3 class="panel-title">损失曲线(训练 vs 验证)</h3>
          <Chart :option="lossOption" :height="220" />
        </div>
      </div>

      <!-- 回测评估 -->
      <div v-if="backtestResult" class="panel">
        <h3 class="panel-title">
          📐 Walk-Forward 回测(最近 {{ backtestResult.points }} 期 · 每期用之前全部数据重新训练)
        </h3>
        <div class="stat-cards">
          <div class="stat-card">
            <div class="label">TOP-{{ redCount }} 平均命中 / 随机基准</div>
            <div class="value" style="font-size: 18px">
              {{ backtestResult.redAvgHitsTopK }} <span class="text-dim">/ {{ backtestResult.baselineTopK }}</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="label">TOP-{{ redCount * 2 }} 平均命中 / 随机基准</div>
            <div class="value" style="font-size: 18px">
              {{ backtestResult.redAvgHitsTop2K }} <span class="text-dim">/ {{ backtestResult.baselineTop2K }}</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="label">蓝球 TOP-3 命中 / 随机基准</div>
            <div class="value" style="font-size: 18px">
              {{ backtestResult.blueAvgHitsTop3 }} <span class="text-dim">/ {{ backtestResult.baselineBlueTop3 }}</span>
            </div>
          </div>
        </div>
        <el-alert
          :type="modelBeatsRandom ? 'success' : 'warning'"
          :closable="false"
          show-icon
          style="margin-bottom: 14px"
          :title="modelBeatsRandom
            ? '模型命中高于随机基准,说明学到了短期统计特征(样本有限,不代表未来)'
            : '模型命中不高于随机基准,符合摇奖独立随机的特性 —— 请理性看待 AI 预测'"
        />
        <Chart :option="backtestOption" :height="300" />
      </div>

      <!-- 概率输出 -->
      <div v-if="prediction" class="panel">
        <h3 class="panel-title">模型输出概率(下一期各号码出现概率估计)</h3>
        <Chart :option="redProbOption" :height="300" />
        <Chart :option="blueProbOption" :height="220" style="margin-top: 16px" />
      </div>

      <!-- AI 推荐号码 -->
      <div v-if="prediction" class="panel">
        <h3 class="panel-title">🎲 AI 推荐号码(基于模型概率加权采样 + 均衡过滤)</h3>
        <div class="bet-grid">
          <div v-for="(bet, i) in prediction.bets" :key="i" class="bet-card">
            <div class="bet-index">第 {{ i + 1 }} 注</div>
            <BallGroup :reds="bet.reds" :blues="bet.blues" size="lg" />
            <div class="bet-footer">
              <span class="bet-meta text-dim">{{ redLabel }}和值 {{ bet.sum }}</span>
              <el-button size="small" text type="primary" @click="addBet(bet)">🎯 加入投注</el-button>
            </div>
          </div>
        </div>
        <el-empty v-if="!prediction.bets.length" description="未能生成符合条件的号码,请重试" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import BallGroup from '../components/BallGroup.vue';
import LotteryTabs from '../components/LotteryTabs.vue';
import Chart from '../components/Chart.vue';

const lottery = ref('ssq');
const trained = ref(false);
const statusMeta = ref(null);
const prediction = ref(null);
const mlError = ref('');
const loadingStatus = ref(false);
const training = ref(false);
const predicting = ref(false);
const backtesting = ref(false);
const backtestResult = ref(null);

const redLabel = computed(() => (lottery.value === 'ssq' ? '红球' : '前区'));
const redCount = computed(() => (lottery.value === 'ssq' ? 6 : 5));

const modelBeatsRandom = computed(() =>
  !!backtestResult.value &&
  backtestResult.value.redAvgHitsTop2K > backtestResult.value.baselineTop2K
);
const blueLabel = computed(() => (lottery.value === 'ssq' ? '蓝球' : '后区'));

async function loadStatus() {
  loadingStatus.value = true;
  mlError.value = '';
  try {
    const res = await api.dlStatus(lottery.value);
    trained.value = res.trained;
    statusMeta.value = res.trained ? res.meta : null;
    if (res.trained) await handlePredict(false); // 自动加载不存档,避免刷页面产生重复记录
  } catch (err) {
    trained.value = false;
    statusMeta.value = null;
    mlError.value = err.message;
  } finally {
    loadingStatus.value = false;
  }
}

async function handleTrain() {
  training.value = true;
  mlError.value = '';
  try {
    const res = await api.dlTrain(lottery.value);
    trained.value = true;
    statusMeta.value = res.meta;
    ElMessage.success(`训练完成:${res.meta.epochs} 轮,验证损失 ${res.meta.finalValLoss}`);
    await handlePredict();
  } catch (err) {
    mlError.value = err.message;
    ElMessage.error(err.message);
  } finally {
    training.value = false;
  }
}

async function handlePredict(save = true) {
  predicting.value = true;
  try {
    prediction.value = await api.dlPredict(lottery.value, 5, save);
    if (save && prediction.value.saved) {
      ElMessage.success(`已生成并存档 ${prediction.value.saved} 条预测,开奖后可在「预测追踪」查看命中`);
    }
  } catch (err) {
    mlError.value = err.message;
    ElMessage.error(err.message);
  } finally {
    predicting.value = false;
  }
}

async function addBet(bet) {
  try {
    await api.addBet({
      lottery: lottery.value,
      reds: bet.reds,
      blues: bet.blues,
      cost: 2,
      source: 'dl',
      note: 'LSTM AI 推荐',
    });
    ElMessage.success('已加入投注单,可到「我的投注」查看');
  } catch (err) {
    ElMessage.error(err.message);
  }
}

async function handleBacktest() {
  backtesting.value = true;
  try {
    const res = await api.dlBacktest(lottery.value, 20, 60);
    backtestResult.value = res.result;
  } catch (err) {
    mlError.value = err.message;
    ElMessage.error(err.message);
  } finally {
    backtesting.value = false;
  }
}

const backtestOption = computed(() => {
  const r = backtestResult.value;
  if (!r) return {};
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [`TOP-${redCount.value}命中`, '随机基准'], textStyle: { color: '#8b96b3' }, top: 0 },
    grid: { left: 40, right: 20, top: 36, bottom: 26 },
    xAxis: { type: 'category', data: r.details.map((d) => d.issue), axisLabel: { color: '#8b96b3' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#8b96b3' }, splitLine: { lineStyle: { color: '#2a3554' } } },
    series: [
      {
        name: `TOP-${redCount.value}命中`, type: 'bar', data: r.details.map((d) => d.hitsTop),
        itemStyle: { color: '#e84545', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '随机基准', type: 'line', data: r.details.map(() => r.baselineTopK),
        itemStyle: { color: '#f0b429' }, showSymbol: false, lineStyle: { type: 'dashed' },
      },
    ],
  };
});

const lossOption = computed(() => {
  const h = statusMeta.value?.history || [];
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['训练损失', '验证损失'], textStyle: { color: '#8b96b3' }, top: 0 },
    grid: { left: 50, right: 20, top: 36, bottom: 26 },
    xAxis: { type: 'category', data: h.map((p) => p.epoch), axisLabel: { color: '#8b96b3' }, name: '轮次' },
    yAxis: { type: 'value', axisLabel: { color: '#8b96b3' }, splitLine: { lineStyle: { color: '#2a3554' } } },
    series: [
      {
        name: '训练损失', type: 'line', smooth: true, data: h.map((p) => p.train),
        itemStyle: { color: '#3b82f6' }, showSymbol: false,
      },
      {
        name: '验证损失', type: 'line', smooth: true, data: h.map((p) => p.val),
        itemStyle: { color: '#f0b429' }, showSymbol: false,
      },
    ],
  };
});

function probBarOption(probs, topCount, color, topColor, label) {
  // probs 已按概率降序(来自后端 top 排序),按号码顺序展示
  const sortedByNum = [...probs].sort((a, b) => a.num - b.num);
  const topNums = new Set(probs.slice(0, topCount).map((p) => p.num));
  return {
    tooltip: { trigger: 'axis', formatter: (ps) => `${label} ${ps[0].axisValue} 号:概率 ${(ps[0].data * 100).toFixed(1)}%` },
    grid: { left: 50, right: 20, top: 20, bottom: 26 },
    xAxis: { type: 'category', data: sortedByNum.map((p) => p.num), axisLabel: { color: '#8b96b3' } },
    yAxis: {
      type: 'value', axisLabel: { color: '#8b96b3', formatter: (v) => `${(v * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#2a3554' } },
    },
    series: [
      {
        type: 'bar',
        barWidth: '60%',
        data: sortedByNum.map((p) => ({
          value: p.prob,
          itemStyle: { color: topNums.has(p.num) ? topColor : color, borderRadius: [3, 3, 0, 0] },
        })),
      },
    ],
  };
}

const redProbOption = computed(() => {
  if (!prediction.value) return {};
  const spec = prediction.value.meta.spec;
  return probBarOption(prediction.value.redProbs, spec.redCount, '#3a4560', '#e84545', redLabel.value);
});

const blueProbOption = computed(() => {
  if (!prediction.value) return {};
  const spec = prediction.value.meta.spec;
  return probBarOption(prediction.value.blueProbs, spec.blueCount, '#31445f', '#3b82f6', blueLabel.value);
});

watch(lottery, () => {
  prediction.value = null;
  backtestResult.value = null;
  loadStatus();
});
loadStatus();
</script>

<style scoped>
.bet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

.bet-card {
  background: var(--panel-light);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  transition: all 0.2s;
}

.bet-card:hover {
  border-color: var(--gold);
}

.bet-index {
  font-size: 13px;
  color: var(--gold);
  font-weight: 600;
  margin-bottom: 10px;
}

.bet-meta {
  margin-top: 10px;
  font-size: 12px;
}

.bet-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
</style>
