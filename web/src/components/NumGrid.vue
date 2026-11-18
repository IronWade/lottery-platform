<template>
  <div>
    <div class="pick-label">{{ label }} <span v-if="hint">· {{ hint }}</span></div>
    <div class="ball-grid">
      <span
        v-for="n in nums"
        :key="n"
        class="pick-ball"
        :class="modelValue.includes(n) ? activeClass : ''"
        @click="toggle(n)"
      >{{ n }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  modelValue: { type: Array, default: () => [] },
  maxPick: { type: Number, default: 99 },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  activeClass: { type: String, default: 'active-red' },
});
const emit = defineEmits(['update:modelValue']);

const nums = computed(() => Array.from({ length: props.max - props.min + 1 }, (_, i) => props.min + i));

function toggle(n) {
  const arr = [...props.modelValue];
  const i = arr.indexOf(n);
  if (i >= 0) arr.splice(i, 1);
  else if (arr.length < props.maxPick) arr.push(n);
  else return;
  emit('update:modelValue', arr);
}
</script>
