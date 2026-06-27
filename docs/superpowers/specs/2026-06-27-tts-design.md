# TTS 朗读功能设计文档

## 概述

为成语绘本阅读器添加 TTS（Text-to-Speech）朗读功能，使用浏览器原生 Web Speech API，支持连续朗读、文字高亮同步、语速调节和自动翻页。

## 技术方案

**选择：Web Speech API**

- 浏览器原生免费，零外部依赖
- 中文语音质量适合儿童绘本场景
- Chrome、Edge、Safari 支持良好

**架构：自定义 React Hook（`useTTS`）**

- 封装所有 Web Speech API 逻辑
- 组件级状态，与现有 React 架构一致
- 不污染全局 Zustand store

## 功能规格

### 1. 朗读模式

**连续朗读模式：**
- 点击"朗读"按钮后，从当前页的旁白开始朗读
- 读完当前页后自动翻到下一页，继续朗读
- 直到读完全书（含义页）自动停止
- 封面页和含义页跳过旁白朗读（封面可朗读标题，含义页可朗读含义文本）

### 2. 播放控件（工具栏集成）

在 BookViewer 工具栏中集成以下控件：

| 控件 | 行为 |
|------|------|
| 🔊 朗读 | 点击开始连续朗读；再次点击停止 |
| ⏸ 暂停 | 朗读时显示；点击暂停/恢复 |
| 🐢 语速 | 循环切换：0.5x → 0.75x → 1.0x → 1.25x → 1.5x → 0.5x |

- 未朗读时只显示"朗读"按钮
- 朗读中显示"暂停"和"语速"按钮
- 按钮样式与现有工具栏按钮一致（蓝色/紫色/绿色色系）

### 3. 文字高亮同步

- 朗读旁白时，当前正在朗读的字符高亮显示（黄色背景）
- 使用 `SpeechSynthesisUtterance.onboundary` 事件获取 `charIndex`
- 高亮样式：`bg-yellow-200` 背景色

### 4. 自动翻页

- 朗读完当前页旁白后，通过 `onend` 事件检测结束
- 自动调用 `goToNext()` 翻到下一页
- 翻页后自动开始新页的朗读
- 到达最后一页（含义页）时停止朗读

### 5. 语速持久化

- 用户选择的语速保存到 `localStorage`（key: `tts-rate`）
- 下次打开页面时自动恢复上次的语速设置

## 文件变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `hooks/useTTS.ts` | TTS 核心 hook，封装 Web Speech API |

### 修改文件

| 文件 | 说明 |
|------|------|
| `components/BookViewer.tsx` | 集成 TTS 控件、文字高亮、自动翻页 |

## Hook 接口设计

```typescript
interface UseTTSReturn {
  // 状态
  isPlaying: boolean
  isPaused: boolean
  rate: number
  currentCharIndex: number

  // 方法
  speak: (text: string) => void
  stop: () => void
  togglePause: () => void
  setRate: (rate: number) => void
  speakScenes: (
    scenes: Array<{ narration: string }>,
    startIndex: number,
    onSceneEnd: (index: number) => void
  ) => void
}
```

### 核心方法说明

**`speak(text)`**
- 创建 `SpeechSynthesisUtterance`，设置 `lang: 'zh-CN'`
- 通过 `onboundary` 事件更新 `currentCharIndex`
- 通过 `onend` 事件更新 `isPlaying` 状态

**`speakScenes(scenes, startIndex, onSceneEnd)`**
- 从 `startIndex` 开始连续朗读多个场景
- 每读完一个场景调用 `onSceneEnd(index)` 回调
- 内部自动递进到下一个场景

**`stop()`**
- 调用 `window.speechSynthesis.cancel()`
- 重置所有状态

**`togglePause()`**
- 暂停时调用 `window.speechSynthesis.pause()`
- 恢复时调用 `window.speechSynthesis.resume()`

## 边界情况

1. **浏览器不兼容**：检测 `window.speechSynthesis` 是否可用，不可用时隐藏朗读按钮
2. **手动翻页**：朗读中用户手动翻页时，停止当前朗读，自动开始新页朗读
3. **组件卸载**：离开页面时自动停止朗读（`useEffect` cleanup）
4. **封面页/含义页**：封面朗读标题，含义页朗读含义文本，无旁白的页面跳过
5. **语音选择**：优先选择 `lang` 以 `zh` 开头的语音，回退到默认语音

## 不做的事

- 不添加背景音乐功能（YAGNI）
- 不添加逐句朗读模式（当前按页朗读已足够）
- 不添加语音选择 UI（使用默认中文语音即可）
- 不将 TTS 状态放入全局 store（纯页面级功能）
