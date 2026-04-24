# OSE - Open Software Exam`n`n[![CI](https://github.com/hacksynth/ose/actions/workflows/ci.yml/badge.svg)](https://github.com/hacksynth/ose/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OSE（Open Software Exam）是一个开源的软考（软件设计师）备考系统，提供题库练习、错题本、模拟考试、学情诊断、学习计划以及 AI 辅助讲解/出题能力。

## 功能亮点

- 知识点练习：支持随机、顺序和按知识点刷题。
- 错题本：自动沉淀错题，支持重练和标记掌握。
- 模拟考试：按上午/下午题型组织限时训练和成绩复盘。
- 学情诊断：根据答题数据分析薄弱知识点和学习趋势。
- 学习计划：结合目标考试日期生成每日任务。
- AI 能力：支持 AI 深度讲解、案例批改、智能出题和解题思路。

## 技术栈

- Next.js 15 App Router
- TypeScript
- Tailwind CSS + shadcn/ui 风格组件
- Prisma ORM + SQLite（开发环境）
- NextAuth.js v5 Credentials Provider
- OpenAI / Claude / Gemini / OpenAI-compatible 自定义 AI Provider

## 本地启动

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run dev
```

访问 `http://localhost:3000/register` 注册账号，登录后进入 `/dashboard`。

## Docker Compose 启动

```bash
cp .env.example .env
docker compose up -d --build
```

访问 `http://localhost:3000`。容器内默认使用 SQLite，数据库文件保存在 `ose-data` volume 中；启动时会自动执行 `prisma migrate deploy`。

推送到 `main` 分支或创建 `v*` tag 时，GitHub Actions 会构建 Docker 镜像并发布到 GitHub Container Registry：`ghcr.io/hacksynth/ose`。

常用命令：

```bash
npm run prisma:generate
npm run lint
npm run build
npm run prisma:studio
```

## 环境变量

开发环境默认使用 `.env`，可从 `.env.example` 复制：

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="change-me"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_EXAM_DATE="2026-05-23"
```

生产部署前请务必替换 `AUTH_SECRET`，并根据目标数据库调整 `DATABASE_URL`。

## AI 功能配置

OSE 支持四类 AI Provider。配置任意一种后，即可启用 AI 讲解、AI 批改、AI 出题、学情诊断和智能助手。

```env
AI_PROVIDER=claude

ANTHROPIC_API_KEY=your-key-here
ANTHROPIC_BASE_URL=
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

OPENAI_API_KEY=your-key-here
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini

GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash

CUSTOM_API_KEY=your-key-here
CUSTOM_BASE_URL=http://localhost:11434/v1
CUSTOM_MODEL=llama3
```

如果未设置 `AI_PROVIDER`，系统会按 Claude → OpenAI → Gemini → Custom 的优先级自动检测可用配置。`custom` 模式适用于 Ollama、LM Studio、vLLM、LocalAI、DeepSeek、通义千问等 OpenAI 兼容接口。

## 桌面版（Tauri）

OSE 桌面版使用 Tauri v2 + sidecar 模式运行。应用启动后，Rust 进程会在本机选择可用端口，启动 Next.js standalone 服务，并在原生 WebView 中加载 `http://localhost:{port}`。Web 端部署不受影响，普通 `npm run dev` / `npm run build` 仍保持 Next.js 默认行为。

前置要求：

- Node.js 20+（默认轻量模式要求目标机器已安装 Node.js，并加入 `PATH`）
- Rust 工具链（rustup）
- 各平台系统依赖，参考 Tauri v2 prerequisites

开发模式：

```bash
npm run dev          # 先启动 Next.js 开发服务器
npm run tauri:dev    # 再启动 Tauri 窗口，支持前端 HMR
```

构建安装包：

```bash
npm run tauri:build
```

构建流程会运行 `scripts/prepare-sidecar.js`：生成 Next.js standalone、复制 `.next/static` / `public` / Prisma migrations，并写入 `src-tauri/binaries/standalone/start.js`。产物输出到 `src-tauri/target/release/bundle/`。

Node.js 运行时策略：

- 默认模式：不打包 Node.js，应用运行时调用系统 `node`，包体更小。
- 完整打包：预留 `BUNDLE_NODE=1 npm run tauri:prepare` 开关，当前脚本会提示该模式尚需接入平台 Node.js 下载/复制流程。

桌面版数据位置：

- Windows: `%APPDATA%/com.ose.softwareexam/ose.db`
- macOS: `~/Library/Application Support/com.ose.softwareexam/ose.db`
- Linux: `~/.local/share/com.ose.softwareexam/ose.db`

数据库和配置保存在系统用户数据目录，卸载应用不会自动删除用户数据。首次启动会自动执行 `prisma migrate deploy` 创建或升级数据库表。

应用图标源文件位于 `src-tauri/icons/app-icon.png` 和 `src-tauri/icons/app-icon.svg`。替换后可运行：

```bash
npm run tauri:icons
```

## 开源协作

欢迎参与项目建设：

- 贡献指南：`CONTRIBUTING.md`
- 行为准则：`CODE_OF_CONDUCT.md`
- 安全政策：`SECURITY.md`
- 支持说明：`SUPPORT.md`
- 更新日志：`CHANGELOG.md`

提交 PR 前请至少运行：

```bash
npm run lint
npm run build
```

## 许可证

本项目基于 MIT License 开源，详见 `LICENSE`。

