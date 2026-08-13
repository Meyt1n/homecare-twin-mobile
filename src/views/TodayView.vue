<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import LevelTag from '@/components/LevelTag.vue'
import PrivacyBadge from '@/components/PrivacyBadge.vue'
import TaskCard from '@/components/TaskCard.vue'
import { createSpeaker, useSpeech } from '@/composables/useSpeech'
import { activeProvider } from '@/data'
import { eventStatusLabel, riskLevelLabel, taskLevelLabel } from '@/data/labels'
import type { MemberSummary, TaskAction, TaskActionPayload, TodaySnapshot } from '@/data/types'
import { useA11y } from '@/stores/accessibility'
import { useSession } from '@/stores/session'
import { formatDateTime, greetingByHour } from '@/utils/format'

const { session, updateSession } = useSession()
const { settings } = useA11y()
const speech = useSpeech()
const manualSpeaker = createSpeaker(() => true)

const members = ref<MemberSummary[]>([])
const snapshot = ref<TodaySnapshot | null>(null)
const loading = ref(true)
const error = ref('')
const actionMessage = ref('')
const actionError = ref('')
const busyTaskId = ref('')
const announced = ref(false)

const greeting = computed(() => greetingByHour(new Date().getHours()))
const currentMember = computed(() => members.value.find(m => m.id === session.currentMemberId) ?? null)

const pendingTasks = computed(
  () => snapshot.value?.tasks.filter(t => t.status === 'PENDING' || t.status === 'DEFERRED') ?? [],
)
const doneTasks = computed(
  () => snapshot.value?.tasks.filter(t => t.status !== 'PENDING' && t.status !== 'DEFERRED') ?? [],
)
const topRisks = computed(() => (snapshot.value?.risks ?? []).slice(0, 3))

function summaryText(): string {
  if (!snapshot.value) return ''
  const name = currentMember.value?.name ?? '当前成员'
  const parts = [`${greeting.value}。${name}今天有 ${pendingTasks.value.length} 项照护任务待处理`]
  const risks = snapshot.value.risks
  if (risks.length > 0) {
    const first = risks[0]!
    parts.push(`${risks.length} 条风险提醒需要关注，最高等级：${riskLevelLabel(first.level)}，${first.message}`)
  } else {
    parts.push('暂无待关注的风险提醒')
  }
  return `${parts.join('；')}。`
}

async function loadMembers(): Promise<void> {
  members.value = await activeProvider().listMembers()
  const exists = members.value.some(m => m.id === session.currentMemberId)
  if (!exists) {
    const preferred = members.value.find(m => m.role === 'DEPENDENT') ?? members.value[0]
    updateSession({ currentMemberId: preferred?.id ?? '' })
  }
}

async function loadSnapshot(): Promise<void> {
  if (!session.currentMemberId) {
    snapshot.value = null
    return
  }
  snapshot.value = await activeProvider().getTodaySnapshot(session.currentMemberId)
  if (!announced.value && settings.voiceBroadcast) {
    announced.value = true
    speech.speak(summaryText())
  }
}

async function reload(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await loadMembers()
    await loadSnapshot()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败，请稍后重试'
    snapshot.value = null
  } finally {
    loading.value = false
  }
}

async function onMemberChange(): Promise<void> {
  updateSession({ currentMemberId: session.currentMemberId })
  loading.value = true
  error.value = ''
  actionMessage.value = ''
  actionError.value = ''
  try {
    await loadSnapshot()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function onTaskAction(taskId: string, action: TaskAction, payload: TaskActionPayload): Promise<void> {
  busyTaskId.value = taskId
  actionMessage.value = ''
  actionError.value = ''
  try {
    const task = await activeProvider().submitTaskAction(taskId, action, payload)
    const label = action === 'confirm' ? '已确认' : action === 'defer' ? '已延期' : '已记录跳过'
    actionMessage.value = `${label}：${task.title}`
    speech.speak(actionMessage.value)
    await loadSnapshot()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : '操作失败，请稍后重试'
  } finally {
    busyTaskId.value = ''
  }
}

function speakSummary(): void {
  manualSpeaker.speak(summaryText())
}

watch(
  () => session.dataMode,
  () => {
    announced.value = true
    void reload()
  },
)

onMounted(reload)
</script>

<template>
  <main id="main" class="screen">
    <header class="screen-header">
      <p class="eyebrow">家健镜 · 随身照护</p>
      <h1>{{ greeting }}</h1>
      <PrivacyBadge />
    </header>

    <label class="field">
      当前成员
      <select v-model="session.currentMemberId" :disabled="loading" @change="onMemberChange">
        <option v-for="member in members" :key="member.id" :value="member.id">
          {{ member.name }}（{{ member.relation }}）
        </option>
      </select>
    </label>

    <button type="button" class="btn btn-quiet" @click="speakSummary">
      <AppIcon name="sound" :size="18" />
      语音播报今日安排
    </button>

    <p v-if="error" class="notice" data-tone="error" role="alert">{{ error }}</p>
    <p v-if="actionError" class="notice" data-tone="error" role="alert">{{ actionError }}</p>
    <p v-else-if="actionMessage" class="notice" data-tone="success" role="status">{{ actionMessage }}</p>

    <section v-if="loading" class="card" aria-live="polite">
      <p class="empty-state">正在加载获授权的照护数据…</p>
    </section>

    <template v-else-if="snapshot">
      <section aria-labelledby="tasks-title">
        <div class="section-heading">
          <h2 id="tasks-title">今日照护任务</h2>
          <span class="meta-line">{{ pendingTasks.length }} 项待处理</span>
        </div>
        <div class="plain-list" style="margin-top: 10px">
          <EmptyState
            v-if="pendingTasks.length === 0"
            icon="check"
            title="今日任务都处理完了"
            hint="新的提醒会按等级出现在这里"
          />
          <TaskCard
            v-for="task in pendingTasks"
            :key="task.id"
            :task="task"
            :busy="busyTaskId === task.id"
            @action="(action, payload) => onTaskAction(task.id, action, payload)"
          />
        </div>
        <details v-if="doneTasks.length > 0" class="done-tasks">
          <summary>已处理（{{ doneTasks.length }}）</summary>
          <ul class="divided-list">
            <li v-for="task in doneTasks" :key="task.id">
              <div class="card-title-row">
                <strong>{{ task.title }}</strong>
                <LevelTag kind="taskStatus" :value="task.status" />
              </div>
              <span class="meta-line">提醒等级：{{ taskLevelLabel(task.level) }}</span>
            </li>
          </ul>
        </details>
      </section>

      <section aria-labelledby="risks-title">
        <div class="section-heading">
          <h2 id="risks-title">待关注风险</h2>
          <RouterLink class="section-link" to="/alerts">查看全部</RouterLink>
        </div>
        <div class="plain-list" style="margin-top: 10px">
          <EmptyState
            v-if="topRisks.length === 0"
            icon="shield"
            title="暂无待关注的风险提醒"
            hint="规则重新计算后结果会更新"
          />
          <RouterLink
            v-for="risk in topRisks"
            :key="risk.ruleId"
            class="card risk-link"
            :to="`/alerts/${risk.memberId}/${encodeURIComponent(risk.ruleId)}`"
          >
            <div class="card-title-row">
              <LevelTag kind="risk" :value="risk.level" />
              <span class="meta-line">证据 {{ risk.sourceCount }} 条</span>
            </div>
            <p class="risk-message">{{ risk.message }}</p>
            <span class="meta-line">查看依据与建议 <AppIcon name="chevron-right" :size="14" /></span>
          </RouterLink>
        </div>
      </section>

      <section aria-labelledby="recent-title">
        <div class="section-heading">
          <h2 id="recent-title">最近变化</h2>
        </div>
        <ul class="card divided-list" style="margin-top: 10px">
          <li v-if="snapshot.recentEvents.length === 0">
            <span class="meta-line">尚无已确认健康事件，可拍摄药盒或在网页端手工录入一条事实。</span>
          </li>
          <li v-for="event in snapshot.recentEvents" :key="event.id">
            <strong>{{ event.title }}</strong>
            <span class="meta-line">
              {{ eventStatusLabel(event.confirmationStatus) }} · {{ formatDateTime(event.occurredAt) }}
            </span>
          </li>
        </ul>
      </section>
    </template>

    <footer class="disclaimer">
      教学演示，不用于诊断或治疗。系统不改变任何用药决定；紧急情况请联系医生或当地急救服务。
    </footer>
  </main>
</template>

<style scoped>
.risk-link { text-decoration: none; color: inherit; }
.risk-message { font-weight: 700; }
.done-tasks { margin-top: 10px; }
.done-tasks summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--c-text-soft);
  min-height: var(--tap);
  display: flex;
  align-items: center;
}
.done-tasks ul { margin-top: 6px; }
</style>
