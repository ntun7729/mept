import { checkQuiz } from "../../src/check-service.js";
import { generateQuiz, publicQuiz } from "../../src/question-service.js";
import { listModels, speechMp3 } from "../../src/ai-client.js";
import { MEPT_FORMAT } from "../../src/mept-format.js";
import { setRuntimeEnv } from "../../src/runtime-env.js";

const quizStore = new Map();

export async function onRequest(context) {
  setRuntimeEnv({ ...context.env, NODE_ENV: context.env.NODE_ENV || "production" });
  const url = new URL(context.request.url);
  const pathname = url.pathname.replace(/^\/api\/?/, "");

  try {
    if (context.request.method === "GET" && pathname === "health") {
      return json({ ok: true, app: "mept-english-trainer", runtime: "cloudflare-pages" });
    }

    if (context.request.method === "GET" && pathname === "format") {
      return json(MEPT_FORMAT);
    }

    if (context.request.method === "GET" && pathname === "models") {
      const models = await listModels();
      return json({ models, defaultModel: context.env.AI_MODEL || "" });
    }

    if (context.request.method === "POST" && (pathname === "generate" || pathname === "questions")) {
      const body = await readJson(context.request);
      const quiz = await generateQuiz(body);
      quizStore.set(quiz.id, quiz);
      trimQuizStore();
      const publicResult = publicQuiz(quiz);
      return json({ quiz: publicResult, questions: publicResult.questions });
    }

    if (context.request.method === "POST" && pathname === "check") {
      const body = await readJson(context.request);
      const quizId = String(body.quizId || "").trim();
      const quiz = quizStore.get(quizId);
      if (!quiz) return json({ error: "Quiz expired or not found. Generate a new quiz." }, 404);
      return json(await checkQuiz(quiz, body.responses || body.answers || {}));
    }

    if (context.request.method === "POST" && pathname === "audio") {
      const body = await readJson(context.request);
      const quiz = quizStore.get(String(body.quizId || ""));
      const question = quiz?.questions?.find((item) => item.id === String(body.questionId || ""));
      if (!question?.script) return json({ error: "Listening script not found for this question." }, 404);
      const audioBase64 = await speechMp3({ text: question.script });
      return json({ mimeType: "audio/mpeg", audioBase64 });
    }

    return json({ error: "API route not found" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function trimQuizStore() {
  if (quizStore.size <= 100) return;
  for (const key of [...quizStore.keys()].slice(0, quizStore.size - 100)) quizStore.delete(key);
}
