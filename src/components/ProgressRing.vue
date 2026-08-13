<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 已完成数量 */
    done: number
    /** 总数（0 时显示满环空态） */
    total: number
    size?: number
  }>(),
  { size: 92 },
)

const STROKE = 8

const radius = computed(() => (props.size - STROKE) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const ratio = computed(() => {
  if (props.total <= 0) return 0
  return Math.min(1, Math.max(0, props.done / props.total))
})
const dashOffset = computed(() => circumference.value * (1 - ratio.value))
const label = computed(() => (props.total > 0 ? `${props.done}/${props.total}` : '0'))
</script>

<template>
  <div
    class="ring"
    role="img"
    :aria-label="total > 0 ? `今日任务已完成 ${done} 项，共 ${total} 项` : '今日暂无任务'"
  >
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <circle
        class="ring-track"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="STROKE"
      />
      <circle
        class="ring-value"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="STROKE"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      />
    </svg>
    <div class="ring-center">
      <strong>{{ label }}</strong>
      <span>{{ total > 0 ? '已完成' : '无任务' }}</span>
    </div>
  </div>
</template>

<style scoped>
.ring { position: relative; display: grid; place-items: center; }
.ring-track { stroke: rgba(255, 255, 255, 0.25); }
.ring-value {
  stroke: #ffd9a8;
  transition: stroke-dashoffset 0.6s var(--ease);
}
.ring-center {
  position: absolute;
  display: grid;
  justify-items: center;
  gap: 0;
  color: #fff;
}
.ring-center strong { font-size: 1.15rem; font-weight: 800; line-height: 1.15; }
.ring-center span { font-size: 0.68rem; color: rgba(255, 255, 255, 0.85); font-weight: 600; }

html[data-contrast='high'] .ring-track { stroke: #ffffff; }
html[data-contrast='high'] .ring-value { stroke: #ffd9a8; }
</style>
