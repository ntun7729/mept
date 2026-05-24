import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateQuiz, publicQuiz } from "./src/question-service.js";
import { checkQuiz } from "./src/check-service.js";
import { listModels, speechMp3 } from "./src/ai-client.js";
import { MEPT_FORMAT } from "./src/mept-format.js";
import { logDebug, logError, logInfo, logWarn } from "./src/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const quizStore = new Map();

app.use(express.json({ limit: "1mb" }));
app.use((request, response, next) => {
  const startedAt = Date.now();
  response.on("finish", () => {
    logInfo("http.request", {
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_request, response) => {
  logDebug("health.check");
  response.json({ ok: true, app: "mept-english-trainer", logLevel: process.env.LOG_LEVEL || process.env.DEBUG_LOGS || "info" });
});

app.get("/api/format", (_request, response) => {
  logDebug("format.read");
  response.json(MEPT_FORMAT);
});

app.get("/api/models", async (_request, response) => {
  try {
    logInfo("models.request");
    const models = await listModels();
    logInfo("models.success", { count: models.length });
    response.json({ models, defaultModel: process.env.AI_MODEL || "" });
  } catch (error) {
    logError("models.error", { error: messageOf(error) });
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post(["/api/generate", "/api/questions"], async (request, response) => {
  try {
    logInfo("quiz.generate.request", {
      section: request.body?.section,
      count: request.body?.count,
      difficulty: request.body?.difficulty,
      includeAudio: Boolean(request.body?.includeAudio)
    });
    const quiz = await generateQuiz(request.body || {});
    quizStore.set(quiz.id, quiz);
    trimQuizStore();
    logInfo("quiz.generate.success", {
      quizId: quiz.id,
      section: quiz.section,
      questions: quiz.questions.length,
      storedQuizzes: quizStore.size
    });
    response.json({ quiz: publicQuiz(quiz), questions: publicQuiz(quiz).questions });
  } catch (error) {
    logError("quiz.generate.error", { error: messageOf(error) });
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/check", async (request, response) => {
  try {
    const quizId = String(request.body?.quizId || "").trim();
    const quiz = quizStore.get(quizId);
    logInfo("quiz.check.request", {
      quizId,
      found: Boolean(quiz),
      responseCount: countResponses(request.body?.responses || request.body?.answers)
    });
    if (!quiz) {
      logWarn("quiz.check.not_found", { quizId });
      response.status(404).json({ error: "Quiz expired or not found. Generate a new quiz." });
      return;
    }
    const result = await checkQuiz(quiz, request.body?.responses || request.body?.answers || {});
    logInfo("quiz.check.success", { quizId, score: result.score, maxScore: result.maxScore, percent: result.percent });
    response.json(result);
  } catch (error) {
    logError("quiz.check.error", { error: messageOf(error) });
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post("/api/audio", async (request, response) => {
  try {
    const quizId = String(request.body?.quizId || "");
    const quiz = quizStore.get(quizId);
    const questionId = String(request.body?.questionId || "");
    const question = quiz?.questions?.find((item) => item.id === questionId);
    logInfo("audio.request", { quizId, questionId, found: Boolean(question?.script) });
    if (!question?.script) {
      logWarn("audio.script_not_found", { quizId, questionId });
      response.status(404).json({ error: "Listening script not found for this question." });
      return;
    }
    const audioBase64 = await speechMp3({ text: question.script });
    logInfo("audio.success", { quizId, questionId, bytesBase64: audioBase64.length });
    response.json({ mimeType: "audio/mpeg", audioBase64 });
  } catch (error) {
    logError("audio.error", { error: messageOf(error) });
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
  logInfo("server.started", {
    url: `http://127.0.0.1:${port}`,
    logLevel: process.env.LOG_LEVEL || process.env.DEBUG_LOGS || "info",
    nodeEnv: process.env.NODE_ENV || "development"
  });
});

function trimQuizStore() {
  if (quizStore.size <= 100) return;
  const deleteCount = quizStore.size - 100;
  for (const key of [...quizStore.keys()].slice(0, deleteCount)) quizStore.delete(key);
  logWarn("quiz.store.trimmed", { deleteCount, remaining: quizStore.size });
}

function messageOf(error) {
  return error instanceof Error ? error.message : "Unknown error";
}

function countResponses(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}
