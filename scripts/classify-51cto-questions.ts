/**
 * Classify 51CTO scraped questions into the OSE knowledge-point tree using
 * the AI provider configured in OSE (UserAISettings or env).
 *
 * Usage:
 *   tsx --env-file=.env scripts/classify-51cto-questions.ts                       # env-based provider
 *   tsx --env-file=.env scripts/classify-51cto-questions.ts --user-email <email>  # user UserAISettings
 *   tsx --env-file=.env scripts/classify-51cto-questions.ts --batch-size 25       # tweak batch size
 *   tsx --env-file=.env scripts/classify-51cto-questions.ts --limit 40            # smoke-test on 40 q
 *
 * Inputs:
 *   data/51cto-seed.json
 * Outputs (incremental, resumable):
 *   data/51cto-classifications.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getAIProvider, resolveAIConfig } from '@/lib/ai/index';
import { parseAIJson } from '@/lib/ai/json';
import { prisma } from '@/lib/prisma';
import { KNOWLEDGE_TREE, leafKnowledgePoints } from '@/prisma/knowledge-tree';
import { htmlToText } from '@/lib/utils/html-to-text';

const SEED_PATH = path.resolve(process.cwd(), 'data/51cto-seed.json');
const CLASS_PATH = path.resolve(process.cwd(), 'data/51cto-classifications.json');

// ---------- CLI args ----------

function parseArgs() {
  const args: { userEmail?: string; batchSize: number; limit?: number } = { batchSize: 20 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--user-email') args.userEmail = argv[++i];
    else if (a === '--batch-size') args.batchSize = parseInt(argv[++i], 10);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

// ---------- Types ----------

type SeedSubQuestion = { content: string; referenceAnswer: string };
type SeedQuestion = {
  questionNumber: number;
  type: 'CHOICE' | 'CASE_ANALYSIS';
  content: string;
  options?: Array<{ label: string; content: string; isCorrect: boolean }>;
  caseScenario?: { background: string; subQuestions: SeedSubQuestion[] };
};
type SeedExam = {
  sourceId: number;
  title: string;
  session: 'AM' | 'PM';
  year: number;
  month: number;
  questions: SeedQuestion[];
};
type SeedPayload = { exams: SeedExam[] };

type ClassRecord = {
  knowledgePointId: string;
  knowledgePointName: string;
  confidence: 'high' | 'medium' | 'low';
};
type ClassificationFile = {
  meta: {
    provider: string;
    model: string;
    classifiedAt: string;
    knowledgeTreeHash: string;
  };
  classifications: Record<string, ClassRecord>;
};

type ClassifierItem = {
  key: string; // examSourceId:questionNumber
  type: 'CHOICE' | 'CASE_ANALYSIS';
  content: string;
  context?: string;
};

type RawClassification = {
  key: string;
  knowledgePointId: string;
  knowledgePointName?: string;
  confidence?: 'high' | 'medium' | 'low';
};

// ---------- Helpers ----------

function stripHtml(s: string): string {
  return htmlToText(s)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function questionToClassifierItem(exam: SeedExam, q: SeedQuestion): ClassifierItem {
  const key = `${exam.sourceId}:${q.questionNumber}`;
  const content = stripHtml(q.content);
  if (q.type === 'CHOICE') {
    const options = (q.options ?? []).map((o) => `${o.label}. ${stripHtml(o.content)}`).join('\n');
    return {
      key,
      type: 'CHOICE',
      content: truncate(content, 500),
      context: truncate(options, 600),
    };
  }
  const bg = stripHtml(q.caseScenario?.background ?? '');
  const firstSub = stripHtml(q.caseScenario?.subQuestions?.[0]?.content ?? '');
  return {
    key,
    type: 'CASE_ANALYSIS',
    content: truncate(content || firstSub, 200),
    context: truncate(bg, 1500),
  };
}

const leaves = leafKnowledgePoints();
const validIds = new Set(leaves.map((l) => l.id));
const leafIndex = new Map(leaves.map((l) => [l.id, l]));

function buildSystemPrompt(): string {
  const treeBlock = KNOWLEDGE_TREE.map((p) => {
    const children = p.children.map((c) => `  - [${c.id}] ${c.name}`).join('\n');
    return `## ${p.name}\n${children}`;
  }).join('\n\n');
  const validIdsLine = leaves.map((l) => l.id).join(', ');

  return `你是中国软考(软件设计师)考点分类专家。把每道题精确归类到下面知识点树的某个**叶子节点**(必须返回 \`kp-X-Y\` 形式的 ID)。

# 知识点树
${treeBlock}

# 分类规则
1. 只能返回叶子节点 ID,合法 ID 集合:${validIdsLine}
2. 必须按题目主考点归类,题中只是顺带提及的概念忽略。
3. 选择题看题干 + 选项,案例分析题看 background(背景)+ 题干。
4. 法律/版权/著作权题归 \`kp-9-1 知识产权基础\` 或 \`kp-9-2 软件保护\`。
5. ER 图、关系模式、范式、SQL 题分别归 \`kp-5-3 数据库设计\` / \`kp-5-1 关系数据库\` / \`kp-5-4 规范化理论\` / \`kp-5-2 SQL语言\`。
6. 数据流图(DFD)实体/数据流题归 \`kp-10-1 数据流图绘制\`,DFD 整体方法/系统分析归 \`kp-10-2 系统分析方法\`。
7. UML 用例/类图/序列图归 \`kp-8-2 UML\`,设计模式名/意图归 \`kp-8-3 设计模式\`,继承/多态/封装归 \`kp-8-1 面向对象基础\`。
8. 计算机组成里:寻址方式 = \`kp-1-3 指令系统\`;Cache/内存层次 = \`kp-1-4 存储系统\`;补码/浮点 = \`kp-1-1 数据表示\`;流水线/CMP = \`kp-1-2 计算机结构\`。
9. 算法复杂度/动态规划/贪心 → \`kp-3-7 算法设计策略\`。
10. 实在难判时,选最贴近的叶子,confidence 给 \`low\`。

# 输出格式
**严格返回**纯 JSON,不要任何前后缀或代码块:
{"classifications": [
  {"key": "examId:qn", "knowledgePointId": "kp-X-Y", "knowledgePointName": "...", "confidence": "high"},
  ...
]}
顺序必须与输入题目一致,每题必须有一条记录。`;
}

function buildUserPrompt(items: ClassifierItem[]): string {
  const lines = items.map((it, i) => {
    const header = `### Q${i + 1} key=${it.key} type=${it.type}`;
    const body =
      it.type === 'CHOICE'
        ? `题干: ${it.content}\n选项:\n${it.context}`
        : `背景:\n${it.context}\n题目: ${it.content || '(见背景)'}`;
    return `${header}\n${body}`;
  });
  return `请按规则给以下 ${items.length} 道题分类。返回 JSON,与输入顺序一致。\n\n${lines.join('\n\n---\n\n')}`;
}

// ---------- Main ----------

async function main() {
  const args = parseArgs();

  let userId: string | null = null;
  if (args.userEmail) {
    const user = await prisma.user.findUnique({ where: { email: args.userEmail } });
    if (!user) {
      console.error(`User not found: ${args.userEmail}`);
      process.exit(1);
    }
    userId = user.id;
  }
  const config = await resolveAIConfig(userId);
  if (!config) {
    console.error(
      'No AI provider configured. Set ANTHROPIC_API_KEY (or OPENAI/GEMINI/CUSTOM) in .env, or pass --user-email of a user with UserAISettings.'
    );
    process.exit(1);
  }
  const provider = await getAIProvider(userId);
  const info = provider.getInfo();
  console.log(`Using provider: ${info.name} (${info.model}) endpoint=${info.endpoint}`);

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as SeedPayload;
  const allItems: ClassifierItem[] = [];
  for (const exam of seed.exams) {
    for (const q of exam.questions) {
      allItems.push(questionToClassifierItem(exam, q));
    }
  }
  console.log(`Total questions: ${allItems.length}`);

  let store: ClassificationFile;
  if (fs.existsSync(CLASS_PATH)) {
    store = JSON.parse(fs.readFileSync(CLASS_PATH, 'utf-8')) as ClassificationFile;
    console.log(
      `Resuming with ${Object.keys(store.classifications).length} prior classifications.`
    );
  } else {
    store = {
      meta: {
        provider: info.name,
        model: info.model,
        classifiedAt: new Date().toISOString(),
        knowledgeTreeHash: leaves.map((l) => l.id).join(','),
      },
      classifications: {},
    };
  }

  let remaining = allItems.filter((it) => !store.classifications[it.key]);
  if (args.limit !== undefined) remaining = remaining.slice(0, args.limit);
  console.log(`Remaining: ${remaining.length} (batch size: ${args.batchSize})`);
  if (remaining.length === 0) {
    console.log('All classified. Nothing to do.');
    return;
  }

  const systemPrompt = buildSystemPrompt();

  for (let batchStart = 0; batchStart < remaining.length; batchStart += args.batchSize) {
    const batch = remaining.slice(batchStart, batchStart + args.batchSize);
    const userPrompt = buildUserPrompt(batch);
    const startMs = Date.now();
    let parsed: { classifications: RawClassification[] } | null = null;
    let attempt = 0;

    while (attempt < 3 && parsed === null) {
      attempt += 1;
      try {
        const text = await provider.createCompletion({
          systemPrompt,
          userMessage: userPrompt,
          maxTokens: 8000,
        });
        parsed = parseAIJson<{ classifications: RawClassification[] }>(text);
        if (!parsed?.classifications || !Array.isArray(parsed.classifications)) {
          throw new Error("Response missing 'classifications' array");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [batch ${batchStart}] attempt ${attempt} failed: ${msg}`);
        await new Promise((r) => setTimeout(r, 2_000 * attempt));
      }
    }

    if (parsed === null) {
      console.error(`  [batch ${batchStart}] gave up; skipping`);
      continue;
    }

    const seenKeys = new Set<string>();
    for (const c of parsed.classifications) {
      if (!c.key || !validIds.has(c.knowledgePointId)) {
        console.warn(`  [${c.key}] invalid kp ${c.knowledgePointId}; skipping`);
        continue;
      }
      const leaf = leafIndex.get(c.knowledgePointId)!;
      store.classifications[c.key] = {
        knowledgePointId: c.knowledgePointId,
        knowledgePointName: leaf.name,
        confidence: (c.confidence ?? 'medium') as ClassRecord['confidence'],
      };
      seenKeys.add(c.key);
    }
    const missing = batch.filter((b) => !seenKeys.has(b.key));
    if (missing.length > 0) {
      console.warn(
        `  [batch ${batchStart}] model dropped ${missing.length} items: ${missing
          .slice(0, 5)
          .map((m) => m.key)
          .join(', ')}…`
      );
    }
    fs.writeFileSync(CLASS_PATH, JSON.stringify(store, null, 2), 'utf-8');
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    const done = batchStart + batch.length;
    const total = Object.keys(store.classifications).length;
    console.log(`[${done}/${remaining.length}] ${elapsed}s  total_classified=${total}`);
  }

  // Histograms
  const buckets = { high: 0, medium: 0, low: 0 };
  const kpHist = new Map<string, number>();
  for (const c of Object.values(store.classifications)) {
    buckets[c.confidence] += 1;
    kpHist.set(c.knowledgePointId, (kpHist.get(c.knowledgePointId) ?? 0) + 1);
  }
  console.log(`\nDone. ${Object.keys(store.classifications).length} classifications.`);
  console.log(`Confidence: high=${buckets.high} medium=${buckets.medium} low=${buckets.low}`);
  console.log(`\nTop 15 knowledge points:`);
  [...kpHist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([id, n]) => {
      const leaf = leafIndex.get(id);
      console.log(`  ${id} ${leaf?.parent}/${leaf?.name}: ${n}`);
    });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
