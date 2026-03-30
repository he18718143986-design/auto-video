# 前端信息架构图 (Frontend Information Architecture)

本文档是 Auto Video Studio Tauri/React 前端的完整信息架构图，同时包含生产就绪度评估和视频生成流程分析。

---

## 目录

1. [生产就绪度评估](#1-生产就绪度评估)
2. [视频生成完整流程](#2-视频生成完整流程)
3. [前端信息架构总览](#3-前端信息架构总览)
4. [页面级信息架构详图](#4-页面级信息架构详图)
5. [数据流架构](#5-数据流架构)
6. [API 端点映射](#6-api-端点映射)

---

## 1. 生产就绪度评估

### ✅ 已完成（可工作）

| 模块 | 状态 | 说明 |
|------|------|------|
| 12 阶段管线 | ✅ 完整 | session_preparation → capability_assessment → style_dna → research → narrative_map → script → qa → storyboard → asset_generation → scene_video_generation → tts → render |
| Mock 模式 | ✅ 完整 | 全流程可在无浏览器/AI 的情况下本地跑通 |
| 浏览器自动化 | ✅ 完整 | Playwright 持久上下文，多配置文件轮换 |
| 暂停/恢复 | ✅ 完整 | 任意阶段可暂停，后续恢复 |
| 人工交接 | ✅ 完整 | needs_human 状态 + 检查清单 + 确认备注 |
| 从阶段重试 | ✅ 完整 | 复用前序产物，从指定阶段重新开始 |
| 每日配额 | ✅ 完整 | 可配置的每日运行限制 |
| 多配置文件轮换 | ✅ 完整 | 手动 / Round-Robin 两种模式 |
| React UI | ✅ 完整 | 5 个页面全部实现，含实时 SSE 更新与资产浏览 |
| 后端 API | ✅ 完整 | 20+ 个端点，覆盖所有 CRUD 和控制操作 |
| 选择器调试器 | ✅ 完整 | 探测 + 截图 + 快照历史；后端提供快照对比 API |
| TTS 多提供商回退 | ✅ 完整 | OpenAI → 系统 TTS → FFmpeg 音调 |
| 图像生成回退 | ✅ 完整 | OpenAI → Pollinations |
| FFmpeg 渲染 | ✅ 完整 | 关键帧 + 语音 + 字幕 → MP4 |
| 69 个单元测试 | ✅ 通过 | 覆盖配置、编排、验证、提取器、工具 |
| TypeScript 类型检查 | ✅ 通过 | 后端 + 前端均无错误 |

### ⚠️ 生产注意事项

| 项目 | 状态 | 建议 |
|------|------|------|
| 错误恢复 | ⚠️ 基础 | 有 needs_human 和 retry 机制，但缺少自动重试策略 |
| 日志 / 监控 | ⚠️ 基础 | console.log 级别，无结构化日志或外部监控 |
| 认证 / 鉴权 | ❌ 无 | 本地优先设计，无用户系统（适合个人/团队内部使用） |
| HTTPS | ❌ 无 | 仅 HTTP，生产需反向代理或 Tauri 桌面模式 |
| 数据库 | ⚠️ 文件系统 | JSON 文件存储，大量运行历史时性能可能下降 |
| E2E 测试 | ❌ 无 | 无端到端测试覆盖 |
| CI/CD | ❌ 无 | 无自动化构建/部署流水线 |
| Tauri 打包 | ⚠️ 未验证 | 配置就绪但未实际构建桌面安装包 |

### 结论

> **当前状态：可用于个人/小团队内部使用的 MVP（最小可行产品）。**
> 核心视频生成流程完整，UI 功能齐全，但缺少生产级基础设施（认证、日志、CI/CD）。
> 这符合项目"本地优先工作台"的定位。

---

## 2. 视频生成完整流程

### 管线流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Auto Video 12-Stage Pipeline                        │
│                                                                         │
│  ┌─────────────┐   ┌─────────────────┐   ┌───────────┐   ┌──────────┐ │
│  │ 1. Session   │──▶│ 2. Capability   │──▶│ 3. Style  │──▶│ 4. Re-   │ │
│  │ Preparation  │   │ Assessment      │   │ DNA       │   │ search   │ │
│  │              │   │                 │   │           │   │          │ │
│  │ 验证浏览器    │   │ 评估 AI 模型     │   │ 定义视觉/ │   │ 研究主题  │ │
│  │ 会话就绪      │   │ 能力和风格       │   │ 音频风格   │   │ 事实素材  │ │
│  └─────────────┘   └─────────────────┘   └───────────┘   └──────────┘ │
│         │                                       │                       │
│         │ [上传参考视频]                          │                       │
│         ▼                                       ▼                       │
│  ┌─────────────┐   ┌─────────────────┐   ┌───────────┐   ┌──────────┐ │
│  │ 5. Narrative │──▶│ 6. Script       │──▶│ 7. QA     │──▶│ 8. Story │ │
│  │ Map          │   │                 │   │           │   │ board    │ │
│  │              │   │                 │   │           │   │          │ │
│  │ 叙事结构      │   │ 完整分场脚本     │   │ 质量/安全  │   │ 视觉分镜  │ │
│  │ (场景+节拍)   │   │ (详细旁白)       │   │ 审查       │   │ (镜头方向)│ │
│  └─────────────┘   └─────────────────┘   └───────────┘   └──────────┘ │
│                                                                         │
│  ┌─────────────┐   ┌─────────────────┐   ┌───────────┐   ┌──────────┐ │
│  │ 9. Asset     │──▶│ 10. Scene Video │──▶│ 11. TTS   │──▶│ 12. Ren- │ │
│  │ Generation   │   │ Generation      │   │           │   │ der      │ │
│  │              │   │                 │   │           │   │          │ │
│  │ 关键帧图像    │   │ 场景视频规划     │   │ 语音合成   │   │ FFmpeg   │ │
│  │ 生成          │   │ (静态图管线)     │   │ (多提供商) │   │ 最终合成  │ │
│  └─────────────┘   └─────────────────┘   └───────────┘   └──────────┘ │
│                                                                         │
│  ── 控制流 ──────────────────────────────────────────────────────────── │
│  • 每个阶段前后可 [暂停/恢复]                                            │
│  • 浏览器异常触发 [needs_human] → 人工交接 → 继续                        │
│  • 失败后可从任意阶段 [重试]，复用前序产物                                │
│  • Round-Robin 模式下不同阶段可路由到不同浏览器配置文件                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 阶段详情

| # | 阶段 | 输入 | AI 交互 | 输出文件 | 产物 |
|---|------|------|---------|---------|------|
| 1 | session_preparation | 浏览器配置 | 检查会话 | `outputs/session_preparation.json` | 会话状态 |
| 2 | capability_assessment | 主题 | 提示词 → AI | `outputs/capability_assessment.json` | 能力评估 |
| 3 | style_dna | 能力评估 + 参考视频 | 提示词 → AI (可上传) | `outputs/style_dna.json` | 风格 DNA |
| 4 | research | 能力评估 + 风格 DNA | 提示词 → AI | `outputs/research.json` | 研究素材 |
| 5 | narrative_map | 研究 + 风格 DNA | 提示词 → AI | `outputs/narrative_map.json` | 叙事地图 |
| 6 | script | 叙事地图 + 风格 DNA | 提示词 → AI | `outputs/script.json` | 分场脚本 |
| 7 | qa | 脚本 + 研究 | 提示词 → AI | `outputs/qa.json` | 质量审查 |
| 8 | storyboard | 脚本 + 风格 DNA | 提示词 → AI | `outputs/storyboard.json` | 视觉分镜 |
| 9 | asset_generation | 分镜 | 图像 API | `media/scenes/*/keyframe.png` | 关键帧图片 |
| 10 | scene_video_generation | 分镜 | (规划阶段) | `outputs/video_generation_log.json` | 视频计划 |
| 11 | tts | 脚本 | TTS API | `media/scenes/*/voice.mp3` | 语音旁白 |
| 12 | render | 全部 | FFmpeg 本地 | `final/final_video.mp4` | 最终视频 |

### 提示词上下文链

```
capability_assessment ─────────┐
                               ▼
style_dna ◄── capability ──── research ◄── capability + styleDna
                               ▼
narrative_map ◄── research + styleDna
                               ▼
script ◄── narrativeMap + styleDna
                               ▼
qa ◄── script + research
                               ▼
storyboard ◄── script + styleDna
```

每个文本阶段的提示词都包含前序阶段的 JSON 输出作为上下文，确保一致性。

### 产物目录结构

```
runs/<run-id>/
├── run.json                   # 运行元数据 + 状态 + 历史
├── outputs/
│   ├── session_preparation.json
│   ├── capability_assessment.txt
│   ├── capability_assessment.json
│   ├── style_dna.raw.txt
│   ├── style_dna.json
│   ├── research.raw.txt
│   ├── research.json
│   ├── narrative_map.raw.txt
│   ├── narrative_map.json
│   ├── script.raw.txt
│   ├── script.json
│   ├── qa.raw.txt
│   ├── qa.json
│   ├── storyboard.raw.txt
│   ├── storyboard.json
│   ├── asset_generation.json
│   ├── video_generation_log.json
│   └── tts_manifest.json
├── media/
│   ├── reference_sheet.png
│   └── scenes/
│       ├── 1/
│       │   ├── keyframe.png
│       │   └── voice.mp3
│       ├── 2/ ...
│       └── N/ ...
├── screenshots/
│   ├── live/
│   │   └── latest.{jpg|png}   # SSE 实时预览
│   └── <stage>-*.jpg          # 各阶段截图
└── final/
    ├── final_video.mp4        # 最终渲染输出
    ├── render_manifest.json
    └── subtitles.srt
```

---

## 3. 前端信息架构总览

### 应用结构树

```
Auto Video Studio (Tauri 桌面应用 / Web SPA)
│
├── 顶栏 (TopBar) ──────────────────────────────────
│   ├── 应用标题: "Auto Video Studio"
│   ├── 运行指示器: [图标] [状态点] "Run active/paused"
│   └── (Tauri) 窗口拖拽区域 (app-region: drag)
│
├── 侧边栏导航 (Sidebar) ──── 200px / 响应式 56px ───
│   ├── 🏠 Home         → /
│   ├── ➕ New Run      → /new-run
│   ├── 🎬 Studio       → /studio | /studio/:runId
│   ├── 📚 Library      → /library
│   └── ⚙️ Settings     → /settings
│
└── 主内容区 (Main) ─────────────────────────────────
    ├── Home        → 仪表盘概览
    ├── NewRun      → 运行创建向导
    ├── Studio      → 运行监控工作台
    ├── Library     → 运行历史浏览
    └── Settings    → 系统配置管理
```

### 信息层级

```
L0 ── 应用外壳 (Layout)
│
├── L1 ── 页面 (Page)
│   │
│   ├── L2 ── 区域/面板 (Section/Panel)
│   │   │
│   │   ├── L3 ── 卡片/表单组 (Card/FormGroup)
│   │   │   │
│   │   │   └── L4 ── 字段/按钮/数据项 (Field/Action/DataItem)
│   │   │
│   │   └── L3 ── 标签页 (Tab)
│   │       │
│   │       └── L4 ── 内容区 (TabContent)
│   │
│   └── L2 ── 操作栏 (ActionBar)
│       │
│       └── L3 ── 按钮组 (ButtonGroup)
│
└── L1 ── 全局状态 (Global State)
    ├── SSE 实时事件流
    ├── 活跃运行 ID
    ├── 暂停状态
    └── 实时预览 URL
```

---

## 4. 页面级信息架构详图

### 4.1 Home — 仪表盘

```
Home (/)
│
├── 标题区
│   ├── "Welcome back"
│   └── "Quick overview of your workspace"
│
├── 状态卡片组 (3 列)
│   ├── 🟢 Active Run
│   │   ├── 有活跃运行: 主题 + 状态 + 阶段 + 时间
│   │   └── 无活跃运行: "No active run" + 引导
│   │
│   ├── ⚠️ Needs Attention
│   │   ├── 计数: needs_human 状态的运行数
│   │   └── 说明: 需要手动操作提示
│   │
│   └── 🔧 Environment
│       ├── 配置文件数量
│       ├── 默认配置文件名称
│       └── 加载状态指示
│
├── Recent Runs (最近 5 条)
│   ├── 运行卡片 × N
│   │   ├── 主题
│   │   ├── 状态药丸 (颜色编码)
│   │   ├── 阶段名称
│   │   └── 相对时间
│   └── 无运行: "No runs yet" 提示
│
└── Quick Actions (快捷操作)
    ├── [➕ New Run]      → /new-run
    ├── [🎬 Open Studio] → /studio
    └── [⚙️ Settings]    → /settings
```

**数据源**: `useRuns()` (SSE), `useConfig()`

### 4.2 NewRun — 运行创建向导

```
NewRun (/new-run)
│
├── 左面板: 创建表单
│   │
│   ├── 基础字段
│   │   ├── Topic (文本输入, 必填, 默认来自配置)
│   │   ├── Reference Path (文本输入, 可选, 参考视频路径)
│   │   ├── Provider (文本输入, 必填, AI 提供商标识)
│   │   ├── Browser Profile (下拉选择, 可选)
│   │   └── Mock Mode (复选框, 跳过真实浏览器)
│   │
│   ├── 高级设置 (折叠区)
│   │   └── Stage Routing (每阶段配置文件选择)
│   │       ├── capability_assessment → 配置文件下拉
│   │       ├── research             → 配置文件下拉
│   │       ├── script               → 配置文件下拉
│   │       ├── qa                   → 配置文件下拉
│   │       └── storyboard           → 配置文件下拉
│   │
│   ├── 配额信息
│   │   ├── remaining = 0 → 红色限制警告
│   │   └── remaining > 0 → 今日已用 / 剩余提示
│   │
│   └── [🚀 Start Run] 按钮
│       ├── 调用 POST /api/runs/start
│       ├── 成功 → 导航到 /studio
│       └── 失败 → 显示错误信息
│
└── 右面板: 运行预览
    │
    ├── Execution Path
    │   └── "12 stages in pipeline"
    │
    ├── 配置信息
    │   ├── Profile: 选中的配置文件名
    │   ├── Provider: 输入的提供商
    │   └── Topic: 当前输入或默认 topic
    │
    ├── Stage Routing 表格
    │   └── 阶段 → 配置文件 映射
    │
    └── 警告列表
        ├── Mock 模式提示
        ├── 缺少必填字段提示
        └── Provider / Topic 未填写提示
```

**数据源**: `useConfig()`, `useQuota()`
**操作**: `api.startRun()`

### 4.3 Studio — 运行监控工作台

```
Studio (/studio | /studio/:runId)
│
├── 命令栏 (CommandBar)
│   ├── 运行信息: 主题 | 阶段 | 提供商
│   ├── 状态药丸 (颜色编码)
│   └── 操作按钮组
│       ├── [⏸ Pause]          (运行中 → api.pauseRun)
│       ├── [▶ Resume]          (已暂停 → api.resumeRun)
│       ├── [🔄 Retry ▾]       (失败/完成 → 阶段选择下拉)
│       │   └── 阶段列表: 12 个阶段可选
│       └── [✅ Continue Human] (needs_human → api.continueHuman)
│
├── 左栏: 运行队列 (200px)
│   │
│   ├── 搜索框 (按主题/ID/提供商筛选)
│   │
│   ├── 过滤标签
│   │   ├── [All]
│   │   ├── [Running]
│   │   ├── [Needs Human]
│   │   ├── [Completed]
│   │   └── [Failed]
│   │
│   └── 运行列表
│       └── 运行条目 × N
│           ├── 主题 (截断)
│           ├── 状态药丸
│           ├── 当前阶段
│           └── 时间戳
│
├── 中栏: 工作区 (5 个标签页)
│   │
│   ├── 📊 Overview (概览)
│   │   ├── 主题 / 提供商 / 创建时间 / 耗时
│   │   ├── 阶段进度条
│   │   │   └── 12 个圆点: ✅完成 / ❌失败 / 🖐人工 / 🔵当前 / ⚪未到
│   │   └── 完成统计: "X of 12 stages completed"
│   │
│   ├── 🖥️ Live Browser (实时预览)
│   │   ├── 自动刷新截图 (activePreviewUrl)
│   │   └── 无活跃运行: 占位提示
│   │
│   ├── 📦 Outputs (产物浏览器)
│   │   ├── 顶部摘要
│   │   │   ├── manifest artifacts 计数
│   │   │   ├── media files 计数
│   │   │   ├── screenshots 计数
│   │   │   └── Only Final Video 开关
│   │   ├── 左侧分组列表
│   │   │   ├── Text Artifacts
│   │   │   ├── Media Files
│   │   │   └── Screenshots
│   │   └── 右侧预览面板
│   │       ├── 文本 / 图片 / 视频 / 音频预览
│   │       ├── [Download]
│   │       ├── [Copy Path]
│   │       └── [Open File]
│   │
│   ├── 📅 Timeline (时间线)
│   │   └── 历史条目列表 (倒序)
│   │       └── 条目
│   │           ├── 阶段名称
│   │           ├── 状态药丸
│   │           ├── 时间戳
│   │           └── 消息内容
│   │
│   └── 🤝 Handoff (人工交接)
│       ├── 确认备注 (文本域)
│       ├── 检查清单
│       │   ├── 条目 × N (复选框 + 文本 + 删除)
│       │   └── [+ Add Item] 添加条目
│       ├── [💾 Save] 保存交接数据
│       └── [▶ Continue] 继续运行
│
└── 右栏: 检查面板 (240px)
    │
    ├── 当前状态
    │   ├── Stage: 当前阶段名
    │   └── Status: 运行状态
    │
    ├── 活跃配置文件
    │   ├── 配置文件 ID
    │   └── Web URL
    │
    ├── 阶段路由表
    │   └── 阶段 → 配置文件 映射
    │
    ├── 最新错误 (如有)
    │   └── 错误消息 + 红色高亮
    │
    └── 建议操作
        ├── running: "Pipeline is running..."
        ├── paused: "Run is paused. Resume when ready."
        ├── needs_human: "Manual action required..."
        ├── failed: "Run failed. Check error and retry."
        └── completed: "Run completed successfully!"
```

**数据源**: `useRuns()` (SSE), `useRun(runId)`, `useRunDetails(runId)`, `useConfig()`
**操作**: `api.pauseRun()`, `api.resumeRun()`, `api.retryRun()`, `api.continueHuman()`, `api.saveHandoff()`

### 4.4 Library — 运行历史浏览

```
Library (/library)
│
├── 标签页切换
│   ├── 📋 Runs (运行列表)
│   └── 🎨 Assets (资产浏览)
│
├── Runs 标签页
│   ├── 搜索框 (按主题/ID 筛选)
│   └── 运行列表 (按创建时间倒序)
│       └── 运行卡片 × N
│           ├── 主题
│           ├── Run ID
│           ├── 创建时间
│           ├── 状态药丸
│           └── 点击 → /studio/<runId>
│
└── Assets 标签页
    ├── 左侧 Runs 列表
    │   ├── 主题
    │   ├── 状态
    │   └── 更新时间
    └── 右侧 Asset Browser
        ├── 运行标题 + 状态药丸
        ├── [Open in Studio]
        └── 复用 RunAssetsPanel 浏览文本、媒体、截图与 final video
```

**数据源**: `useRuns()` (SSE), `useRunDetails(selectedRunId)`
**导航**: 点击运行 → `/studio/<runId>`

### 4.5 Settings — 系统配置管理

```
Settings (/settings)
│
├── 标签页导航 (5 个标签)
│
├── 🔧 Browser Profiles (浏览器配置)
│   │
│   ├── 配置文件选择器
│   │   ├── 下拉选择框 (所有配置文件)
│   │   └── 默认配置文件选择器
│   │
│   ├── 操作按钮
│   │   ├── [+ Add Profile] → 创建新配置
│   │   └── [🗑 Delete]      → 删除当前配置 (确认对话框)
│   │
│   └── 配置表单
│       ├── 基础信息
│       │   ├── Name (名称)
│       │   └── User Data Dir (浏览器数据目录)
│       ├── 网页设置
│       │   └── Web URL (目标 AI 聊天网址)
│       ├── CSS 选择器
│       │   ├── Prompt Selector (输入框选择器)
│       │   ├── Ready Selector (就绪状态选择器)
│       │   ├── Upload Selector (文件上传选择器)
│       │   ├── Response Selector (响应内容选择器)
│       │   └── Send Button Selector (发送按钮选择器)
│       ├── 超时设置 (毫秒)
│       │   ├── Navigation Timeout
│       │   ├── Ready Timeout
│       │   ├── Response Timeout
│       │   └── Manual Login Timeout
│       ├── 开关选项
│       │   ├── ☐ Headless (无头模式)
│       │   └── ☐ Allow Manual Login (允许手动登录)
│       └── [💾 Save Profile]
│
├── 🔄 Stage Routing (阶段路由)
│   │
│   ├── 轮换模式
│   │   ├── [Manual]      手动模式 (默认配置文件)
│   │   └── [Round-Robin]  轮换模式 (自动分配)
│   │
│   └── 每阶段覆写 (仅文本阶段)
│       ├── capability_assessment → [配置文件下拉]
│       ├── research             → [配置文件下拉]
│       ├── script               → [配置文件下拉]
│       ├── qa                   → [配置文件下拉]
│       └── storyboard           → [配置文件下拉]
│
├── 📝 Prompts (提示词模板)
│   │
│   ├── 提示词选择器
│   │   └── 下拉: 7 个提示词文件
│   │       ├── capability-assessment.md
│   │       ├── style-dna.md
│   │       ├── research.md
│   │       ├── narrative-map.md
│   │       ├── script.md
│   │       ├── qa.md
│   │       └── storyboard.md
│   │
│   ├── 编辑区 (18 行等宽文本域)
│   │
│   └── [💾 Save Prompt]
│
├── 🔍 Selectors (选择器调试)
│   │
│   ├── 选择器调试器
│   │   ├── Profile 下拉选择
│   │   ├── [▶ Run Debug] 按钮
│   │   └── 结果区
│   │       └── JSON 原样展示当前调试结果
│   │
│   └── 快照历史
│       └── 快照列表 (按时间倒序)
│           └── 条目
│               ├── 配置文件 ID
│               ├── 时间戳
│               └── 选择器数量
│
│   注: `/api/selectors/compare` 已存在，但当前 UI 还没有独立的 diff 面板
│
└── 🖥️ System (系统信息)
    │
    ├── 每日运行配额
    │   ├── 今日使用: X / Y
    │   ├── 剩余: Z
    │   ├── 限制输入框
    │   └── [💾 Save]
    │
    └── 系统信息
        ├── API Server: http://127.0.0.1:3210
        └── Profiles: 已配置数量
```

**数据源**: `useConfig()`, `usePrompts()`, `useSelectorHistory()`, `useQuota()`
**操作**: `api.saveConfig()`, `api.savePrompt()`, `api.debugSelectors()`

---

## 5. 数据流架构

### 实时状态同步 (SSE)

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│ React UI    │◀── SSE ─┤ Node.js Server   │◀── fs ──┤ Pipeline     │
│ (浏览器/    │ /api/   │ (port 3210)      │         │ (12-stage    │
│  Tauri)     │ events  │                  │         │  orchestor)  │
│             │         │ 每 1000ms 广播:   │         │              │
│ useRuns()   │         │ • runs[]         │         │ run.json     │
│ hook 接收   │         │ • activeRunId    │         │ 每阶段更新    │
│ 自动更新    │         │ • activeRunPaused│         │              │
│             │         │ • previewUrl     │         │              │
└─────────────┘         └──────────────────┘         └──────────────┘
```

### REST API 交互流

```
React UI                    Node.js Server              文件系统
   │                            │                          │
   │── GET /api/config ────────▶│── loadConfig() ─────────▶│
   │◀── AppConfig ──────────────│◀─ auto-video.config.json─│
   │                            │                          │
   │── PUT /api/config ────────▶│── saveConfig() ─────────▶│
   │                            │                          │
   │── POST /api/runs/start ───▶│── runPipeline() ────────▶│
   │◀── {ok, runId} ───────────│                          │
   │                            │── [异步执行 12 阶段] ────▶│
   │◀── SSE: runs event ───────│◀─ manifest 更新 ─────────│
   │                            │                          │
   │── POST /api/runs/pause ───▶│── control.pause() ──────▶│
   │── POST /api/runs/resume ──▶│── control.resume() ─────▶│
   │                            │                          │
│── GET /api/runs/:id ──────▶│── loadRunManifest() ────▶│
│◀── RunManifest ───────────│◀─ run.json ──────────────│
│                            │                          │
│── GET /api/runs/:id/details▶│── loadRunDetails() ────▶│
│◀── RunDetails ────────────│◀─ outputs/media/final ───│
│                            │                          │
│── GET /runs/.../latest.jpg▶│── serveFile() ──────────▶│
│◀── 截图二进制 ────────────│◀─ screenshots/ ──────────│
```

### Tauri 桌面集成

```
┌──────────────────────────────────────────────┐
│ Tauri 2 Desktop Shell                         │
│ ┌──────────────────────────────────────────┐ │
│ │ WebView (系统原生)                        │ │
│ │                                          │ │
│ │ React App (ui/dist/)                     │ │
│ │ ├── HashRouter (#/ 路由)                 │ │
│ │ ├── API → http://127.0.0.1:3210         │ │
│ │ └── SSE → http://127.0.0.1:3210/api/... │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ CSP: connect-src http://127.0.0.1:3210       │
│ Window: 1400×900 (min 1024×680)              │
│ Title: Auto Video Studio                     │
│ Identifier: com.auto-video.studio            │
│ Target: Windows + macOS + Linux              │
└──────────────────────────────────────────────┘
```

---

## 6. API 端点映射

### 按功能分组

```
┌─────────────────────────────────────────────────────────────┐
│ API Endpoints (src/web/server.ts)                           │
│                                                             │
│ 📡 实时事件                                                  │
│   GET  /api/events          → SSE 连接 (?runId=过滤)        │
│                                                             │
│ ⚙️ 配置管理                                                  │
│   GET  /api/config          → 加载配置                       │
│   PUT  /api/config          → 保存配置                       │
│                                                             │
│ 📊 配额管理                                                  │
│   GET  /api/quota           → 查询每日配额                    │
│                                                             │
│ 📝 提示词管理                                                 │
│   GET  /api/prompts         → 加载全部提示词                  │
│   PUT  /api/prompts/:name   → 保存单个提示词                  │
│                                                             │
│ 🚀 运行管理                                                  │
│   GET  /api/runs            → 列出全部运行                    │
│   GET  /api/runs/:id        → 查看运行详情                    │
│   GET  /api/runs/:id/details → 查看运行产物详情                │
│   POST /api/runs/start      → 创建新运行                     │
│   POST /api/runs/pause      → 暂停运行                       │
│   POST /api/runs/resume     → 恢复运行                       │
│   POST /api/runs/continue-human → 继续人工交接运行            │
│   POST /api/runs/retry      → 从阶段重试                     │
│   PUT  /api/runs/:id/handoff → 保存交接数据                   │
│                                                             │
│ 🔍 选择器调试                                                 │
│   POST /api/selectors/debug    → 运行选择器调试               │
│   GET  /api/selectors/history  → 查看调试快照历史              │
│   POST /api/selectors/compare  → 对比两个快照                 │
│                                                             │
│ 📁 静态文件                                                   │
│   GET  /runs/*              → 运行产物文件                    │
│   GET  /*                   → UI 静态文件 (SPA 回退)         │
└─────────────────────────────────────────────────────────────┘
```

### UI 页面 → API 映射

| 页面 | 读取 (GET) | 写入 (POST/PUT) |
|------|-----------|-----------------|
| Home | `/api/events` (SSE), `/api/config` | — |
| NewRun | `/api/config`, `/api/quota` | `/api/runs/start` |
| Studio | `/api/events` (SSE), `/api/runs/:id`, `/api/runs/:id/details`, `/api/config` | `/api/runs/pause`, `/api/runs/resume`, `/api/runs/retry`, `/api/runs/continue-human`, `/api/runs/:id/handoff` |
| Library | `/api/events` (SSE), `/api/runs/:id/details` | — |
| Settings | `/api/config`, `/api/prompts`, `/api/selectors/history`, `/api/quota` | `/api/config`, `/api/prompts/:name`, `/api/selectors/debug` |

---

## 附录: 响应式设计

```
桌面 (≥ 1024px)                    平板/窄屏 (< 1024px)
┌──────────────────────┐           ┌────────────────────┐
│ TopBar               │           │ TopBar             │
├────┬─────────────────┤           ├──┬─────────────────┤
│    │                 │           │  │                 │
│ S  │                 │           │S │                 │
│ i  │   Main          │           │i │   Main          │
│ d  │   Content       │           │d │   Content       │
│ e  │                 │           │e │                 │
│ b  │                 │           │  │                 │
│ a  │                 │           │  │                 │
│ r  │                 │           │  │                 │
│    │                 │           │  │                 │
│200 │                 │           │56│                 │
│ px │                 │           │px│                 │
├────┴─────────────────┤           ├──┴─────────────────┤
│ 导航: 图标 + 文字     │           │ 导航: 仅图标        │
└──────────────────────┘           └────────────────────┘
```

---

*本文档更新于 2026-03-30，反映 auto-video-main 当前代码状态。*
