import { reactive, readonly } from 'vue'

/** 字号档位：标准 / 大 / 特大 */
export type FontScale = 'standard' | 'large' | 'xlarge'

export interface AccessibilitySettings {
  /** 长辈模式：特大字号 + 语音播报 + 简化导航 + 更大触控目标 */
  elderMode: boolean
  fontScale: FontScale
  highContrast: boolean
  voiceBroadcast: boolean
  reduceMotion: boolean
}

export const A11Y_STORAGE_KEY = 'hct-mobile.a11y.v1'

export const DEFAULT_SETTINGS: AccessibilitySettings = {
  elderMode: false,
  fontScale: 'standard',
  highContrast: false,
  voiceBroadcast: false,
  reduceMotion: false,
}

const FONT_SCALES: FontScale[] = ['standard', 'large', 'xlarge']

/** 把任意持久化数据规范化为合法设置，异常输入回退默认值。 */
export function normalizeSettings(raw: unknown): AccessibilitySettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const record = raw as Record<string, unknown>
  const fontScale = FONT_SCALES.includes(record.fontScale as FontScale)
    ? (record.fontScale as FontScale)
    : DEFAULT_SETTINGS.fontScale
  return {
    elderMode: record.elderMode === true,
    fontScale,
    highContrast: record.highContrast === true,
    voiceBroadcast: record.voiceBroadcast === true,
    reduceMotion: record.reduceMotion === true,
  }
}

export function loadSettings(storage: Pick<Storage, 'getItem'>): AccessibilitySettings {
  try {
    const text = storage.getItem(A11Y_STORAGE_KEY)
    if (!text) return { ...DEFAULT_SETTINGS }
    return normalizeSettings(JSON.parse(text))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: AccessibilitySettings,
): void {
  try {
    storage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 存储不可用（隐私模式等）时静默降级，仅本次会话生效。
  }
}

/** 把设置写到 <html> 的 data-* 属性上，驱动全局 CSS 变量。 */
export function applySettingsToDocument(settings: AccessibilitySettings, doc: Document): void {
  const root = doc.documentElement
  root.dataset.fontScale = settings.fontScale
  root.dataset.contrast = settings.highContrast ? 'high' : 'normal'
  root.dataset.motion = settings.reduceMotion ? 'reduced' : 'normal'
  root.dataset.elder = settings.elderMode ? 'on' : 'off'
}

const state = reactive<AccessibilitySettings>({ ...DEFAULT_SETTINGS })

function persistAndApply(): void {
  if (typeof localStorage !== 'undefined') saveSettings(localStorage, { ...state })
  if (typeof document !== 'undefined') applySettingsToDocument(state, document)
}

/** 应用启动时调用：读取持久化设置并立即应用，避免首屏闪烁。 */
export function initAccessibility(): void {
  if (typeof localStorage !== 'undefined') {
    Object.assign(state, loadSettings(localStorage))
  }
  if (typeof document !== 'undefined') applySettingsToDocument(state, document)
}

export function setFontScale(scale: FontScale): void {
  state.fontScale = scale
  persistAndApply()
}

export function setHighContrast(enabled: boolean): void {
  state.highContrast = enabled
  persistAndApply()
}

export function setVoiceBroadcast(enabled: boolean): void {
  state.voiceBroadcast = enabled
  persistAndApply()
}

export function setReduceMotion(enabled: boolean): void {
  state.reduceMotion = enabled
  persistAndApply()
}

/**
 * 长辈模式是一组预设：开启时自动调到特大字号并打开语音播报；
 * 关闭时字号与语音回到默认，其余细项（对比度、动效）保留用户选择。
 */
export function setElderMode(enabled: boolean): void {
  state.elderMode = enabled
  if (enabled) {
    state.fontScale = 'xlarge'
    state.voiceBroadcast = true
  } else {
    state.fontScale = 'standard'
    state.voiceBroadcast = false
  }
  persistAndApply()
}

export function resetAccessibility(): void {
  Object.assign(state, { ...DEFAULT_SETTINGS })
  persistAndApply()
}

export function useA11y() {
  return {
    settings: readonly(state),
    setFontScale,
    setHighContrast,
    setVoiceBroadcast,
    setReduceMotion,
    setElderMode,
    resetAccessibility,
  }
}
