<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px">
      <div>
        <h2 class="page-title">走势分析</h2>
        <p class="page-sub">近 N 期号码出现与遗漏情况 · 热力颜色越深代表遗漏越久</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <LotteryTabs v-model="lottery" />
        <el-radio-group v-model="ballZone">
          <el-radio-button value="red">{{ redLabel }}</el-radio-button>
          <el-radio-button value="blue">{{ blueLabel }}</el-radio-button>
        </el-radio-group>
        <el-select v-model="periods" style="width: 130px" @change="load">
          <el-option v-for="p in [10, 20, 30, 50]" :key="p" :label="`近 ${p} 期`" :value="p" />
        </el-select>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="8" animated style="--el-skeleton-color: #1d2740" />

    <template v-else-if="trend">
      <div class="panel">
        <h3 class="panel-title">{{ redLabel }}走势图(出现显示号码,未出现显示遗漏期数)</h3>
        <div class="chart-scroll">
          <Chart
            :option="heatmapOption"
            :height="Math.max(300, periods * 24 + 90)"
            :style="{ minWidth: redMinWidth + 'px' }"
          />
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">{{ blueLabel }}走势图</h3>
        <div class="chart-scroll">
          <Chart
            :option="blueHeatmapOption"
            :height="Math.max(300, periods * 24 + 90)"
            :style="{ minWidth: blueMinWidth + 'px' }"
          />
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">当前遗漏 TOP 10({{ currentZoneLabel }}· 最久未出)</h3>
        <Chart :option="omitBarOption" :height="300" />
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
const ballZone = ref('red');
const periods = ref(30);
const trend = ref(null);
const loading = ref(false);

const metaMap = {
  ssq: { redLabel: '红球', blueLabel: '蓝球' },
  dlt: { redLabel: '前区', blueLabel: '后区' },
};
const redLabel = computed(() => metaMap[lottery.value].redLabel);
const blueLabel = computed(() => metaMap[lottery.value].blueLabel);
const currentZoneLabel = computed(() => (ballZone.value === 'red' ? redLabel.value : blueLabel.value));

// 热力图最小宽度:列多时小屏可横向滚动
const redMinWidth = computed(() => (lottery.value === 'ssq' ? 33 * 24 + 90 : 35 * 24 + 90));
const blueMinWidth = computed(() => (lottery.value === 'ssq' ? 16 * 26 + 90 : 12 * 26 + 90));

async function load() {
  loading.value = true;
  try {
    trend.value = await api.trend(lottery.value, periods.value);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

function heatmapOptionFor(dataRows) {
  const rows = [...dataRows].reverse(); // 旧→新展示
  const nums = rows[0] ? rows[0].values.map((v) => v.num) : [];
  const data = [];
  let maxOmit = 1;
  rows.forEach((row, y) => {
    row.values.forEach((v, x) => {
      if (!v.hit) maxOmit = Math.max(maxOmit, v.omit);
      data.push([x, y, v.hit ? 0 : v.omit, v.hit ? v.num : v.omit]);
    });
  });
  return {
    tooltip: {
      formatter: (p) => {
        const [x, y, , label] = p.data;
        return `第 ${rows[y].issue} 期 · ${nums[x]} 号:${rows[y].values[x].hit ? '开出' : `遗漏 ${label} 期`}`;
      },
    },
    grid: { left: 70, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: nums,
      splitArea: { show: true },
      axisLabel: { color: '#8b96b3' },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.issue),
      splitArea: { show: true },
      axisLabel: { color: '#8b96b3' },
    },
    visualMap: {
      min: 0,
      max: Math.min(maxOmit, 20),
      calculable: false,
      orient: 'vertical',
      right: 0,
      top: 'center',
      textStyle: { color: '#8b96b3' },
      inRange: { color: ['#161d31', '#2a3554', '#5a4a1f', '#f0b429'] },
      text: ['遗漏久', '近期开'],
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          formatter: (p) => String(p.data[3]),
          fontSize: 10,
          color: '#e6ebf5',
        },
        itemStyle: {
          borderColor: '#0d1220',
          borderWidth: 1,
        },
        emphasis: { itemStyle: { shadowBlur: 6 } },
      },
    ],
  };
}

const heatmapOption = computed(() =>
  trend.value ? heatmapOptionFor(ballZone.value === 'red' ? trend.value.redTrend : trend.value.blueTrend) : {}
);

const blueHeatmapOption = computed(() =>
  trend.value ? heatmapOptionFor(ballZone.value === 'red' ? trend.value.blueTrend : trend.value.redTrend) : {}
);

const omitBarOption = computed(() => {
  if (!trend.value) return {};
  const rows = ballZone.value === 'red' ? trend.value.redTrend : trend.value.blueTrend;
  const latest = rows[rows.length - 1];
  const omitted = latest.values
    .filter((v) => !v.hit)
    .sort((a, b) => b.omit - a.omit)
    .slice(0, 10);
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: omitted.map((v) => `${v.num} 号`),
      axisLabel: { color: '#8b96b3' },
    },
    yAxis: { type: 'value', name: '遗漏期数', axisLabel: { color: '#8b96b3' }, splitLine: { lineStyle: { color: '#2a3554' } } },
    series: [
      {
        type: 'bar',
        data: omitted.map((v) => v.omit),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#f0b429' },
              { offset: 1, color: '#5a4a1f' },
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
