<template>
  <el-radio-group :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <el-radio-button value="ssq">双色球</el-radio-button>
    <el-radio-button value="dlt">大乐透</el-radio-button>
  </el-radio-group>
</template>

<script setup>
defineProps({ modelValue: { type: String, required: true } });
defineEmits(['update:modelValue']);
</script>
