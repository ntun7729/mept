import { chatJson } from "./ai-client.js";

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

  const openResults = open.length ? await checkOpenAnswers(open) : [];
  const results = [...objective, ...openResults].sort((a, b) => indexOf(quiz, a.questionId) - indexOf(quiz, b.questionId));
  const score = results.reduce((sum, item) => sum + item.score, 0);
  const maxScore = results.reduce((sum, item) => sum + item.maxScore, 0);
  return { quizId: quiz.id, score, maxScore, percent: maxScore ? Math.round((score / maxScore) * 100) : 0, results };
}

function checkObjective(question, userAnswer) {
  const correctAnswer = normalize(question.correctAnswer);
  const correct = question.type === "ordering"
    ? orderValue(userAnswer) === orderValue(correctAnswer)
    : userAnswer.toLowerCase() === correctAnswer.toLowerCase();
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
  const data = await chatJson({
    messages: [
      { role: "system", content: "You are an English examiner. Return compact JSON." },
      { role: "user", content: JSON.stringify(payload) }
    ],
    temperature: 0.2,
    maxTokens: 2500
  });
  const rows = Array.isArray(data?.results) ? data.results : [];
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
