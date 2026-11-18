<template>
  <div id="app">
    <header class="app-header">
      <div class="app-logo">🎯 彩票分析与推荐平台</div>
      <nav class="app-nav">
        <router-link to="/">首页</router-link>
        <router-link to="/history">历史数据</router-link>
        <router-link to="/trend">走势分析</router-link>
        <router-link to="/recommend">智能推荐</router-link>
        <router-link to="/dl">🤖 AI 预测</router-link>
        <router-link to="/generator">胆拖生成</router-link>
        <router-link to="/predictions">预测追踪</router-link>
        <router-link to="/bets">我的投注</router-link>
        <router-link to="/report">统计报告</router-link>
      </nav>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>
