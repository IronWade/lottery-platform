<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px">
      <div>
        <h2 class="page-title">统计报告</h2>
        <p class="page-sub">和值分布 · 奇偶比 · 大小比 · 区间分布 · 连号统计</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <LotteryTabs v-model="lottery" />
        <el-select v-model="periods" style="width: 130px" @change="load">
          <el-option v-for="p in [20, 50, 100, 200]" :key="p" :label="`近 ${p} 期`" :value="p" />
        </el-select>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="10" animated style="--el-skeleton-color: #1d2740" />

    <template v-else-if="report">
      <div class="stat-cards">
        <div class="stat-card">
          <div class="label">统计期数</div>
          <div class="value">{{ report.periods }}</div>
        </div>
        <div class="stat-card">
          <div class="label">{{ redLabel }}和值常见区间</div>
          <div class="value" style="font-size: 17px">{{ peakSumRange }}</div>
        </div>
        <div class="stat-card">
          <div class="label">最常见奇偶比</div>
          <div class="value" style="font-size: 17px">{{ report.oddEven[0]?.key || '-' }}</div>
        </div>
        <div class="stat-card">
          <div class="label">出现连号的比例</div>
          <div class="value">{{ report.consecutiveRatio }}%</div>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">{{ redLabel }}和值分布</h3>
        <Chart :option="sumOption" :height="320" />
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3 class="panel-title">奇偶比分布</h3>
          <Chart :option="pieOption(report.oddEven, ['#e84545', '#3b82f6'])" :height="320" />
        </div>
        <div class="panel">
          <h3 class="panel-title">大小比分布(大 ≥ {{ bigThreshold }})</h3>
          <Chart :option="pieOption(report.bigSmall, ['#f0b429', '#22c58b'])" :height="320" />
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">区间分布(前/中/后三区号码个数)</h3>
        <Chart :option="zoneOption" :height="320" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import Chart from '../components/Chart.vue';
import LotteryTabs from '../components/LotteryTabs.vue';

const lottery = ref('ssq');
const periods = ref(100);
const report = ref(null);
const loading = ref(false);

const redLabel = computed(() => (lottery.value === 'ssq' ? '红球' : '前区'));
const bigThreshold = computed(() => (lottery.value === 'ssq' ? 17 : 18));

const peakSumRange = computed(() => {
  if (!report.value || !report.value.sumDist.length) return '-';
  const peak = [...report.value.sumDist].sort((a, b) => b.count - a.count)[0];
  return peak.range;
});

async function load() {
  loading.value = true;
  try {
    report.value = await api.report(lottery.value, periods.value);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

const sumOption = computed(() => {
  if (!report.value) return {};
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: report.value.sumDist.map((d) => d.range),
      axisLabel: { color: '#8b96b3' },
    },
    yAxis: {
      type: 'value',
      name: '出现次数',
      axisLabel: { color: '#8b96b3' },
      splitLine: { lineStyle: { color: '#2a3554' } },
    },
    series: [
      {
        type: 'bar',
        data: report.value.sumDist.map((d) => d.count),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#e84545' },
              { offset: 1, color: '#7a2035' },
            ],
          },
        },
        label: { show: true, position: 'top', color: '#e6ebf5' },
      },
    ],
  };
});

function pieOption(list, colors) {
  if (!list) return {};
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 次 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#8b96b3' } },
    color: ['#e84545', '#3b82f6', '#f0b429', '#22c58b', '#a855f7', '#64748b', '#eab308', '#0ea5e9'],
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', '46%'],
        itemStyle: { borderColor: '#161d31', borderWidth: 2 },
        label: { color: '#e6ebf5', formatter: '{b}\n{d}%' },
        data: list.map((d) => ({ name: d.key, value: d.count })),
      },
    ],
  };
}

const zoneOption = computed(() => {
  if (!report.value) return {};
  const top = report.value.zones.slice(0, 8);
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 60 },
    xAxis: {
      type: 'category',
      data: top.map((d) => d.key),
      axisLabel: { color: '#8b96b3' },
    },
    yAxis: {
      type: 'value',
      name: '出现次数',
      axisLabel: { color: '#8b96b3' },
      splitLine: { lineStyle: { color: '#2a3554' } },
    },
    series: [
      {
        type: 'bar',
        data: top.map((d) => d.count),
        barWidth: 36,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#3b82f6' },
              { offset: 1, color: '#1e3a6e' },
            ],
          },
        },
        label: { show: true, position: 'top', color: '#e6ebf5' },
      },
    ],
  };
});

watch(lottery, load);
load();
</script>
