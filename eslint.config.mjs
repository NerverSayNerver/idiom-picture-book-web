import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ── react-hooks v6（Compiler 系）新规则 ──────────────────────────────
      // set-state-in-effect / refs / immutability 对既有命令式模式
      // （ref 翻页状态机、SWR data→setState 同步、effect 内定时器句柄写入）
      // 全量报警，共 35 处。这些代码已通过 28 项机械验收（docs/superpowers/specs/
      // 2026-11-23-loading-ux-spec.md §14），重构需专门轮次。
      // 降为 warn 保留可见性；purity 保持 error（存量仅 2 处有意设计，已行内豁免）。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',

      // ── 类型收紧 ──────────────────────────────────────────────────────────
      // 存量 20 处 any 集中在 JSON 边界断言与 catch 块，安全收紧需逐处理解
      // 语义并定义中间类型，另起「类型收紧」轮次处理。warn 保证新增 any 可见。
      '@typescript-eslint/no-explicit-any': 'warn',

      // _ 前缀 = 接口要求但实现有意不用的参数（4 个 content-type strategy）
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // ── 有意决策 ──────────────────────────────────────────────────────────
      // 本项目用原生 <img> + <picture> 按视口选档（lib/image-tiers.ts 多档
      // WebP 管线），next/image 的 DPR 驱动升档会把缩略图收益无声抹掉，
      // 这是 2026-11-24 性能轮的明确决策，不开此规则。
      '@next/next/no-img-element': 'off',
    },
  },
  {
    // CJS 运维脚本与 Next 配置：require 是惯例，不强制 ESM 化
    files: ['scripts/**', 'e2e-test.js', 'next.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'public/generated/**',
    'logs/**',
    'node_modules/**',
  ]),
])
