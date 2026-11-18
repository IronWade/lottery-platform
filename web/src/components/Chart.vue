<template>
  <div ref="el" class="chart-box" :style="{ height: typeof height === 'number' ? height + 'px' : height }"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch, shallowRef } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, HeatmapChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  TitleComponent,
  CanvasRenderer,
]);

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: [Number, String], default: 380 },
});

const el = ref(null);
const chart = shallowRef(null);
let resizeObserver = null;

function render() {
  if (!chart.value) return;
  chart.value.setOption(props.option, true);
}

onMounted(() => {
  chart.value = echarts.init(el.value);
  render();
  resizeObserver = new ResizeObserver(() => chart.value && chart.value.resize());
  resizeObserver.observe(el.value);
  window.addEventListener('resize', handleResize);
});

function handleResize() {
  chart.value && chart.value.resize();
}

watch(() => props.option, render, { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  resizeObserver && resizeObserver.disconnect();
  chart.value && chart.value.dispose();
});
</script>
