<template>
  <span class="ball" :class="[`ball-${color}`, `ball-${size}`]">{{ num }}</span>
</template>

<script setup>
defineProps({
  num: { type: [Number, String], required: true },
  color: { type: String, default: 'red' }, // red | blue | gold
  size: { type: String, default: 'md' }, // sm | md | lg
});
</script>
