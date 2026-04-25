# OSE

```text
   ____   _____ ______
  / __ \ / ___// ____/
 / / / / \__ \/ __/
/ /_/ / ___/ / /___
\____/ /____/_____/
Open Software Exam
```

面向中国软考的软件设计师考试的开源 AI 备考平台。

[![GitHub Stars](https://img.shields.io/github/stars/hacksynth/ose?style=social)](https://github.com/hacksynth/ose/stargazers)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/Discord-join%20community-5865F2.svg)](https://discord.gg/ose)
[![CI](https://github.com/hacksynth/ose/actions/workflows/ci.yml/badge.svg)](https://github.com/hacksynth/ose/actions/workflows/ci.yml)

![OSE 中文首页截图](docs/assets/screenshots/landing.png)

## OSE 是什么？

OSE（Open Software Exam）是一个专为中国软考软件设计师考试打造的开源备考平台。它把题库练习、案例分析、模拟考试、错题本、学情分析和 AI 辅助整合到一个可自部署的学习工作台中。

OSE 面向正在备考的考生、需要透明题库和学习数据的老师，以及希望搭建私有化 AI 培训系统的团队。系统围绕真实备考流程设计：学习知识点、刷题、复盘错题、参加模拟考试，再根据数据调整学习计划。

OSE 的核心卖点是：**AI 驱动**、**开源共建**、**可自部署**。你可以接入 Claude、OpenAI、Gemini 或任意 OpenAI 兼容接口，也可以把数据保存在自己的数据库中。

## 功能特性

- 📚 **智能题库**：选择题 + 案例分析题，覆盖软件设计师全部考纲。
- 🤖 **AI 辅助**：支持 Claude、OpenAI、Gemini、自定义端点，提供 AI 讲解、批改、出题、诊断和学习计划。
- 📊 **学情分析**：知识点掌握度热力图、薄弱诊断、预测得分、通过概率评估。
- 📝 **模拟考试**：真实考试模拟，倒计时、答题卡、成绩报告。
- 🧭 **智能学习计划**：根据目标考试日期和当前基础生成个性化备考计划。
- 🖥️ **多平台**：Web + Desktop（Tauri）。
- 🔌 **多 AI 供应商**：Claude、OpenAI、Gemini、自定义 OpenAI 兼容接口。

## 技术栈

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-dev-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-production-4169E1?logo=postgresql&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-desktop-24C8DB?logo=tauri&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-components-111827)

## 快速开始

```bash
git clone https://github.com/hacksynth/ose.git
cd ose
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

打开 `http://localhost:3000`，注册第一个账号即可开始使用。

## 自部署指南

OSE 支持 Docker、VPS 和 Vercel 类平台部署。SQLite 适合本地和小规模部署，PostgreSQL 更适合生产环境和多人团队。

详细步骤见 [docs/self-hosting.md](docs/self-hosting.md)。

## 截图 / Demo

![OSE 中文首页](docs/assets/screenshots/landing.png)

后续会继续补充 Dashboard、练习流程、AI 助手和 Tauri 桌面版截图。

## 路线图

- [x] Phase 1: 选择题题库 + 练习 + 错题本
- [x] Phase 2: 案例分析题 + 模拟考试 + 知识点体系
- [x] Phase 3: AI 辅助（讲解/批改/出题/诊断/学习计划）
- [x] Tauri 桌面版
- [ ] 更多软考科目支持（信息系统项目管理师等）
- [ ] 真题 PDF 自动导入解析
- [ ] PostgreSQL 生产部署支持
- [ ] Docker Compose 一键部署
- [ ] 国际化（i18n）
- [ ] 移动端 PWA / React Native
- [ ] 社区讨论/评论功能
- [ ] 题库贡献平台

## 参与贡献

欢迎贡献代码、文档、题库数据、问题复现、翻译和产品建议。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，也可以从 [.github/GOOD_FIRST_ISSUES.md](.github/GOOD_FIRST_ISSUES.md) 中挑选适合新贡献者的任务。

## 许可证

OSE 使用 [AGPL-3.0](LICENSE) 许可证。如果你修改 OSE 并作为网络服务提供给用户，需要按同一许可证公开修改后的源码。

## Star History

> 星标历史图表占位。仓库公开增长后可接入 star-history.com 图表。

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- 使用 npx all-contributors add <username> code,doc,data 添加贡献者 -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
