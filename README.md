# OSE

```text
   ____   _____ ______
  / __ \ / ___// ____/
 / / / / \__ \/ __/
/ /_/ / ___/ / /___
\____/ /____/_____/
Open Software Exam
```

Open-source AI-powered exam preparation platform for China's Software Professional Qualification Exam

[![GitHub Stars](https://img.shields.io/github/stars/hacksynth/ose?style=social)](https://github.com/hacksynth/ose/stargazers)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/Discord-join%20community-5865F2.svg)](https://discord.gg/ose)
[![CI](https://github.com/hacksynth/ose/actions/workflows/ci.yml/badge.svg)](https://github.com/hacksynth/ose/actions/workflows/ci.yml)

[中文文档](README_CN.md)

![OSE landing page screenshot](docs/assets/screenshots/landing.png)

## What is OSE?

OSE (Open Software Exam) is an open-source exam preparation platform built for China's Software Professional Qualification Exam, starting with the Software Designer track. It combines structured question practice, case analysis, mock exams, learning analytics, and AI assistance into one self-hostable learning workspace.

OSE is designed for candidates who want a repeatable study system, teachers who need transparent question banks, and teams that want a private AI-enabled training platform. The project focuses on practical exam workflows: learn a knowledge point, practice questions, review mistakes, run a mock exam, and adjust the plan based on data.

The core promise is simple: **AI-Powered**, **Open Source**, and **Self-hostable**. You can use Claude, OpenAI, Gemini, or any OpenAI-compatible endpoint, keep your data in your own database, and contribute improvements back to the community.

## Features

- 📚 **Built-in question bank**: 41 历年真题 (2014–2025) — 1483 multiple-choice questions and 96 case scenarios with 263 sub-questions, AI-classified into a 56-node knowledge tree, baked into the seed so a fresh `db:seed` immediately produces a usable study workspace.
- 🤖 **AI assistance**: Claude, OpenAI, Gemini, and custom endpoints for explanations, grading, question generation, diagnosis, and study plans.
- 📊 **Learning analytics**: mastery heatmaps, weak-area diagnosis, predicted scores, and pass probability evaluation.
- 📝 **Mock exams**: realistic exam sessions with countdown timers, answer sheets, and result reports.
- 🧭 **Smart study plans**: AI-generated personalized preparation plans based on target date and current progress.
- 🖥️ **Multi-platform**: Web app plus Tauri desktop packaging.
- 🔌 **Multi-provider AI**: Claude, OpenAI, Gemini, and OpenAI-compatible custom APIs.

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-dev-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-production-4169E1?logo=postgresql&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-desktop-24C8DB?logo=tauri&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-components-111827)

## Quick Start

```bash
git clone https://github.com/hacksynth/ose.git
cd ose
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Open `http://localhost:3000`, create an account, and start practicing. The seed step loads 41 历年真题 / 1579 questions / 96 case scenarios from `data/51cto-seed.json` (built from `data/51cto-exams/`); see `data/51cto-exams/INDEX.md` for the source pipeline and licensing notes.

## Self-hosting Guide

OSE can run on Docker, a VPS, or Vercel-compatible hosting. SQLite works well for local and small deployments; PostgreSQL is recommended for production teams.

See [docs/self-hosting.md](docs/self-hosting.md) for Docker Compose, VPS systemd, PostgreSQL, HTTPS, and reverse proxy examples.

## Screenshots / Demo

| Dashboard                                           | Practice center                                   |
| --------------------------------------------------- | ------------------------------------------------- |
| ![Dashboard](docs/assets/screenshots/dashboard.png) | ![Practice](docs/assets/screenshots/practice.png) |

| Knowledge tree                                      | Mock exam                                 |
| --------------------------------------------------- | ----------------------------------------- |
| ![Knowledge](docs/assets/screenshots/knowledge.png) | ![Exam](docs/assets/screenshots/exam.png) |

| Study plan                                | Learning analysis                                 |
| ----------------------------------------- | ------------------------------------------------- |
| ![Plan](docs/assets/screenshots/plan.png) | ![Analysis](docs/assets/screenshots/analysis.png) |

Screenshots are captured by `scripts/capture-screenshots.mjs` against a local dev server. Re-run after UI changes:

```bash
npm run dev
node scripts/capture-screenshots.mjs
```

## Roadmap

- [x] Phase 1: 选择题题库 + 练习 + 错题本
- [x] Phase 2: 案例分析题 + 模拟考试 + 知识点体系
- [x] Phase 3: AI 辅助（讲解/批改/出题/诊断/学习计划）
- [x] Tauri 桌面版
- [ ] 更多软考科目支持（信息系统项目管理师等）
- [x] 历年真题内置(2014–2025,41 套,1579 题)
- [ ] PostgreSQL 生产部署支持
- [ ] Docker Compose 一键部署
- [ ] 国际化（i18n）
- [ ] 移动端 PWA / React Native
- [ ] 社区讨论/评论功能
- [ ] 题库贡献平台

## Contributing

We welcome code, documentation, question bank data, issue triage, translations, and product feedback. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the curated ideas in [.github/GOOD_FIRST_ISSUES.md](.github/GOOD_FIRST_ISSUES.md).

## License

OSE is licensed under the [AGPL-3.0](LICENSE). If you modify and provide OSE as a network service, your modified source code must also be made available under the same license.

## Star History

> Star history chart placeholder. Add a star-history.com chart after the repository gains public traction.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- Add contributors with: npx all-contributors add <username> code,doc,data -->
<!-- ALL-CONTRIBUTORS-LIST:END -->
