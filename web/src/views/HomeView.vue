<template>
  <div>
    <h2 class="page-title">最新开奖</h2>
    <p class="page-sub">双色球 + 大乐透 · 数据来自官方开奖结果</p>

    <el-skeleton v-if="loading" :rows="6" animated style="--el-skeleton-color: #1d2740" />

    <template v-else>
      <div class="grid-2">
        <div v-for="meta in lotteries" :key="meta.key" class="panel">
          <h3 class="panel-title">
            {{ meta.name }}
            <el-tag v-if="data[meta.key]?.latest?.source === 'seed'" type="warning" size="small">
              示例数据
            </el-tag>
          </h3>
          <template v-if="data[meta.key]?.latest">
            <div style="margin-bottom: 12px">
              <span class="text-dim">
                第 {{ data[meta.key].latest.issue }} 期 · {{ data[meta.key].latest.date }}
              </span>
            </div>
            <BallGroup
              :reds="data[meta.key].latest.reds"
              :blues="data[meta.key].latest.blues"
              size="lg"
            />
            <div style="margin-top: 16px" class="text-dim">
              库中共 {{ data[meta.key].total }} 期数据
            </div>
          </template>
          <el-empty v-else description="暂无数据,请前往「历史数据」同步" :image-size="80" />
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">快速入口</h3>
        <div class="quick-links">
          <router-link v-for="link in quickLinks" :key="link.to" :to="link.to" class="quick-card">
            <div class="quick-icon">{{ link.icon }}</div>
            <div class="quick-name">{{ link.name }}</div>
            <div class="quick-desc">{{ link.desc }}</div>
          </router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import BallGroup from '../components/BallGroup.vue';

const loading = ref(true);
const data = ref({});
const lotteries = ref([
  { key: 'ssq', name: '双色球' },
  { key: 'dlt', name: '大乐透' },
]);

const quickLinks = [
  { to: '/history', icon: '📋', name: '历史数据', desc: '查看与管理开奖记录' },
  { to: '/trend', icon: '📈', name: '走势分析', desc: '冷热号与遗漏走势' },
  { to: '/recommend', icon: '🎲', name: '智能推荐', desc: '多策略生成号码' },
  { to: '/dl', icon: '🧠', name: 'AI 深度学习', desc: 'LSTM 神经网络预测' },
  { to: '/generator', icon: '🎯', name: '胆拖生成', desc: '胆码杀号组合过滤' },
  { to: '/predictions', icon: '📋', name: '预测追踪', desc: '推荐命中核对曲线' },
  { to: '/bets', icon: '💰', name: '我的投注', desc: '投注管理与中奖核对' },
  { to: '/report', icon: '📊', name: '统计报告', desc: '和值/奇偶/区间分布' },
];

onMounted(async () => {
  try {
    const [meta, latest] = await Promise.all([api.meta(), api.latest()]);
    lotteries.value = meta.lotteries.map((l) => ({ key: l.key, name: l.name }));
    data.value = latest;
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

.quick-card {
  background: var(--panel-light);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.2s;
}

.quick-card:hover {
  border-color: var(--gold);
  transform: translateY(-2px);
}

.quick-icon {
  font-size: 26px;
  margin-bottom: 8px;
}

.quick-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.quick-desc {
  font-size: 12px;
  color: var(--text-dim);
}
</style>
