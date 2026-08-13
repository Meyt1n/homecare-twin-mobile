<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import LevelTag from '@/components/LevelTag.vue'
import PrivacyBadge from '@/components/PrivacyBadge.vue'
import { useSpeech } from '@/composables/useSpeech'
import { activeProvider } from '@/data'
import { recognitionStatusLabel } from '@/data/labels'
import type { MemberSummary, QualityCheckResult, RecognitionCandidate } from '@/data/types'
import { useSession } from '@/stores/session'

type Stage = 'idle' | 'checking' | 'quality' | 'recognizing' | 'result'

const { session } = useSession()
const speech = useSpeech()

const members = ref<MemberSummary[]>([])
const memberId = ref('')
const stage = ref<Stage>('idle')
const file = ref<File | null>(null)
const previewUrl = ref('')
const quality = ref<QualityCheckResult | null>(null)
const candidate = ref<RecognitionCandidate | null>(null)
const error = ref('')

const steps = [
  { key: 'shoot', label: '拍摄' },
  { key: 'quality', label: '质量检查' },
  { key: 'candidate', label: '识别候选' },
  { key: 'review', label: '人工确认' },
]

const activeStepIndex = computed(() => {
  if (stage.value === 'idle') return 0
  if (stage.value === 'checking' || stage.value === 'quality') return 1
  if (stage.value === 'recognizing') return 2
  return 3
})

function releasePreview(): void {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function reset(): void {
  releasePreview()
  file.value = null
  quality.value = null
  candidate.value = null
  error.value = ''
  stage.value = 'idle'
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0]
  input.value = ''
  if (!picked) return

  releasePreview()
  file.value = picked
  previewUrl.value = URL.createObjectURL(picked)
  quality.value = null
  candidate.value = null
  error.value = ''
  stage.value = 'checking'

  try {
    quality.value = await activeProvider().checkImageQuality(picked)
    stage.value = 'quality'
    if (quality.value.decision === 'PASS') {
      speech.speak('照片质量合格，可以开始识别。')
    } else {
      speech.speak(`照片需要重拍。${quality.value.retakePrompts.join('，')}`)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '质量检查失败，请重试'
    stage.value = 'idle'
  }
}

async function recognize(): Promise<void> {
  if (!file.value || !memberId.value) return
  stage.value = 'recognizing'
  error.value = ''
  try {
    candidate.value = await activeProvider().recognizeMedicine(file.value, memberId.value)
    stage.value = 'result'
    speech.speak(`识别结果：${recognitionStatusLabel(candidate.value.status)}。${candidate.value.notice}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '识别失败，请重试'
    stage.value = 'quality'
  }
}

onMounted(async () => {
  try {
    members.value = await activeProvider().listMembers()
    memberId.value = session.currentMemberId || members.value[0]?.id || ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '成员加载失败'
  }
})

onBeforeUnmount(releasePreview)
</script>

<template>
  <main id="main" class="screen">
    <header class="screen-header">
      <p class="eyebrow">多证据视觉录入</p>
      <h1>拍药盒</h1>
      <p class="screen-subtitle">拍摄药盒正面，系统先做质量检查，再给出多渠道证据候选；只有人工确认后才会写入健康档案。</p>
      <PrivacyBadge />
    </header>

    <ol class="steps" aria-label="录入步骤">
      <li v-for="(step, index) in steps" :key="step.key" :data-active="index === activeStepIndex">
        {{ index + 1 }}.{{ step.label }}
      </li>
    </ol>

    <label class="field">
      为哪位成员录入
      <select v-model="memberId">
        <option v-for="member in members" :key="member.id" :value="member.id">
          {{ member.name }}（{{ member.relation }}）
        </option>
      </select>
    </label>

    <div class="card">
      <div v-if="previewUrl" class="preview-box">
        <img :src="previewUrl" alt="待识别的药盒照片预览" />
      </div>
      <p v-else class="empty-state">
        <AppIcon name="camera" :size="30" />
        尚未拍摄。请把药盒正面放满取景框，避免反光。
      </p>
      <div class="btn-row">
        <label class="btn btn-lg" :data-disabled="stage === 'checking' || stage === 'recognizing'">
          <AppIcon name="camera" :size="20" />
          {{ file ? '重新拍摄' : '拍摄药盒' }}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="visually-hidden-input"
            :disabled="stage === 'checking' || stage === 'recognizing'"
            @change="onFilePicked"
          />
        </label>
        <label class="btn btn-quiet btn-lg">
          从相册选择
          <input
            type="file"
            accept="image/*"
            class="visually-hidden-input"
            :disabled="stage === 'checking' || stage === 'recognizing'"
            @change="onFilePicked"
          />
        </label>
      </div>
    </div>

    <p v-if="error" class="notice" data-tone="error" role="alert">{{ error }}</p>
    <p v-if="stage === 'checking'" class="notice" role="status">正在进行图片质量检查…</p>
    <p v-if="stage === 'recognizing'" class="notice" role="status">正在提取 OCR、条码与包装特征证据…</p>

    <section v-if="quality && stage !== 'checking'" class="card" aria-labelledby="quality-title">
      <div class="card-title-row">
        <h2 id="quality-title">质量检查</h2>
        <span
          class="tag"
          :data-tone="quality.decision === 'PASS' ? 'calm' : 'danger'"
        >
          {{ quality.decision === 'PASS' ? '通过' : '需要重拍' }}
        </span>
      </div>
      <ul class="metric-grid">
        <li v-for="metric in quality.metrics" :key="metric.label">
          <span class="meta-line">{{ metric.label }}</span>
          <strong :data-passed="metric.passed">{{ metric.value }}{{ metric.passed ? '' : '（未达标）' }}</strong>
        </li>
      </ul>
      <template v-if="quality.decision === 'RETAKE'">
        <p v-for="prompt in quality.retakePrompts" :key="prompt" class="notice" data-tone="warn">{{ prompt }}</p>
      </template>
      <button
        v-if="quality.decision === 'PASS' && stage === 'quality'"
        type="button"
        class="btn btn-block btn-lg"
        :disabled="!memberId"
        @click="recognize"
      >
        开始识别
      </button>
    </section>

    <section v-if="candidate && stage === 'result'" class="card" aria-labelledby="candidate-title">
      <div class="card-title-row">
        <h2 id="candidate-title">识别候选</h2>
        <LevelTag kind="recognition" :value="candidate.status" />
      </div>
      <ul class="divided-list">
        <li v-for="field in candidate.fields" :key="field.label">
          <div class="card-title-row">
            <strong>{{ field.label }}</strong>
            <span class="meta-line">{{ field.source }} · 置信 {{ Math.round(field.confidence * 100) }}%</span>
          </div>
          <span>{{ field.value }}</span>
        </li>
      </ul>
      <p v-for="conflict in candidate.conflicts" :key="conflict" class="notice" data-tone="error">
        冲突：{{ conflict }}
      </p>
      <p class="notice" data-tone="warn">{{ candidate.notice }}</p>
      <p class="meta-line">
        版本：<template v-for="(version, key) in candidate.versions" :key="key">{{ key }} {{ version }}　</template>
      </p>
      <div class="btn-row">
        <button type="button" class="btn btn-quiet" @click="reset">再拍一张</button>
        <RouterLink class="btn" to="/">完成，返回今日</RouterLink>
      </div>
    </section>

    <footer class="disclaimer">
      识别候选永远需要人工确认；冲突、未知或低质量结果不会自动写入健康档案（与网页端复核中心一致）。
    </footer>
  </main>
</template>

<style scoped>
.preview-box {
  display: flex;
  justify-content: center;
  background: var(--c-primary-soft);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.preview-box img { max-width: 100%; max-height: 300px; object-fit: contain; display: block; }
.visually-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
.btn[data-disabled='true'] { pointer-events: none; opacity: 0.55; }
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.metric-grid li { display: grid; gap: 2px; border-top: 2px solid var(--c-border); padding-top: 6px; }
.metric-grid strong[data-passed='false'] { color: var(--c-red-deep); }
</style>
