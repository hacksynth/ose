# Getting Started

This guide walks you from a clean machine to a running OSE development server.

## Prerequisites

- Node.js 20+; Node.js 22 LTS is recommended.
- npm 10+.
- Git.
- Optional: Rust and the Tauri prerequisites if you want to build the desktop app.

## Clone the Repository

```bash
git clone https://github.com/hacksynth/ose.git
cd ose
```

## Install Dependencies

```bash
npm install
```

## Configure Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Important variables:

- `DATABASE_URL`: Prisma database connection. Use `file:./dev.db` for local SQLite.
- `NEXTAUTH_SECRET`: secret used by Auth.js/NextAuth. Generate with `openssl rand -base64 32`.
- `NEXTAUTH_URL`: public URL of the app, usually `http://localhost:3000` for development.
- `AI_PROVIDER`: optional fixed provider, one of `claude`, `openai`, `gemini`, or `custom`.
- `ANTHROPIC_API_KEY`: Claude API key.
- `OPENAI_API_KEY`: OpenAI API key.
- `GEMINI_API_KEY`: Google Gemini API key.
- `CUSTOM_BASE_URL`: OpenAI-compatible endpoint such as Ollama, DeepSeek, Qwen, vLLM, LM Studio, or Azure OpenAI.
- `CUSTOM_API_KEY`: API key for the custom endpoint. Some local providers accept any non-empty value.
- `CUSTOM_MODEL`: model name exposed by the custom endpoint.

AI configuration is optional. The core practice and exam features run without an AI key.

## Initialize the Database

```bash
npx prisma migrate dev
```

This creates the SQLite database and applies all migrations.

## Import Seed Data

```bash
npx prisma db seed
```

Seed data includes knowledge points, sample questions, and initial content needed for local exploration.

## Start the Development Server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Create Your First Account

1. Open the register page.
2. Enter name, email, and password.
3. Log in and go to the dashboard.
4. Visit the profile page to add personal AI provider settings if you do not want to use environment variables.

## Try the Core Workflow

1. Open **Knowledge** and review the topic hierarchy.
2. Start a practice session from **Practice**.
3. Submit answers and read explanations.
4. Check **Wrong Notes** after incorrect answers.
5. Generate or start a **Mock Exam**.
6. Visit **Analysis** to review weak areas and pass probability.
7. Configure AI and try explanation, grading, diagnosis, and plan generation.

## Common Local Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run db:studio
```
