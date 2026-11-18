import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '首页' } },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { title: '历史数据' } },
  { path: '/trend', name: 'trend', component: () => import('../views/TrendView.vue'), meta: { title: '走势分析' } },
  { path: '/recommend', name: 'recommend', component: () => import('../views/RecommendView.vue'), meta: { title: '智能推荐' } },
  { path: '/dl', name: 'dl', component: () => import('../views/DlView.vue'), meta: { title: 'AI 深度学习' } },
  { path: '/generator', name: 'generator', component: () => import('../views/GeneratorView.vue'), meta: { title: '胆拖生成' } },
  { path: '/predictions', name: 'predictions', component: () => import('../views/PredictionsView.vue'), meta: { title: '预测追踪' } },
  { path: '/bets', name: 'bets', component: () => import('../views/BetsView.vue'), meta: { title: '我的投注' } },
  { path: '/report', name: 'report', component: () => import('../views/ReportView.vue'), meta: { title: '统计报告' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  document.title = `${to.meta.title || ''} - 彩票分析与推荐平台`;
});

export default router;
