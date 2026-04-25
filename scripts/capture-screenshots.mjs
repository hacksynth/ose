import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.OSE_BASE_URL || "http://localhost:3000";
const OUT_DIR = "docs/assets/screenshots";
const VIEWPORT = { width: 1440, height: 900 };
const DEMO = {
  email: process.env.OSE_DEMO_EMAIL || "demo@ose.dev",
  password: process.env.OSE_DEMO_PASSWORD || "demo123456",
  name: process.env.OSE_DEMO_NAME || "演示用户",
};

const targets = [
  { path: "/", file: "landing.png", auth: false, fullPage: true },
  { path: "/dashboard", file: "dashboard.png", auth: true, fullPage: true },
  { path: "/practice", file: "practice.png", auth: true, fullPage: true },
  { path: "/analysis", file: "analysis.png", auth: true, fullPage: true },
  { path: "/plan", file: "plan.png", auth: true, fullPage: true },
  { path: "/knowledge", file: "knowledge.png", auth: true, fullPage: true },
  { path: "/exam", file: "exam.png", auth: true, fullPage: true },
];

async function ensureUser() {
  const res = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEMO),
  });
  if (res.ok || res.status === 409) return;
  throw new Error(`register failed: ${res.status} ${await res.text()}`);
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', DEMO.email);
  await page.fill('input[name="password"]', DEMO.password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

const HIDE_DEV_OVERLAY_CSS = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-next-mark],
  [data-nextjs-dev-tools-button] { display: none !important; }
`;

async function shot(page, target) {
  await page.goto(`${BASE_URL}${target.path}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY_CSS });
  await page.waitForTimeout(800);
  const out = join(OUT_DIR, target.file);
  await page.screenshot({ path: out, fullPage: target.fullPage });
  console.log(`saved ${out}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await ensureUser();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "zh-CN",
  });
  const page = await context.newPage();

  for (const t of targets.filter((x) => !x.auth)) {
    await shot(page, t);
  }

  await login(page);

  for (const t of targets.filter((x) => x.auth)) {
    try {
      await shot(page, t);
    } catch (err) {
      console.error(`failed ${t.path}: ${err.message}`);
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
