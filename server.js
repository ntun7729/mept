import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function config() {
  return {
    apiKey: process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
    model: process.env.AI_MODEL || 'z-ai/glm-5.1'
  };
}

async function chatJson(messages, temperature = 0.7) {
  const c = config();
  if (!c.apiKey) throw new Error('Missing AI_API_KEY or NVIDIA_API_KEY');
  const url = c.baseUrl.endsWith('/v1') ? `${c.baseUrl}/chat/completions` : `${c.baseUrl}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ model: c.model, messages, temperature })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 500) || `Provider error ${response.status}`);
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || '';
}

function fallbackQuestion(section) {
  return {
    id: crypto.randomUUID(),
    section,
    type: 'multiple_choice',
    title: 'Choose the correct answer.',
    prompt: 'She _____ to school every day.',
    options: ['go', 'goes', 'going', 'gone'],
    correctAnswer: 'B',
    answerExplanation: 'Use goes with third-person singular present simple.',
    skill: 'Grammar: present simple'
  };
}

function safeQuestion(q) {
  const { correctAnswer, answerExplanation, sampleAnswer, ...safe } = q;
  return safe;
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/questions', async (req, res) => {
  try {
    const section = String(req.body.section || 'grammar');
    const count = Math.max(1, Math.min(10, Number(req.body.count || 5)));
    const level = String(req.body.level || 'intermediate');
    const prompt = `Create ${count} MEPT-style English practice questions for section ${section}, level ${level}. Return only JSON array. Each item: id, section, type, title, prompt, options, correctAnswer, answerExplanation, skill, audioScript if listening. Types allowed: multiple_choice, true_false, true_false_does_not_say, ordering, writing, speaking.`;
    let questions = [];
    try {
      const raw = await chatJson([{ role: 'system', content: 'You create valid JSON only.' }, { role: 'user', content: prompt }]);
      questions = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ''));
    } catch {
      questions = Array.from({ length: count }, () => fallbackQuestion(section));
    }
    globalThis.latestQuestions = questions;
    res.json({ questions: questions.map(safeQuestion) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to generate questions' });
  }
});

app.post('/api/check', async (req, res) => {
  try {
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const questions = globalThis.latestQuestions || [];
    const results = answers.map((a) => {
      const q = questions.find((item) => item.id === a.questionId);
      if (!q) return { questionId: a.questionId, score: 0, feedback: 'Question not found.' };
      const expected = String(q.correctAnswer || '').trim().toLowerCase();
      const got = String(a.answer || '').trim().toLowerCase();
      const correct = expected && got === expected;
      return { questionId: q.id, score: correct ? 1 : 0, correctAnswer: q.correctAnswer, feedback: correct ? 'Correct.' : q.answerExplanation || 'Review the item.' };
    });
    const total = results.reduce((sum, r) => sum + r.score, 0);
    res.json({ score: total, maxScore: results.length, results });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to check answers' });
  }
});

app.listen(PORT, () => console.log(`MEPT trainer running at http://127.0.0.1:${PORT}`));
