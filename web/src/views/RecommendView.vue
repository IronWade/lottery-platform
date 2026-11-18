<template>
  <div>
    <h2 class="page-title">智能推荐</h2>
    <p class="page-sub">基于历史数据统计的号码生成 · 仅供娱乐参考,理性购彩</p>

    <div class="panel">
      <div class="recommend-form">
        <div class="form-item">
          <label>彩种</label>
          <LotteryTabs v-model="lottery" />
        </div>
        <div class="form-item">
          <label>推荐策略</label>
          <el-select v-model="strategy" style="width: 160px">
            <el-option
              v-for="s in strategies"
              :key="s.key"
              :label="`${s.name} - ${{ balanced: '奇偶/大小/区间均衡+和值过滤', hot: '近期高频号码加权随机', cold: '高遗漏冷号回补加权' }[s.key]}`"
              :value="s.key"
            />
          </el-select>
        </div>
        <div class="form-item">
          <label>生成注数</label>
          <el-input-number v-model="count" :min="1" :max="20" />
        </div>
        <div class="form-item">
          <label>统计周期</label>
          <el-select v-model="periods" style="width: 120px">
            <el-option v-for="p in [10, 20, 30, 50, 100]" :key="p" :label="`近 ${p} 期`" :value="p" />
          </el-select>
        </div>
        <el-button type="warning" size="large" :loading="loading" @click="generate">
          🎲 {{ result ? '重新生成' : '生成推荐' }}
        </el-button>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="6" animated style="--el-skeleton-color: #1d2740" />

    <template v-if="result && !loading">
      <div class="panel">
        <h3 class="panel-title">
          {{ result.lottery.name }} · {{ result.strategyName }} · 基于第 {{ result.basePeriod }} 期前数据
        </h3>
        <div class="bet-grid">
          <div v-for="(bet, i) in result.bets" :key="i" class="bet-card">
            <div class="bet-index">第 {{ i + 1 }} 注</div>
            <BallGroup :reds="bet.reds" :blues="bet.blues" size="lg" />
            <div class="bet-footer">
              <span class="bet-meta text-dim">{{ redLabel }}和值 {{ bet.sum }}</span>
              <el-button size="small" text type="primary" @click="addBet(bet)">🎯 加入投注</el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">冷热参考(近 {{ result.periods }} 期)</h3>
        <div v-if="overview" class="hotcold">
          <div class="hotcold-row">
            <span class="text-dim" style="width: 70px">热号</span>
            <span v-for="n in overview.hotCold.red.hot" :key="'h' + n" class="hot-tag ball ball-red ball-sm">{{ n }}</span>
          </div>
          <div class="hotcold-row">
            <span class="text-dim" style="width: 70px">冷号</span>
            <span v-for="n in overview.hotCold.red.cold" :key="'c' + n" class="cold-tag ball ball-blue ball-sm">{{ n }}</span>
          </div>
        </div>
      </div>
    </template>

    <el-empty v-if="!result && !loading" description="设置参数后点击「生成推荐」" :image-size="120" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import BallGroup from '../components/BallGroup.vue';
import LotteryTabs from '../components/LotteryTabs.vue';

const lottery = ref('ssq');
const strategy = ref('balanced');
const count = ref(5);
const periods = ref(30);
const strategies = ref([
  { key: 'balanced', name: '均衡分布' },
  { key: 'hot', name: '热号加权' },
  { key: 'cold', name: '冷号回补' },
]);
const result = ref(null);
const overview = ref(null);
const loading = ref(false);

const redLabel = computed(() => (lottery.value === 'ssq' ? '红球' : '前区'));

async function generate() {
  loading.value = true;
  try {
    const [rec, ov] = await Promise.all([
      api.recommend(lottery.value, strategy.value, count.value, periods.value, true),
      api.overview(lottery.value, periods.value),
    ]);
    result.value = rec;
    overview.value = ov;
    if (rec.saved) ElMessage.success(`已生成并存档 ${rec.saved} 条预测,开奖后可在「预测追踪」查看命中`);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function addBet(bet) {
  try {
    await api.addBet({
      lottery: lottery.value,
      reds: bet.reds,
      blues: bet.blues,
      cost: 2,
      source: 'recommend',
      note: `策略:${result.value.strategyName}`,
    });
    ElMessage.success('已加入投注单,可到「我的投注」查看');
  } catch (err) {
    ElMessage.error(err.message);
  }
}

watch(lottery, () => {
  result.value = null;
  overview.value = null;
});
</script>

<style scoped>
.recommend-form {
  display: flex;
  gap: 24px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 13px;
  color: var(--text-dim);
}

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

.hotcold-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
</style>
