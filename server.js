import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateQuiz, publicQuiz } from "./src/question-service.js";
import { checkQuiz } from "./src/check-service.js";
import { listModels, speechMp3 } from "./src/ai-client.js";
import { MEPT_FORMAT } from "./src/mept-format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const quizStore = new Map();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, app: "mept-english-trainer" });
});

app.get("/api/format", (_request, response) => {
  response.json(MEPT_FORMAT);
});

app.get("/api/models", async (_request, response) => {
  try {
    const models = await listModels();
    response.json({ models, defaultModel: process.env.AI_MODEL || "" });
  } catch (error) {
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post(["/api/generate", "/api/questions"], async (request, response) => {
  try {
    const quiz = await generateQuiz(request.body || {});
    quizStore.set(quiz.id, quiz);
    trimQuizStore();
    response.json({ quiz: publicQuiz(quiz), questions: publicQuiz(quiz).questions });
  } catch (error) {
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/check", async (request, response) => {
  try {
    const quizId = String(request.body?.quizId || "").trim();
    const quiz = quizStore.get(quizId);
    if (!quiz) {
      response.status(404).json({ error: "Quiz expired or not found. Generate a new quiz." });
      return;
    }
    response.json(await checkQuiz(quiz, request.body?.responses || request.body?.answers || {}));
  } catch (error) {
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/audio", async (request, response) => {
  try {
    const quiz = quizStore.get(String(request.body?.quizId || ""));
    const questionId = String(request.body?.questionId || "");
    const question = quiz?.questions?.find((item) => item.id === questionId);
    if (!question?.script) {
      response.status(404).json({ error: "Listening script not found for this question." });
      return;
    }
    const audioBase64 = await speechMp3({ text: question.script });
    response.json({ mimeType: "audio/mpeg", audioBase64 });
  } catch (error) {
    response.status(400).json({
      error: messageOf(error),
      fallback: "Use the browser Read aloud button, or configure an OpenAI-compatible speech endpoint."
    });
  }
});

app.use((_request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`MEPT English Trainer running at http://127.0.0.1:${port}`);
});

function trimQuizStore() {
  if (quizStore.size <= 100) return;
  for (const key of [...quizStore.keys()].slice(0, quizStore.size - 100)) quizStore.delete(key);
}

function messageOf(error) {
  return error instanceof Error ? error.message : "Unknown error";
}
