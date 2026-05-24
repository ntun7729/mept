import { chatJson, hasAiKey } from "./ai-client.js";
import { logDebug, logError, logInfo, logWarn } from "./logger.js";

export async function checkQuiz(quiz, responses) {
  const answerMap = Array.isArray(responses)
    ? Object.fromEntries(responses.map((item) => [item.questionId, item.answer]))
    : (responses || {});

  const objective = [];
  const open = [];
  for (const question of quiz.questions) {
    const userAnswer = normalize(answerMap[question.id]);
    if (isObjective(question.type)) objective.push(checkObjective(question, userAnswer));
    else open.push({ question, userAnswer });
  }
  logInfo("check.split", { quizId: quiz.id, objective: objective.length, openEnded: open.length });

  const openResults = open.length ? await checkOpenAnswers(open) : [];
  const results = [...objective, ...openResults].sort((a, b) => indexOf(quiz, a.questionId) - indexOf(quiz, b.questionId));
  const score = results.reduce((sum, item) => sum + item.score, 0);
  const maxScore = results.reduce((sum, item) => sum + item.maxScore, 0);
  const percent = maxScore ? Math.round((score / maxScore) * 100) : 0;
  logInfo("check.complete", { quizId: quiz.id, score, maxScore, percent });
  return { quizId: quiz.id, score, maxScore, percent, results };
}

function checkObjective(question, userAnswer) {
  const correctAnswer = normalize(question.correctAnswer);
  const correct = question.type === "ordering"
    ? orderValue(userAnswer) === orderValue(correctAnswer)
    : userAnswer.toLowerCase() === correctAnswer.toLowerCase();
  logDebug("check.objective", { questionId: question.id, type: question.type, answered: Boolean(userAnswer), correct });
  return {
    questionId: question.id,
    type: question.type,
    score: correct ? 1 : 0,
    maxScore: 1,
    correct,
    correctAnswer: question.correctAnswer,
    feedback: correct ? "Correct." : (question.answerExplanation || "Review this answer.")
  };
}

async function checkOpenAnswers(items) {
  if (!hasAiKey()) {
    logWarn("check.open.no_ai_key", { action: "using_local_heuristic", items: items.length });
    return items.map(localOpenCheck);
  }

  const payload = {
    task: "Grade MEPT writing and speaking answers. Return JSON only.",
    shape: { results: [{ questionId: "q1", score: 0, maxScore: 5, feedback: "text", improvedAnswer: "text" }] },
    answers: items.map(({ question, userAnswer }) => ({
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      rubric: question.rubric,
      wordLimit: question.wordLimit,
      sampleAnswer: question.sampleAnswer,
      userAnswer
    }))
  };

  try {
    logInfo("check.open.request", { items: items.length });
    const data = await chatJson({
      messages: [
        { role: "system", content: "You are an English examiner. Return compact JSON." },
        { role: "user", content: JSON.stringify(payload) }
      ],
      temperature: 0.2,
      maxTokens: 2500
    });
    const rows = Array.isArray(data?.results) ? data.results : [];
    logInfo("check.open.response", { requested: items.length, returned: rows.length });
    return items.map(({ question, userAnswer }) => {
      const row = rows.find((item) => item.questionId === question.id) || {};
      const score = clamp(row.score, 0, 5);
      return {
        questionId: question.id,
        type: question.type,
        score,
        maxScore: 5,
        correct: score >= 4,
        userAnswer,
        feedback: typeof row.feedback === "string" && row.feedback.trim() ? row.feedback.trim() : "Answer checked.",
        improvedAnswer: typeof row.improvedAnswer === "string" ? row.improvedAnswer.trim() : ""
      };
    });
  } catch (error) {
    logError("check.open.ai_failed", { error: messageOf(error), action: "using_local_heuristic" });
    return items.map(localOpenCheck);
  }
}

function localOpenCheck({ question, userAnswer }) {
  const words = userAnswer.split(/\s+/).filter(Boolean);
  const minWords = question.type === "writing" ? 25 : 8;
  const score = !userAnswer ? 0 : words.length >= minWords ? 3 : 2;
  return {
    questionId: question.id,
    type: question.type,
    score,
    maxScore: 5,
    correct: score >= 4,
    userAnswer,
    feedback: !userAnswer
      ? "No answer was provided."
      : `Local check: your answer has ${words.length} word(s). Add clear details, correct grammar, and maritime vocabulary for a higher score.`,
    improvedAnswer: question.sampleAnswer || ""
  };
}

function isObjective(type) {
  return ["multiple_choice", "true_false", "true_false_doesnt_say", "ordering", "listening_multiple_choice"].includes(type);
}
function normalize(value) {
  return Array.isArray(value) ? value.map((x) => String(x).trim()).filter(Boolean).join(",") : String(value ?? "").trim();
}
function orderValue(value) {
  return String(value || "").split(/[>,|\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean).join(",");
}
function clamp(value, min, max) {
  const number = Number(value);
  return Number.isNaN(number) ? min : Math.max(min, Math.min(max, number));
}
function indexOf(quiz, questionId) {
  return quiz.questions.findIndex((question) => question.id === questionId);
}
function messageOf(error) {
  return error instanceof Error ? error.message : "Unknown error";
}
