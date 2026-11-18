<template>
  <div class="ball-row">
    <Ball v-for="n in reds" :key="'r' + n" :num="n" color="red" :size="size" />
    <Ball v-for="n in blues" :key="'b' + n" :num="n" color="blue" :size="size" />
  </div>
</template>

<script setup>
import Ball from './Ball.vue';

defineProps({
  reds: { type: Array, required: true },
  blues: { type: Array, required: true },
  size: { type: String, default: 'md' },
});
</script>
