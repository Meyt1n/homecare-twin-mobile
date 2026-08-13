import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { initAccessibility } from './stores/accessibility'
import './style.css'

// 先应用无障碍设置（字号/对比度/动效），再挂载应用，避免首屏样式跳变。
initAccessibility()

createApp(App).use(router).mount('#app')
