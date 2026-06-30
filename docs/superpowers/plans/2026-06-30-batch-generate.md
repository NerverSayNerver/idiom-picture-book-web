# 多选批量生成绘本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ContentSelector compact 版支持多选词条批量提交生成，已提交词条显示"排队中/生成中"标签防止重复提交

**Architecture:** page.tsx 通过已有 `useJobs()` 派生出 `activeTexts` Set 传入 ContentSelector，组件内部改用 `Set<string>` 管理多选状态，词条按钮根据 active/generated/selected 三态渲染不同视觉

**Tech Stack:** React, Next.js, TypeScript, Tailwind CSS

---

### Task 1: page.tsx 派生 activeTexts 并传入 ContentSelector

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 在 page.tsx 中新增 activeTexts 派生逻辑**

在现有 `generatedTexts` 的 `useMemo` 之后，新增：

```tsx
const activeTexts = useMemo(() =>
  new Set(jobs
    .filter(j => ['pending', 'running', 'paused'].includes(j.status))
    .map(j => j.sourceText)),
  [jobs]
)
```

- [ ] **Step 2: 将 activeTexts 传入 ContentSelector**

找到：
```tsx
<ContentSelector category={currentCategory} compact generatedTexts={generatedTexts} />
```

替换为：
```tsx
<ContentSelector category={currentCategory} compact generatedTexts={generatedTexts} activeTexts={activeTexts} />
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: pass activeTexts from useJobs to ContentSelector"
```

---

### Task 2: ContentSelector — Props 接口与状态改为多选

**Files:**
- Modify: `components/ContentSelector.tsx`

- [ ] **Step 1: 修改 Props 接口，新增 activeTexts**

将：
```tsx
interface ContentSelectorProps {
  category: ContentCategory
  compact?: boolean
  generatedTexts?: string[]
}
```

替换为：
```tsx
interface ContentSelectorProps {
  category: ContentCategory
  compact?: boolean
  generatedTexts?: string[]
  activeTexts?: Set<string>
}
```

- [ ] **Step 2: 修改组件签名，接收 activeTexts**

将：
```tsx
export function ContentSelector({ category, compact, generatedTexts = [] }: ContentSelectorProps) {
```

替换为：
```tsx
export function ContentSelector({ category, compact, generatedTexts = [], activeTexts = new Set() }: ContentSelectorProps) {
```

- [ ] **Step 3: 替换单选状态为多选状态**

将：
```tsx
const [selectedItem, setSelectedItem] = useState<string | null>(null)
```

替换为：
```tsx
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
const [submitting, setSubmitting] = useState(false)
```

- [ ] **Step 4: category 切换时重置多选状态**

在 `useEffect` 中，将 `setSelectedItem(null)` 替换为 `setSelectedItems(new Set())`

- [ ] **Step 5: Commit**

```bash
git add components/ContentSelector.tsx
git commit -m "feat(ContentSelector): switch single-select to multi-select state + add activeTexts prop"
```

---

### Task 3: ContentSelector compact 分支 — 词条按钮三态渲染

**Files:**
- Modify: `components/ContentSelector.tsx`（compact 分支的 `displayItems.map` 部分，约第 111-139 行）

- [ ] **Step 1: 重写紧凑版词条按钮的 className 和点击逻辑**

在 compact 分支的 `displayItems.map` 回调中，将现有的 `isSelected` / `isGenerated` 判断替换为三态判断：

```tsx
{displayItems.map((item) => {
  const isGenerated = generatedTexts.includes(item.sourceText)
  const isActive = activeTexts.has(item.sourceText)
  const isSelected = selectedItems.has(item.sourceText)
  const isDisabled = isGenerated || isActive

  let btnClass: string
  if (isActive) {
    btnClass = 'bg-blue-50 text-blue-600 border border-blue-200 cursor-not-allowed'
  } else if (isGenerated) {
    btnClass = 'bg-green-50 text-green-700 border border-green-200 cursor-not-allowed'
  } else if (isSelected) {
    btnClass = 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
  } else {
    btnClass = 'bg-gray-50 hover:bg-gray-100 text-gray-700'
  }

  return (
    <button
      key={item.sourceText}
      onClick={() => !isDisabled && handleToggleSelect(item.sourceText)}
      className={`py-2 px-1 rounded-lg text-xs font-medium transition-all relative leading-tight ${btnClass}`}
    >
      {item.sourceText}
      {[item.dynasty, item.author].filter(Boolean).join(' ') && (
        <span className="block text-[10px] opacity-70 mt-0.5">{[item.dynasty, item.author].filter(Boolean).join(' ')}</span>
      )}
      {isSelected && (
        <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">✓</span>
      )}
      {isActive && !isSelected && (
        <span className="absolute -top-1 -right-1 bg-blue-400 text-white text-[8px] rounded-full px-1 h-3.5 flex items-center justify-center">排队中</span>
      )}
      {isGenerated && !isSelected && (
        <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">✓</span>
      )}
    </button>
  )
})}
```

- [ ] **Step 2: 同步更新非 compact 分支的 isSelected 变量引用**

full 版的 `displayItems.map` 中 `isSelected` 仍然引用旧的 `selectedItem === item.sourceText`。在 full 分支中保持原有逻辑不变（full 版不在本次改动范围），仅确认 compact 分支使用了新逻辑即可。

- [ ] **Step 3: Commit**

```bash
git add components/ContentSelector.tsx
git commit -m "feat(ContentSelector): compact branch shows 3-state visual for active/generated/selected items"
```

---

### Task 4: ContentSelector — 新增选择切换与批量提交 handlers

**Files:**
- Modify: `components/ContentSelector.tsx`

- [ ] **Step 1: 替换 handleSelect 为 handleToggleSelect**

将现有的 `handleSelect` 函数替换为：

```tsx
const handleToggleSelect = (text: string) => {
  if (activeTexts.has(text)) return
  if (generatedTexts.includes(text)) return
  setSelectedItems(prev => {
    const next = new Set(prev)
    if (next.has(text)) {
      next.delete(text)
    } else {
      next.add(text)
    }
    return next
  })
  setCustomInput('')
}
```

- [ ] **Step 2: 新增 handleToggleAll 函数**

在 `handleToggleSelect` 之后新增：

```tsx
const handleToggleAll = () => {
  const available = displayItems
    .map(i => i.sourceText)
    .filter(t => !activeTexts.has(t) && !generatedTexts.includes(t))
  const allSelected = available.length > 0 && available.every(t => selectedItems.has(t))
  setSelectedItems(allSelected ? new Set() : new Set(available))
}
```

- [ ] **Step 3: 重写 handleStart 为批量提交**

将现有的 `handleStart` 函数替换为：

```tsx
const handleStart = async () => {
  const allTexts = [...selectedItems]
  if (customInput.trim() && strategy.validate(customInput.trim())) {
    allTexts.push(customInput.trim())
  }
  if (allTexts.length === 0) return

  setCurrentCategory(category)
  setSubmitting(true)
  await Promise.all(allTexts.map(t => createJobAPI(t, category)))
  setSelectedItems(new Set())
  setCustomInput('')
  setSubmitting(false)
}
```

- [ ] **Step 4: 移除旧的 activeItem 计算**

删除（或注释掉）这行：
```tsx
const activeItem = selectedItem || customInput.trim()
```

- [ ] **Step 5: Commit**

```bash
git add components/ContentSelector.tsx
git commit -m "feat(ContentSelector): add toggle selection and batch submit handlers"
```

---

### Task 5: ContentSelector compact 分支 — 操作栏 UI 更新

**Files:**
- Modify: `components/ContentSelector.tsx`（compact 分支的底部操作栏，约第 141-156 行）

- [ ] **Step 1: 替换 compact 分支底部操作栏**

将：
```tsx
<div className="flex gap-2">
  <input
    type="text"
    value={customInput}
    onChange={(e) => setCustomInput(e.target.value)}
    placeholder={`输入${strategy.label}...`}
    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
  />
  <button
    onClick={handleStart}
    disabled={!activeItem}
    className="px-4 py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
  >
    🚀 开始生成
  </button>
</div>
```

替换为：
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <button
      onClick={handleToggleAll}
      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
    >
      {(() => {
        const available = displayItems
          .map(i => i.sourceText)
          .filter(t => !activeTexts.has(t) && !generatedTexts.includes(t))
        const allSelected = available.length > 0 && available.every(t => selectedItems.has(t))
        return allSelected ? '🗑 清空已选' : '☑ 全选可用'
      })()}
    </button>
    <span className="text-xs text-gray-400">
      已选 {selectedItems.size} 个
    </span>
  </div>
  <div className="flex gap-2">
    <input
      type="text"
      value={customInput}
      onChange={(e) => {
        setCustomInput(e.target.value)
        setSelectedItems(new Set())
      }}
      placeholder={`输入${strategy.label}...`}
      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
    />
    <button
      onClick={handleStart}
      disabled={selectedItems.size === 0 && !customInput.trim()}
      className="px-4 py-2 bg-primary text-white rounded-button text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {submitting ? '⏳ 提交中...' : selectedItems.size > 0 ? `🚀 生成 ${selectedItems.size} 个` : '🚀 开始生成'}
    </button>
  </div>
</div>
```

- [ ] **Step 2: 验证 TypeScript 类型检查通过**

```bash
npx tsc --noEmit
```

预期：无新增错误

- [ ] **Step 3: Commit**

```bash
git add components/ContentSelector.tsx
```

```bash
git commit -m "feat(ContentSelector): compact action bar with select-all and batch generate button"
```

---

### Task 6: 验证与手动测试

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 手动测试检查清单**

打开浏览器访问首页:

- [ ] 默认 Tab 加载后，词条正常显示（未选中、灰底）
- [ ] 点击词条 → 蓝底蓝勾（已选）；再点 → 取消选中
- [ ] 点击「全选可用」→ 所有非 active/非 generated 词条变为已选
- [ ] 再次点击「清空已选」→ 全部取消
- [ ] 已生成（绿勾）和 active（排队中蓝标）的词条不可点击
- [ ] 选中 3 个词条 → 按钮文案「生成 3 个」→ 点击提交
- [ ] 提交后词条状态清空，TaskQueue 出现 3 个新任务
- [ ] 刚提交的词条显示「排队中」标签，不可再次选中
- [ ] 任务完成后书架刷新，对应词条显示绿勾
- [ ] 自定义输入框输入文字 + 同时选中词条 → 提交时一并提交

- [ ] **Step 3: 最终 commit（如有微调）**

```bash
git add -A
git commit -m "fix: address manual test findings" --allow-empty
```
