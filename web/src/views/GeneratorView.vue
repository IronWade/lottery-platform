<template>
  <div>
    <h2 class="page-title">🎯 胆拖 / 杀号生成器</h2>
    <p class="page-sub">选胆码(必出)+ 杀号(排除),系统组合拖码生成投注 · 支持均衡过滤</p>

    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap">
      <LotteryTabs v-model="lottery" />
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">1. 选胆码(1 - {{ maxDan }} 个,必出)</h3>
        <NumGrid
          v-model="dan"
          :min="1"
          :max="redMax"
          :max-pick="maxDan"
          active-class="active-gold"
          :hint="`已选 ${dan.length} 个`"
        />
      </div>
      <div class="panel">
        <h3 class="panel-title">2. 选杀号(排除的号码)</h3>
        <NumGrid
          v-model="kill"
          :min="1"
          :max="redMax"
          active-class="active-kill"
          :hint="`已杀 ${kill.length} 个`"
        />
      </div>
    </div>

    <div class="panel">
      <h3 class="panel-title">3. 过滤条件与生成</h3>
      <div class="gen-options">
        <el-checkbox v-model="filters.balanced">奇偶/大小均衡</el-checkbox>
        <el-checkbox v-model="filters.sumTight">和值收紧</el-checkbox>
        <el-checkbox v-model="filters.noConsecutive">禁连号</el-checkbox>
        <div class="gen-count">
          <span class="text-dim">生成注数</span>
          <el-input-number v-model="maxBets" :min="1" :max="100" size="small" />
        </div>
        <el-button type="warning" :loading="loading" @click="handleGenerate">⚡ 生成</el-button>
      </div>
    </div>

    <template v-if="result">
      <div class="panel">
        <h3 class="panel-title">
          生成结果:{{ result.generated }} 注({{ redLabel }}含胆码
          <template v-if="result.dan.length">[{{ result.dan.join(', ') }}]</template>· 可用拖码池 {{ result.poolSize }} 个)
          <el-button v-if="result.tickets.length" size="small" type="primary" plain style="margin-left: auto" @click="addAll">
            全部加入投注({{ result.generated }} 注 × 2元)
          </el-button>
        </h3>
        <div class="bet-grid">
          <div v-for="(t, i) in result.tickets" :key="i" class="bet-card">
            <div class="ball-row">
              <Ball
                v-for="n in t.reds"
                :key="n"
                :num="n"
                :color="result.dan.includes(n) ? 'gold' : 'red'"
                size="md"
              />
              <Ball v-for="n in result.blues" :key="'b' + n" :num="n" color="blue" size="md" />
            </div>
            <div class="bet-footer">
              <span class="text-dim" style="font-size: 12px">和值 {{ t.sum }}</span>
              <el-button size="small" text type="primary" @click="addOne(t)">加入投注</el-button>
            </div>
          </div>
        </div>
        <el-empty v-if="!result.tickets.length" description="没有符合过滤条件的组合,请放宽条件" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import Ball from '../components/Ball.vue';
import NumGrid from '../components/NumGrid.vue';
import LotteryTabs from '../components/LotteryTabs.vue';

const lottery = ref('ssq');
const dan = ref([]);
const kill = ref([]);
const maxBets = ref(10);
const filters = reactive({ balanced: true, sumTight: false, noConsecutive: true });
const result = ref(null);
const loading = ref(false);

const redMax = computed(() => (lottery.value === 'ssq' ? 33 : 35));
const maxDan = computed(() => (lottery.value === 'ssq' ? 5 : 4));
const redLabel = computed(() => (lottery.value === 'ssq' ? '红球' : '前区'));

async function handleGenerate() {
  loading.value = true;
  try {
    result.value = await api.generator({
      lottery: lottery.value,
      dan: dan.value,
      kill: kill.value,
      maxBets: maxBets.value,
      filters: { ...filters },
    });
    if (!result.value.tickets.length) {
      ElMessage.warning('没有符合过滤条件的组合,请放宽条件');
    }
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function addOne(t) {
  try {
    await api.addBet({
      lottery: lottery.value,
      reds: t.reds,
      blues: result.value.blues,
      cost: 2,
      source: 'generator',
      note: `胆拖:胆[${result.value.dan.join(',') || '无'}] 杀[${result.value.kill.join(',') || '无'}]`,
    });
    ElMessage.success('已加入投注单');
  } catch (err) {
    ElMessage.error(err.message);
  }
}

async function addAll() {
  let ok = 0;
  for (const t of result.value.tickets) {
    try {
      await api.addBet({
        lottery: lottery.value,
        reds: t.reds,
        blues: result.value.blues,
        cost: 2,
        source: 'generator',
        note: `胆拖批量`,
      });
      ok++;
    } catch {
      /* 跳过失败项 */
    }
  }
  ElMessage.success(`已加入 ${ok} 注到投注单`);
}

watch(lottery, () => {
  dan.value = [];
  kill.value = [];
  result.value = null;
});
</script>

<style scoped>
.gen-options {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.gen-options :deep(.el-checkbox__label) {
  color: var(--text);
}

.gen-count {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.bet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.bet-card {
  background: var(--panel-light);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.bet-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}
</style>
