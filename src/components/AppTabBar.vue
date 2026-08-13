<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import { useA11y } from '@/stores/accessibility'

interface TabItem {
  to: string
  label: string
  icon: IconName
}

const { settings } = useA11y()
const route = useRoute()

const NORMAL_TABS: TabItem[] = [
  { to: '/', label: '今日', icon: 'home' },
  { to: '/scan', label: '拍药盒', icon: 'camera' },
  { to: '/family', label: '家人', icon: 'family' },
  { to: '/alerts', label: '提醒', icon: 'bell' },
  { to: '/me', label: '我的', icon: 'user' },
]

/** 长辈模式：入口减到 4 个，突出求助。 */
const ELDER_TABS: TabItem[] = [
  { to: '/', label: '今日', icon: 'home' },
  { to: '/scan', label: '拍药盒', icon: 'camera' },
  { to: '/help', label: '求助', icon: 'phone' },
  { to: '/me', label: '我的', icon: 'user' },
]

const tabs = computed(() => (settings.elderMode ? ELDER_TABS : NORMAL_TABS))

function isActive(tab: TabItem): boolean {
  if (tab.to === '/') return route.path === '/'
  return route.path === tab.to || route.path.startsWith(`${tab.to}/`)
}
</script>

<template>
  <nav class="tabbar" aria-label="主导航">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="tabbar-item"
      :data-active="isActive(tab)"
      :aria-current="isActive(tab) ? 'page' : undefined"
    >
      <AppIcon :name="tab.icon" :size="settings.elderMode ? 28 : 23" />
      <span>{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background: var(--c-surface);
  border-top: 1.5px solid var(--c-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.tabbar-item {
  min-height: calc(var(--tap) * 1.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 4px;
  color: var(--c-muted);
  text-decoration: none;
  font-size: 0.74rem;
  font-weight: 700;
  border-top: 3px solid transparent;
}

.tabbar-item[data-active='true'] {
  color: var(--c-primary);
  border-top-color: var(--c-primary);
  background: var(--c-primary-soft);
}

html[data-elder='on'] .tabbar-item { font-size: 0.9rem; }
</style>
