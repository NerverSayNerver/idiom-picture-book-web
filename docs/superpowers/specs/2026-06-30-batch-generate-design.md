# 多选批量生成绘本设计

**日期**: 2026-06-30
**状态**: 已批准

## 问题

ContentSelector 当前只支持单选 → 提交一个任务。已生成的词条通过 `generatedTexts`（来自书架 index）显示绿勾，但正在生成中的词条没有视觉反馈，用户可能反复提交同一个词条。

## 目标

1. ContentSelector compact 版支持多选词条 → 批量提交生成绘本
2. 已提交（排队中/生成中）的词条显示灰蓝标签，避免重复提交
3. 已完成的词条保持绿勾显示

## 方案选择

选定 **方案 A：父组件传 activeTexts prop**。page.tsx 已有 `useJobs()` 轮询，提取 active sourceText 集合传入 ContentSelector，零额外请求。

排除方案 B（ContentSelector 内部调 useJobs——多一个轮询源）和 C（API 去重弹窗——体验差）。

## 详细设计

### 1. 数据流变更

**page.tsx** 新增一行派生逻辑：

```tsx
const activeTexts = useMemo(() =>
  new Set(jobs
    .filter(j => ['pending', 'running', 'paused'].includes(j.status))
    .map(j => j.sourceText)),
  [jobs]
)
```

新增 prop 透传：

```tsx
<ContentSelector
  category={currentCategory}
  compact
  generatedTexts={generatedTexts}
  activeTexts={activeTexts}
/>
```

### 2. ContentSelector compact 版改动

#### 2.1 Props 变更

```tsx
interface ContentSelectorProps {
  category: ContentCategory
  compact?: boolean
  generatedTexts?: string[]
  activeTexts?: Set<string>   // 新增
}
```

#### 2.2 状态变更

```tsx
// 移除单选
// const [selectedItem, setSelectedItem] = useState<string | null>(null)

// 改为多选
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
const [submitting, setSubmitting] = useState(false)
```

#### 2.3 词条视觉态（优先级从高到低）

| 条件 | className | 标签 | 交互 |
|------|-----------|------|------|
| `activeTexts.has(text)` | `bg-blue-50 text-blue-600 border-blue-200` | 「排队中」蓝色小角标 | 不可点击 |
| `generatedTexts.includes(text)` | `bg-green-50 text-green-700 border-green-200` | 绿勾 ✓ | 不可点击 |
| `selectedItems.has(text)` | `bg-blue-600 text-white ring-2 ring-blue-300` | 蓝勾 ✓ | 可点击取消 |
| 默认 | `bg-gray-50 hover:bg-gray-100 text-gray-700` | — | 可点击选中 |

#### 2.4 事件处理

```tsx
const handleToggleSelect = (text: string) => {
  if (activeTexts?.has(text)) return  // 已在队列，禁止操作
  if (generatedTexts.includes(text)) return  // 已完成，禁止操作

  setSelectedItems(prev => {
    const next = new Set(prev)
    next.has(text) ? next.delete(text) : next.add(text)
    return next
  })
}

const handleToggleAll = () => {
  const available = displayItems
    .map(i => i.sourceText)
    .filter(t => !activeTexts?.has(t) && !generatedTexts.includes(t))
  const allSelected = available.every(t => selectedItems.has(t))
  setSelectedItems(allSelected ? new Set() : new Set(available))
}

const handleStart = async () => {
  if (selectedItems.size === 0) return
  setSubmitting(true)
  setCurrentCategory(category)
  const texts = Array.from(selectedItems)
  await Promise.all(texts.map(t => createJobAPI(t, category)))
  setSelectedItems(new Set())
  setSubmitting(false)
}
```

#### 2.5 操作栏 UI

```
┌──────────────────────────────────────────────────────────┐
│ [全选可用] [清空已选]             自定义输入框  [生成已选 3 个] │
└──────────────────────────────────────────────────────────┘
```

- 「全选可用」/「清空已选」文字按钮，点击切换
- 生成按钮文案动态：「生成已选 N 个」，N=0 时禁用
- 提交中按钮显示 loading 状态

### 3. 不变部分

- full 版 ContentSelector 保持不变
- API `/api/jobs` POST 接口无需改动（已有去重）
- `useJobs` / `TaskQueue` 无需改动
- 自定义输入框保持不变，仍可单条输入 + 提交

## 影响范围

- `components/ContentSelector.tsx` — compact 分支重构
- `app/page.tsx` — 新增 `activeTexts` 派生 + prop 透传

## 风险

- `activeTexts` 和 `generatedTexts` 两条数据源可能有极短时间窗口不一致（任务刚完成时 index 未刷新）。视觉上会短暂同时显示「排队中」和绿勾，但无实际危害，因为下次 index 刷新后 `generatedTexts` 会覆盖。
