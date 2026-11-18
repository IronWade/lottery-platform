<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px">
      <div>
        <h2 class="page-title">💰 我的投注</h2>
        <p class="page-sub">收藏推荐号码为投注单 · 同步新期开奖后自动核对中奖等级与奖金</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
        <LotteryTabs v-model="lottery" />
        <el-button type="primary" @click="openDialog">＋ 新建投注</el-button>
      </div>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="label">总投入</div>
        <div class="value">{{ data.summary.totalCost || 0 }} 元</div>
      </div>
      <div class="stat-card">
        <div class="label">总奖金(固定奖)</div>
        <div class="value" style="color: var(--green)">{{ data.summary.totalPrize || 0 }} 元</div>
      </div>
      <div class="stat-card">
        <div class="label">盈亏</div>
        <div class="value" :style="{ color: roi >= 0 ? 'var(--green)' : 'var(--red)' }">
          {{ roi >= 0 ? '+' : '' }}{{ roi }} 元
        </div>
      </div>
      <div class="stat-card">
        <div class="label">待开奖 / 中奖次数</div>
        <div class="value" style="font-size: 18px">
          {{ data.summary.pending || 0 }} / <span style="color: var(--green)">{{ data.summary.winCount || 0 }}</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3 class="panel-title">投注记录(目标期为「建档后下一期」,开奖后自动核对)</h3>
      <el-table v-loading="loading" :data="data.items" style="width: 100%">
        <el-table-column label="号码">
          <template #default="{ row }">
            <BallGroup :reds="row.reds" :blues="row.blues" size="sm" />
          </template>
        </el-table-column>
        <el-table-column label="期号" width="150">
          <template #default="{ row }">
            <span v-if="row.targetIssue" class="text-dim">{{ row.baseIssue }} → </span>{{ row.targetIssue || '待开奖' }}
          </template>
        </el-table-column>
        <el-table-column prop="cost" label="金额" width="80">
          <template #default="{ row }">{{ row.cost }} 元</template>
        </el-table-column>
        <el-table-column label="命中" width="90">
          <template #default="{ row }">
            <span v-if="row.hitsRed >= 0" class="hot-tag">{{ row.hitsRed }} + {{ row.hitsBlue }}</span>
            <span v-else class="text-dim">-</span>
          </template>
        </el-table-column>
        <el-table-column label="奖项/奖金" width="130">
          <template #default="{ row }">
            <template v-if="row.prizeLevel > 0">
              <el-tag size="small" :type="row.prizeLevel <= 2 ? 'danger' : 'success'">{{ row.prizeName }}</el-tag>
              <span v-if="row.prizeAmount" class="text-dim" style="font-size: 12px; margin-left: 4px">{{ row.prizeAmount }}元</span>
              <span v-else class="text-dim" style="font-size: 12px; margin-left: 4px">浮动</span>
            </template>
            <span v-else-if="row.hitsRed >= 0" class="text-dim">未中奖</span>
            <span v-else class="text-dim">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="120">
          <template #default="{ row }">
            <span class="text-dim" style="font-size: 12px">{{ row.note }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-popconfirm title="删除该投注?" @confirm="handleDelete(row)">
              <template #reference>
                <el-button type="danger" size="small" text>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无投注。在推荐/AI/胆拖页面可将号码「加入投注」" />
        </template>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新建投注单" width="560px">
      <div style="margin-bottom: 14px">
        <LotteryTabs v-model="form.lottery" />
      </div>
      <BallPicker v-model:reds="form.reds" v-model:blues="form.blues" :lottery="form.lottery" />
      <div style="display: flex; gap: 16px; margin-top: 16px">
        <div>
          <span class="text-dim" style="font-size: 13px">金额(元)</span>
          <el-input-number v-model="form.cost" :min="2" :max="20000" style="margin-left: 8px" />
        </div>
        <el-input v-model="form.note" placeholder="备注(可选)" style="flex: 1" />
      </div>
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
import BallPicker from '../components/BallPicker.vue';
import LotteryTabs from '../components/LotteryTabs.vue';

const lottery = ref('ssq');
const data = ref({ items: [], summary: {} });
const loading = ref(false);
const dialogVisible = ref(false);

const form = reactive({ lottery: 'ssq', reds: [], blues: [], cost: 2, note: '' });
const need = computed(() =>
  form.lottery === 'ssq' ? { r: 6, b: 1 } : { r: 5, b: 2 }
);
const formValid = computed(
  () => form.reds.length === need.value.r && form.blues.length === need.value.b
);

const roi = computed(() => (data.value.summary.totalPrize || 0) - (data.value.summary.totalCost || 0));

async function load() {
  loading.value = true;
  try {
    data.value = await api.bets(lottery.value);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    loading.value = false;
  }
}

function openDialog() {
  form.lottery = lottery.value;
  form.reds = [];
  form.blues = [];
  form.cost = 2;
  form.note = '';
  dialogVisible.value = true;
}

async function handleAdd() {
  try {
    await api.addBet({
      lottery: form.lottery,
      reds: [...form.reds].sort((a, b) => a - b),
      blues: [...form.blues].sort((a, b) => a - b),
      cost: form.cost,
      note: form.note,
      source: 'manual',
    });
    ElMessage.success('已保存投注单');
    dialogVisible.value = false;
    await load();
  } catch (err) {
    ElMessage.error(err.message);
  }
}

async function handleDelete(row) {
  try {
    await api.deleteBet(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (err) {
    ElMessage.error(err.message);
  }
}

watch(lottery, load);
load();
</script>
