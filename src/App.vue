<script setup lang="ts">
import AppTabBar from '@/components/AppTabBar.vue'
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>

  <!-- 氛围背景：柔光色斑 + 线条装饰，纯装饰层，高对比模式自动隐藏 -->
  <div class="bg-scene" aria-hidden="true">
    <span class="blob blob-a"></span>
    <span class="blob blob-b"></span>
    <span class="blob blob-c"></span>
    <span class="ring-deco ring-deco--a"></span>
    <span class="ring-deco ring-deco--b"></span>
    <svg class="leaf-deco leaf-deco--a" width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 21c0-9.5 7.5-17 17-17 0 9.5-7.5 17-17 17z" />
      <path d="M5 19C9.5 14.5 14 10 18.5 5.5" />
    </svg>
    <svg class="leaf-deco leaf-deco--b" width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 21c0-9.5 7.5-17 17-17 0 9.5-7.5 17-17 17z" />
      <path d="M5 19C9.5 14.5 14 10 18.5 5.5" />
    </svg>
  </div>

  <RouterView />
  <AppTabBar />
</template>
