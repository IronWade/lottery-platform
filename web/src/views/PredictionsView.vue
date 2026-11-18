<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px">
      <div>
        <h2 class="page-title">📋 预测追踪</h2>
        <p class="page-sub">每次 AI / 统计推荐自动存档 · 新期开奖后自动核对命中 · 最诚实的前向评估</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <LotteryTabs v-model="lottery" />
        <el-select v-model="strategy" style="width: 130px" @change="load">
          <el-option label="全部策略" value="" />
          <el-option label="🧠 AI 深度学习" value="dl" />
          <el-option label="均衡分布" value="balanced" />
          <el-option label="热号加权" value="hot" />
          <el-option label="冷号回补" value="cold" />
        </el-select>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="6" animated style="--el-skeleton-color: #1d2740" />

    <template v-else>
      <div class="stat-cards">
        <div class="stat-card">
          <div class="label">存档预测</div>
          <div class="value">{{ data.summary.total }}</div>
        </div>
        <div class="stat-card">
          <div class="label">待开奖</div>
          <div class="value" style="color: var(--gold)">{{ data.summary.pending }}</div>
        </div>
        <div class="stat-card">
          <div class="label">已核对</div>
          <div class="value">{{ data.summary.checked }}</div>
        </div>
        <div class="stat-card">
          <div class="label">平均红球命中</div>
          <div class="value">{{ data.summary.avgRedHits }}</div>
        </div>
        <div class="stat-card">
          <div class="label">中奖次数</div>
          <div class="value" style="color: var(--green)">{{ data.summary.winCount }}</div>
        </div>
      </div>

      <div v-if="data.trackCurve.length" class="panel">
        <h3 class="panel-title">逐期命中率曲线(已核对预测的平均红球命中 vs 随机基准)</h3>
        <Chart :option="curveOption" :height="300" />
      </div>

      <div class="panel">
        <h3 class="panel-title">预测记录</h3>
        <el-table :data="data.items" style="width: 100%">
          <el-table-column label="期号" width="170">
            <template #default="{ row }">
              <span v-if="row.targetIssue" class="text-dim">{{ row.baseIssue }} → </span>{{ row.targetIssue || row.baseIssue + ' 后' }}
            </template>
          </el-table-column>
          <el-table-column label="号码">
            <template #default="{ row }">
              <BallGroup :reds="row.reds" :blues="row.blues" size="sm" />
            </template>
          </el-table-column>
          <el-table-column label="策略" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="row.strategy === 'dl' ? 'warning' : 'info'">
                {{ { dl: '🧠 AI', balanced: '均衡', hot: '热号', cold: '冷号' }[row.strategy] || row.strategy }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="命中" width="110">
            <template #default="{ row }">
              <span v-if="row.hitsRed >= 0" class="hot-tag">{{ row.hitsRed }} + {{ row.hitsBlue }}</span>
              <span v-else class="text-dim">待开奖</span>
            </template>
          </el-table-column>
          <el-table-column label="奖项" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.prizeLevel > 0" size="small" :type="row.prizeLevel <= 2 ? 'danger' : 'success'">
                {{ row.prizeName }}
              </el-tag>
              <span v-else-if="row.hitsRed >= 0" class="text-dim">{{ row.prizeName }}</span>
              <span v-else class="text-dim">-</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ row.createdAt }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-popconfirm title="删除该记录?" @confirm="handleDelete(row)">
                <template #reference>
                  <el-button type="danger" size="small" text>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无预测记录。在「智能推荐」或「AI 预测」页点击生成后会自动存档" />
          </template>
        </el-table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import Chart from '../components/Chart.vue';
import BallGroup from '../components/BallGroup.vue';
import LotteryTabs from '../components/LotteryTabs.vue';

const lottery = ref('ssq');
const strategy = ref('');
const data = ref({ items: [], summary: {}, trackCurve: [] });
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    data.value = await api.predictions(lottery.value, strategy.value);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function handleDelete(row) {
  try {
    await api.deletePrediction(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (err) {
    ElMessage.error(err.message);
  }
}

const curveOption = computed(() => {
  const c = data.value.trackCurve || [];
  const baseline = lottery.value === 'ssq' ? (6 * 6) / 33 : (5 * 5) / 35;
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['平均红球命中', '随机基准'], textStyle: { color: '#8b96b3' }, top: 0 },
    grid: { left: 40, right: 20, top: 36, bottom: 26 },
    xAxis: { type: 'category', data: c.map((p) => p.issue), axisLabel: { color: '#8b96b3' } },
    yAxis: { type: 'value', minInterval: 0.5, axisLabel: { color: '#8b96b3' }, splitLine: { lineStyle: { color: '#2a3554' } } },
    series: [
      {
        name: '平均红球命中', type: 'line', smooth: true, data: c.map((p) => p.avgHits),
        itemStyle: { color: '#e84545' }, showSymbol: true,
      },
      {
        name: '随机基准', type: 'line', data: c.map(() => Math.round(baseline * 100) / 100),
        itemStyle: { color: '#8b96b3' }, showSymbol: false, lineStyle: { type: 'dashed' },
      },
    ],
  };
});

watch(lottery, load);
load();
</script>
