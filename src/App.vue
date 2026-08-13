<script setup lang="ts">
import AppTabBar from '@/components/AppTabBar.vue'
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <RouterView />
  <AppTabBar />
</template>
