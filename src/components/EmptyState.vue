<script setup lang="ts">
import AppIcon, { type IconName } from '@/components/AppIcon.vue'

withDefaults(
  defineProps<{
    icon?: IconName
    title: string
    hint?: string
  }>(),
  { icon: 'check', hint: '' },
)
</script>

<template>
  <div class="empty-state">
    <AppIcon :name="icon" :size="28" />
    <p>{{ title }}</p>
    <p v-if="hint" class="meta-line">{{ hint }}</p>
  </div>
</template>
