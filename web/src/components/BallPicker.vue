<template>
  <div class="ball-picker">
    <NumGrid
      v-model="reds"
      :min="meta.red.min"
      :max="meta.red.max"
      :max-pick="meta.red.count"
      :label="`${meta.red.label}(选 ${meta.red.count} 个,已选 ${reds.length})`"
      active-class="active-red"
    />
    <NumGrid
      v-model="blues"
      :min="meta.blue.min"
      :max="meta.blue.max"
      :max-pick="meta.blue.count"
      :label="`${meta.blue.label}(选 ${meta.blue.count} 个,已选 ${blues.length})`"
      active-class="active-blue"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import NumGrid from './NumGrid.vue';

const props = defineProps({
  lottery: { type: String, required: true },
  reds: { type: Array, default: () => [] },
  blues: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:reds', 'update:blues']);

const metaMap = {
  ssq: { red: { min: 1, max: 33, count: 6, label: '红球' }, blue: { min: 1, max: 16, count: 1, label: '蓝球' } },
  dlt: { red: { min: 1, max: 35, count: 5, label: '前区' }, blue: { min: 1, max: 12, count: 2, label: '后区' } },
};
const meta = computed(() => metaMap[props.lottery]);

const reds = computed({
  get: () => props.reds,
  set: (v) => emit('update:reds', v),
});
const blues = computed({
  get: () => props.blues,
  set: (v) => emit('update:blues', v),
});
</script>

<style scoped>
.ball-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
