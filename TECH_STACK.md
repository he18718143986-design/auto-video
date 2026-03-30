# 技术栈分析 (Tech Stack Analysis)

本文档全面梳理 auto-video 项目的技术栈选型，分析每项选择的合理性，并与可能的替代方案做对比。

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈全景图](#2-技术栈全景图)
3. [后端 (Backend)](#3-后端-backend)
4. [浏览器自动化 (Browser Automation)](#4-浏览器自动化-browser-automation)
5. [媒体处理 (Media Pipeline)](#5-媒体处理-media-pipeline)
6. [前端 (Frontend)](#6-前端-frontend)
7. [桌面端 (Desktop)](#7-桌面端-desktop)
8. [测试 (Testing)](#8-测试-testing)
9. [整体适配性评估](#9-整体适配性评估)
10. [潜在改进方向](#10-潜在改进方向)

---

## 1. 项目概述

auto-video 是一个 **本地优先 (local-first)** 的、基于 **浏览器自动化** 的视频生成工作台。其核心理念是：

- 通过 Playwright 自动操控 AI 聊天网页（如 ChatGPT、Gemini）
- 利用多个浏览器配置文件在不同 AI 厂商/账号之间轮换 (round-robin)
- 最大化免费额度，将手动操作转变为自动化管线
- 12 阶段流水线从脚本研究到最终视频渲染
- 支持人工介入（登录验证码处理）和暂停/恢复

---

## 2. 技术栈全景图

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | ≥ 20.9 | 后端服务 + CLI + 管线执行 |
| **语言** | TypeScript | 5.8+ | 全栈类型安全 |
| **TS 执行** | tsx | 4.x | 无编译直接运行 .ts |
| **浏览器自动化** | Playwright | 1.53 | 操控 AI 聊天网页 |
| **视频渲染** | FFmpeg (fluent-ffmpeg) | 2.1 | 最终视频合成 |
| **TTS 语音** | OpenAI API / 系统 TTS / 音调回退 | - | 场景旁白 |
| **图像生成** | OpenAI API / Pollinations | - | 关键帧图像 |
| **Web 服务器** | Node.js http (原生) | - | API + 静态文件服务 |
| **前端 UI** | React 19 + Vite 8 + TypeScript | 19.x | 操作界面 (ui/) |
| **桌面端** | Tauri 2 (Rust) | 2.x | 可选桌面应用封装 |
| **测试** | Vitest | 4.1 | 69 个单元测试 |
| **Lint** | ESLint 9 | 9.x | UI 代码质量 |
| **配置** | JSON 文件 | - | 本地持久化配置 |

---

## 3. 后端 (Backend)

### 当前选择：Node.js + TypeScript + tsx

**选择理由：✅ 非常合适**

| 优点 | 说明 |
|------|------|
| **全栈统一** | 前后端共享 TypeScript，降低认知成本 |
| **Playwright 原生支持** | Playwright 的 Node.js 绑定是最成熟的 |
| **异步 I/O** | 浏览器自动化本质是高延迟异步操作，Node.js 事件循环天然适配 |
| **tsx 零编译** | 开发时无需编译步骤，直接 `node --import tsx` |
| **npm 生态** | 丰富的工具库（fluent-ffmpeg、http 等） |

### 原生 http 模块 vs 框架

项目使用了 `node:http` 原生模块而非 Express/Fastify。这是一个**合理的极简选择**：

- API 端点不多（约 20 个路由），不需要中间件堆栈
- 避免引入额外依赖
- 保持启动速度快
- 对于更复杂的路由场景，可考虑未来迁移到 [Hono](https://hono.dev) 或 Fastify

### 替代方案对比

| 替代方案 | 评估 |
|----------|------|
| **Python + Playwright** | 可行，但会失去前后端语言统一性 |
| **Go** | Playwright 支持弱，不适合此场景 |
| **Deno / Bun** | 可行但生态更小，Playwright 兼容性未经充分验证 |

**结论**：Node.js + TypeScript 是此项目的最佳后端选择。

---

## 4. 浏览器自动化 (Browser Automation)

### 当前选择：Playwright

**选择理由：✅ 最佳选择**

这是整个项目最核心的技术决策。项目需要：

1. 自动化操控 AI 聊天网页（ChatGPT、Gemini 等）
2. 保持浏览器会话状态（cookies、登录态）
3. 支持文件上传、选择器探测、截图
4. 允许手动介入（登录、验证码）

| 特性 | Playwright | Puppeteer | Selenium |
|------|-----------|-----------|----------|
| 持久化上下文（会话保持） | ✅ `launchPersistentContext` | ⚠️ 有限支持 | ⚠️ 复杂 |
| 多浏览器支持 | ✅ Chromium/Firefox/WebKit | ❌ 仅 Chromium | ✅ 多浏览器 |
| 选择器引擎 | ✅ CSS + 文本 + 角色 | ✅ CSS | ✅ CSS/XPath |
| 截图和文件上传 | ✅ 原生 | ✅ 原生 | ⚠️ 驱动特定 |
| 自动等待 | ✅ 内置 | ⚠️ 手动 | ⚠️ 手动 |
| TypeScript 支持 | ✅ 原生类型 | ✅ | ⚠️ 社区类型 |

**关键优势**：`launchPersistentContext` 使得在多个 AI 聊天窗口之间保持登录状态成为可能，这是多账号轮换策略的基石。

**结论**：Playwright 是此场景的唯一合理选择。

---

## 5. 媒体处理 (Media Pipeline)

### 视频渲染：FFmpeg (fluent-ffmpeg)

**选择理由：✅ 行业标准**

- FFmpeg 是视频处理的事实标准
- fluent-ffmpeg 提供了 Node.js 友好的 API
- 支持所有需要的操作：图片拼接、音频合并、字幕烧录
- 本地运行，无需云服务

### TTS 语音合成：多提供商瀑布回退

**选择理由：✅ 设计合理**

```
OpenAI TTS → 系统 TTS → 音调回退 (tone)
```

- 优先使用高质量的 OpenAI TTS
- 无 API Key 时回退到系统 TTS
- 最后兜底保证管线不中断

### 图像生成：多提供商回退

```
OpenAI Image → Pollinations (免费)
```

- OpenAI 图像质量最佳
- Pollinations 作为免费替代方案
- 符合项目"最大化免费额度"的核心理念

**结论**：媒体处理技术栈选择合理，瀑布回退策略与项目目标一致。

---

## 6. 前端 (Frontend)

### 统一 React UI

项目使用单一的 React 前端：

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| Vite | 8.x | 构建工具 + 开发服务器 |
| TypeScript | 5.9+ | 类型安全 |
| React Router | 7.x | 客户端路由 (HashRouter) |
| lucide-react | - | 图标库 |

**选择理由：✅ 合适**

- 复杂交互（路由、状态管理、组件复用）需要框架支持
- Tauri 桌面应用的前端基础
- 生产构建输出到 `ui/dist/`，由 Node.js HTTP 服务器直接服务
- 开发时通过 Vite 代理连接后端 API

### 替代方案

| 替代方案 | 评估 |
|----------|------|
| **Vue.js** | 同样合适，但 React + Tauri 生态更成熟 |
| **Svelte** | 编译产物更小，但社区资源较少 |
| **Vanilla HTML/CSS/JS** | 功能受限，无法支撑复杂交互和桌面应用场景 |

**结论**：React + Vite + TypeScript 是此项目前端的最佳选择。

---

## 7. 桌面端 (Desktop)

### 当前选择：Tauri 2 (Rust 内核)

**选择理由：✅ 最佳选择**

| 特性 | Tauri | Electron |
|------|-------|----------|
| 安装包大小 | ~3 MB | ~150+ MB |
| 内存占用 | 低 | 高（自带 Chromium） |
| 安全沙箱 | ✅ CSP + 权限模型 | ⚠️ 需额外配置 |
| 自动更新 | ✅ 内置 | ✅ 需插件 |
| 系统调用 | 通过 Rust | 通过 Node.js |

**关键点**：Tauri 不自带 Chromium —— 这对于本项目尤其重要，因为 Playwright 自己管理浏览器实例，避免了资源冲突。

**结论**：Tauri 是本项目桌面端封装的最佳选择。

---

## 8. 测试 (Testing)

### 当前选择：Vitest

**选择理由：✅ 最佳选择**

- 与 Vite 原生集成
- 对 TypeScript 支持开箱即用
- 比 Jest 快（原生 ESM，无需转换）
- API 兼容 Jest，迁移成本低
- 当前 69 个测试，覆盖核心模块

**测试文件组织**：与源码同级放置 (`*.test.ts`)，符合现代实践。

---

## 9. 整体适配性评估

### 核心需求 vs 技术栈匹配度

| 核心需求 | 技术支撑 | 匹配度 |
|---------|----------|--------|
| 操控 AI 聊天网页 | Playwright persistent context | ⭐⭐⭐⭐⭐ |
| 多厂商/账号轮换 | browser profiles + round-robin | ⭐⭐⭐⭐⭐ |
| 最大化免费额度 | 每日运行限制 + 多提供商回退 | ⭐⭐⭐⭐ |
| 视频渲染 | FFmpeg (fluent-ffmpeg) | ⭐⭐⭐⭐⭐ |
| 手动介入处理 | needs_human 状态 + 手办交接 | ⭐⭐⭐⭐ |
| 本地优先 | Node.js + JSON 配置 + 文件系统 | ⭐⭐⭐⭐⭐ |
| 跨平台桌面应用 | Tauri 2 | ⭐⭐⭐⭐⭐ |
| 开发者体验 | TypeScript + tsx + Vitest | ⭐⭐⭐⭐⭐ |

### 总体评价

> **当前技术栈是非常合适的** —— 每项选择都有充分理由，没有明显的"错误选型"。
> 尤其是 Playwright + Node.js 的组合，与项目"自动化操控 AI 网页聊天"的核心需求高度契合。

---

## 10. 潜在改进方向

以下是一些可考虑的改进，但并非必须：

### 短期

| 改进 | 说明 | 优先级 |
|------|------|--------|
| **SQLite 替代 JSON 文件** | 当运行历史增多时，JSON 文件读写性能可能成为瓶颈 | 低 |
| **Web 框架（Hono/Fastify）** | 如果 API 端点继续增长，可考虑引入轻量框架 | 低 |
| **E2E 测试** | 使用 Playwright Test 对 UI 进行端到端测试 | 中 |

### 中期

| 改进 | 说明 | 优先级 |
|------|------|--------|
| **任务队列** | 引入 BullMQ 等支持后台运行排队和重试 | 中 |
| **WebSocket** | 替换当前 SSE 实现，支持更丰富的实时通信 | 低 |

### 长期

| 改进 | 说明 | 优先级 |
|------|------|--------|
| **插件系统** | 允许社区贡献新的 AI 提供商适配器 | 低 |
| **Docker 支持** | 虽与 Playwright 有头浏览器冲突，但 headless 模式可行 | 低 |

---

## 总结

auto-video 的技术栈选型体现了 **实用主义** 和 **目标导向** 的设计哲学：

1. **Playwright** 是操控 AI 聊天网页的最佳工具
2. **Node.js + TypeScript** 提供全栈统一和丰富生态
3. **FFmpeg** 是视频处理的行业标准
4. **Tauri** 是轻量桌面封装的最佳选择
5. **多提供商回退策略** 完美匹配"最大化免费额度"的核心目标

**这套技术栈是当前需求的最优解。**
