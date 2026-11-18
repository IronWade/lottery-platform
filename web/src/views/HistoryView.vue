<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px">
      <div>
        <h2 class="page-title">历史数据</h2>
        <p class="page-sub">同步官方开奖 · 手动录入 · 数据管理</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <LotteryTabs v-model="lottery" />
        <el-button type="warning" :loading="syncing" @click="handleSync">🔄 同步最新数据</el-button>
        <el-button @click="api.exportCsv(lottery)">📥 导出 CSV</el-button>
        <el-button type="primary" @click="dialogVisible = true">＋ 手动录入</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column prop="issue" label="期号" width="110" sortable />
        <el-table-column prop="date" label="开奖日期" width="130" />
        <el-table-column label="开奖号码">
          <template #default="{ row }">
            <BallGroup :reds="row.reds" :blues="row.blues" size="sm" />
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag
              :type="row.source === 'official' ? 'success' : row.source === 'seed' ? 'warning' : 'info'"
              size="small"
            >
              {{ { official: '官方', seed: '示例', manual: '录入' }[row.source] || row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-popconfirm title="确定删除该期数据?" @confirm="handleDelete(row)">
              <template #reference>
                <el-button type="danger" size="small" text>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无数据,请点击右上角「同步最新数据」" />
        </template>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        :total="total"
        :page-size="size"
        layout="prev, pager, next, total"
        background
        @current-change="load"
      />
    </div>

    <el-dialog v-model="dialogVisible" title="手动录入一期开奖" width="520px">
      <el-form label-width="90px">
        <el-form-item label="彩种">
          <LotteryTabs v-model="form.lottery" />
        </el-form-item>
        <el-form-item label="期号">
          <el-input v-model="form.issue" placeholder="如 2026130" />
        </el-form-item>
        <el-form-item label="开奖日期">
          <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="redLabel">
          <div class="ball-grid">
            <span
              v-for="n in redRange"
              :key="'r' + n"
              class="pick-ball"
              :class="{ active: form.reds.includes(n) }"
              @click="toggleNum(form.reds, n, redCount)"
            >{{ n }}</span>
          </div>
          <div class="text-dim" style="width: 100%; font-size: 12px">已选 {{ form.reds.length }}/{{ redCount }}</div>
        </el-form-item>
        <el-form-item :label="blueLabel">
          <div class="ball-grid">
            <span
              v-for="n in blueRange"
              :key="'b' + n"
              class="pick-ball pick-blue"
              :class="{ active: form.blues.includes(n) }"
              @click="toggleNum(form.blues, n, blueCount)"
            >{{ n }}</span>
          </div>
          <div class="text-dim" style="width: 100%; font-size: 12px">已选 {{ form.blues.length }}/{{ blueCount }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!formValid" @click="handleAdd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api';
import BallGroup from '../components/BallGroup.vue';
import LotteryTabs from '../components/LotteryTabs.vue';

const lottery = ref('ssq');
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const size = 30;
const loading = ref(false);
const syncing = ref(false);
const dialogVisible = ref(false);

const metaMap = {
  ssq: { redLabel: '红球', redCount: 6, redMin: 1, redMax: 33, blueLabel: '蓝球', blueCount: 1, blueMin: 1, blueMax: 16 },
  dlt: { redLabel: '前区', redCount: 5, redMin: 1, redMax: 35, blueLabel: '后区', blueCount: 2, blueMin: 1, blueMax: 12 },
};

const form = reactive({ lottery: 'ssq', issue: '', date: '', reds: [], blues: [] });

const m = computed(() => metaMap[form.lottery]);
const redLabel = computed(() => m.value.redLabel);
const blueLabel = computed(() => m.value.blueLabel);
const redCount = computed(() => m.value.redCount);
const blueCount = computed(() => m.value.blueCount);
const redRange = computed(() => range(m.value.redMin, m.value.redMax));
const blueRange = computed(() => range(m.value.blueMin, m.value.blueMax));
const formValid = computed(
  () =>
    form.issue &&
    form.date &&
    form.reds.length === redCount.value &&
    form.blues.length === blueCount.value
);

function range(min, max) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function toggleNum(arr, n, maxCount) {
  const i = arr.indexOf(n);
  if (i >= 0) arr.splice(i, 1);
  else if (arr.length < maxCount) arr.push(n);
  else ElMessage.warning(`最多选择 ${maxCount} 个号码`);
}

async function load() {
  loading.value = true;
  try {
    const res = await api.draws(lottery.value, page.value, size);
    rows.value = res.items;
    total.value = res.total;
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

async function handleSync() {
  syncing.value = true;
  try {
    const res = await api.sync(lottery.value);
    if (res.source === 'remote') {
      ElMessage.success(`同步成功,更新 ${res.added} 期`);
    } else if (res.source === 'seed') {
      ElMessage.warning(`官方接口暂不可达(${res.error}),已写入 ${res.added} 期示例数据`);
    } else {
      ElMessage.info('官方接口暂不可达,已展示本地缓存数据');
    }
    page.value = 1;
    await load();
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    syncing.value = false;
  }
}

async function handleAdd() {
  try {
    await api.addDraw({
      lottery: form.lottery,
      issue: form.issue,
      date: form.date,
      reds: [...form.reds].sort((a, b) => a - b),
      blues: [...form.blues].sort((a, b) => a - b),
    });
    ElMessage.success('录入成功');
    dialogVisible.value = false;
    Object.assign(form, { issue: '', date: '', reds: [], blues: [] });
    await load();
  } catch (err) {
    ElMessage.error(err.message);
  }
}

async function handleDelete(row) {
  try {
    await api.deleteDraw(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (err) {
    ElMessage.error(err.message);
  }
}

watch(lottery, () => {
  page.value = 1;
  load();
});
watch(() => form.lottery, () => {
  form.reds = [];
  form.blues = [];
});

load();
</script>

<style scoped>
.ball-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
  max-width: 420px;
  gap: 6px;
  width: 100%;
}

.pick-ball {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  background: var(--panel-light);
  border: 1px solid var(--border);
  color: var(--text-dim);
  transition: all 0.15s;
}

.pick-ball:hover {
  border-color: var(--red);
  color: var(--text);
}

.pick-ball.active {
  background: radial-gradient(circle at 30% 30%, #ff7b7b, var(--red) 65%);
  color: #fff;
  border-color: transparent;
  font-weight: 700;
}

.pick-blue.active {
  background: radial-gradient(circle at 30% 30%, #7db4ff, var(--blue) 65%);
}
</style>
