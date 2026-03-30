# 开发接手说明

## 1. 项目定位

`auto-video-main` 是一个面向科普/教育视频创作者的、本地优先的视频生成工作台。

它的目标和传统云端 SaaS 流水线不一样，核心思路是：

- 在本地通过浏览器自动化操作 AI 聊天网页
- 尽量利用聊天网页的免费额度，而不是每一步都走付费 API
- 不强依赖付费数据库、队列引擎等云基础设施
- 通过每日运行配额，主动限制每天生成的视频数量，控制成本
- 当网页要求登录、验证码或手动恢复时，允许人工接管
- 即使高质量动态视频链路还没全部自动化，也先保证能产出可发布的视频成片

因此，这个项目更像“个人创作者的本地操作台 + 编排引擎”，而不是“多租户的云端产品平台”。

## 2. 当前整体架构

当前代码分成两层运行时：

1. Node.js 编排 / 后端层
- 负责 12 阶段 pipeline
- 管理 Playwright 浏览器会话
- 把产物写入 `runs/<run-id>/`
- 提供本地 HTTP API 和 SSE 实时事件
- 在生产构建后直接服务 `ui/dist/`

2. React + Vite 前端层
- 提供操作界面
- 已经是 Tauri-ready 结构，但也可以先作为本地 SPA 使用
- 通过 `/api/*` 和 `/api/events` 与后端通信

这个项目是明确的 local-first 设计：

- 持久化使用文件系统，而不是数据库
- 浏览器登录态保存在本地 profile 目录
- prompts 使用本地 markdown 文件维护
- 生成的资产、日志、截图都保存在仓库下的 `runs/` 目录

## 3. 仓库结构

```text
auto-video-main/
  prompts/                      阶段提示词模板
  runs/                         运行产物、截图、调试输出
  src/
    browser/                    Playwright 会话与页面自动化
    config/                     运行配置 schema 与本地持久化
    extractors/                 原始响应解析工具
    media/                      关键帧生成、TTS、场景规划
    orchestrator/               Pipeline 执行、状态、重试/恢复逻辑
    render/                     FFmpeg 最终渲染
    utils/                      文件与时间工具
    validators/                 文本阶段 JSON 校验器
    web/                        本地 HTTP API + SSE + 静态 UI 服务
  ui/
    src/components/             Layout 外壳
    src/pages/                  Home / New Run / Studio / Library / Settings
    src/api/                    HTTP + SSE 客户端
    src/hooks/                  UI 数据 hooks
    src/types/                  前端运行时类型
    src-tauri/                  Tauri 外壳文件
```

## 4. 运行模型

### 后端

入口文件：

- `src/index.ts`：CLI 运行入口
- `src/web/server.ts`：本地 UI 服务入口

关键行为：

- `npm run run` 从命令行执行一次 pipeline
- `npm run ui` 在 `127.0.0.1:3210` 启动本地服务
- 服务同时提供 JSON API 和 `/api/events` SSE
- 当 `ui/dist/` 存在时，后端会直接服务构建后的前端页面

### 前端

React 应用位于 `ui/`。

- Vite 开发服务器会把 `/api` 和 `/runs` 代理到 `http://127.0.0.1:3210`
- 生产构建输出目录为 `ui/dist/`
- 路由使用 `HashRouter`，更适合本地/Tauri 场景

## 5. Pipeline 概览

当前编排器执行 12 个阶段：

1. `session_preparation`
2. `capability_assessment`
3. `style_dna`
4. `research`
5. `narrative_map`
6. `script`
7. `qa`
8. `storyboard`
9. `asset_generation`
10. `scene_video_generation`
11. `tts`
12. `render`

实现层面的关键点：

- 文本阶段使用 `prompts/` 下的 markdown 提示词
- 后续阶段会显式拼接前序阶段 JSON，保证上下文连续
- retry 会复用上游阶段产物
- run 可以 pause / resume / needs_human
- `scene_video_generation` 目前仍是简化规划步骤，不是完整的高保真视频生成引擎
- 当前“快速发布”路径是：关键帧图片 + 配音 + 字幕 + FFmpeg 合成

核心文件：

- `src/orchestrator/pipeline.ts`
- `src/orchestrator/runStore.ts`
- `src/orchestrator/runs.ts`
- `src/orchestrator/types.ts`

## 6. 浏览器 Profile 模型

这个项目非常依赖 browser profile。

一个 profile 定义：

- 目标 AI 聊天网页 URL
- prompt selector
- upload selector
- response selector
- send button selector
- ready selector
- 持久化浏览器数据目录
- 各种 timeout
- 是否允许人工登录

配置文件：

- 本地运行配置：`auto-video.config.json`
- 可共享模板：`auto-video.config.example.json`

阶段路由支持两种模式：

- `manual`：未指定的阶段回退到默认 profile
- `round-robin`：未指定的文本阶段会在多个 profile 之间轮换，以分摊免费额度消耗

## 7. 当前前端信息架构

一级页面：

1. `Home`
- 最近 runs
- 活跃 run 摘要
- 环境概况
- 快捷操作

2. `New Run`
- topic、provider、reference path
- launch profile
- mock mode
- per-stage routing overrides
- run preview 面板

3. `Studio`
- 左侧 run queue
- 中间 tabbed workspace
- 右侧 inspector
- 顶部 command bar 提供 pause / resume / retry / continue-human

Studio 子页签：

- `Overview`
- `Live Browser`
- `Outputs`
- `Timeline`
- `Handoff`

4. `Library`
- 可搜索的 run 历史
- assets 视图目前还是占位

5. `Settings`
- `Browser Profiles`
- `Stage Routing`
- `Prompts`
- `Selectors`
- `System`

## 8. 需要优先了解的 API

核心接口：

- `GET /api/config`
- `PUT /api/config`
- `GET /api/prompts`
- `PUT /api/prompts/:name`
- `GET /api/quota`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/details`
- `PUT /api/runs/:runId/handoff`
- `POST /api/runs/start`
- `POST /api/runs/pause`
- `POST /api/runs/resume`
- `POST /api/runs/continue-human`
- `POST /api/runs/retry`
- `POST /api/selectors/debug`
- `GET /api/selectors/history`
- `POST /api/selectors/compare`
- `GET /api/events`

这里有一个重要约定：

- `GET /api/runs/:runId` 返回当前 Studio 页面直接使用的 `RunManifest`
- `GET /api/runs/:runId/details` 返回更丰富的调试/产物详情（`manifest`、`textArtifacts`、`screenshots`、`mediaFiles`）

## 9. 本地开发流程

### 安装

```bash
npm install
cd ui && npm install && cd ..
npx playwright install chromium
```

### 后端 / pipeline 检查

```bash
npm run typecheck
npm test
npm run run -- --topic "how kidneys work" --provider "browser-chat-provider" --reference "/absolute/path/reference.mov"
```

### 启动本地操作台

```bash
npm run ui
```

然后打开：

```text
http://127.0.0.1:3210
```

### 单独迭代前端

另开一个终端：

```bash
cd ui
npm run dev
```

Vite 会把 API 请求代理回本地后端。

## 10. 常见改动路径

### 新增或重写 prompt

直接改 `prompts/` 下的文件。

如果 prompt 输出结构发生变化，还要一起检查：

- `src/extractors/parsers.ts`
- `src/validators/schemas.ts`
- `src/orchestrator/pipeline.ts` 中的下游消费逻辑

### 新增一个 stage

通常需要一起修改：

- `src/orchestrator/types.ts`
- `src/orchestrator/pipeline.ts`
- `ui/src/types/index.ts`
- `ui/src/pages/Studio.tsx`
- 对外文档（如果这个 stage 是用户可见的）

### 新增一个配置字段

通常需要同步修改：

- `src/config/types.ts`
- `src/config/store.ts`
- `ui/src/types/index.ts`
- `ui/src/pages/Settings.tsx`
- `auto-video.config.example.json`

### 新增一个 Studio 面板或产物查看器

优先看这些文件：

- `ui/src/pages/Studio.tsx`
- `ui/src/types/index.ts`
- `ui/src/api/client.ts`
- `src/web/server.ts`

## 11. 当前缺口与边界

下面这些地方目前仍然是 MVP 或刻意简化状态：

- `Library > Assets` 还只是占位，不是真正的资产浏览器
- `scene_video_generation` 还不是全自动场景视频生成器
- selector 稳定性仍然受外部网站改版影响
- Tauri 文件已经具备，但桌面打包链路还不是最充分验证的部分
- 按设计没有数据库、队列服务、用户系统和云部署层

这不是疏漏，而是产品定位的一部分：
它本来就是一个低成本、本地优先、面向单个创作者或极小团队的操作台。

## 12. 推荐的下一步开发优先级

如果后续开发者继续推进，这几项最值得优先做：

1. 把 rich run-details payload 真正接入 Studio 的 Outputs / detail 视图
2. 把 Library 的 assets 页做成真实的截图 / 媒体 / final 输出浏览器
3. 提升 scene-level 视觉生成质量，不再只依赖静态关键帧
4. 增强页面漂移、selector 失效时的恢复能力
5. 把 Tauri 桌面打包链路完整验证并写进文档

## 13. 新开发者建议阅读顺序

如果是第一次接手，建议按这个顺序读：

1. `README.md`
2. `TECH_STACK.md`
3. `FRONTEND_INFORMATION_ARCHITECTURE.md`
4. `src/orchestrator/pipeline.ts`
5. `src/web/server.ts`
6. `ui/src/pages/Studio.tsx`
7. `ui/src/pages/Settings.tsx`

这样会最快从“项目目标”走到“真实实现方式”。
