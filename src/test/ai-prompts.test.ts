import { describe, expect, it } from 'vitest';

import {
  CASE_METHODOLOGY_SYSTEM_PROMPT,
  EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserMessage,
} from '@/lib/ai/prompts';

describe('EXPLAIN_SYSTEM_PROMPT formatting rules', () => {
  it('instructs the model to use ## Markdown headings', () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toContain('##');
  });

  it('instructs the model to use GFM pipe tables', () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(/管道表格/);
  });

  it('prohibits LaTeX formula syntax', () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(/禁止使用 LaTeX/);
  });

  it('instructs formulas to use code blocks or inline code', () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(/代码块|行内代码/);
  });

  it('prohibits HTML tags', () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(/禁止输出任何 HTML 标签/);
  });

  it('instructs the model to emphasise the final answer with a blockquote', () => {
    expect(EXPLAIN_SYSTEM_PROMPT).toMatch(/引用块/);
  });
});

describe('CASE_METHODOLOGY_SYSTEM_PROMPT formatting rules', () => {
  it('instructs the model to use ## Markdown headings', () => {
    expect(CASE_METHODOLOGY_SYSTEM_PROMPT).toContain('##');
  });

  it('prohibits LaTeX formula syntax', () => {
    expect(CASE_METHODOLOGY_SYSTEM_PROMPT).toMatch(/禁止使用 LaTeX/);
  });

  it('prohibits HTML tags', () => {
    expect(CASE_METHODOLOGY_SYSTEM_PROMPT).toMatch(/禁止输出任何 HTML 标签/);
  });
});

const sampleQuestion = {
  content: '顺序存储结构中删除一个元素的平均移动次数是？',
  options: [
    { label: 'A', content: '1', isCorrect: false },
    { label: 'B', content: '(n-1)/2', isCorrect: true },
    { label: 'C', content: 'log n', isCorrect: false },
    { label: 'D', content: 'n', isCorrect: false },
  ],
};

describe('buildExplainUserMessage', () => {
  it('includes the question content', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'D', false);
    expect(msg).toContain(sampleQuestion.content);
  });

  it('includes all option labels and text', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'D', false);
    expect(msg).toContain('A. 1');
    expect(msg).toContain('B. (n-1)/2');
    expect(msg).toContain('C. log n');
    expect(msg).toContain('D. n');
  });

  it('marks the correct answer', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'D', false);
    expect(msg).toContain('正确答案：B');
  });

  it('includes the user answer label', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'D', false);
    expect(msg).toContain('D');
  });

  it('marks incorrect answer as 错', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'D', false);
    expect(msg).toContain('错');
  });

  it('marks correct answer as 对', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'B', true);
    expect(msg).toContain('对');
  });

  it('falls back to 未选择 when no answer provided', () => {
    const msg = buildExplainUserMessage(sampleQuestion, '', false);
    expect(msg).toContain('未选择');
  });

  it('wraps question data in <question_data> security tag', () => {
    const msg = buildExplainUserMessage(sampleQuestion, 'B', true);
    expect(msg).toContain('<question_data>');
    expect(msg).toContain('</question_data>');
  });
});
