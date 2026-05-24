import crypto from "node:crypto";
import { chatJson } from "./ai-client.js";
import { MEPT_FORMAT, getSection, validSections } from "./mept-format.js";

const QUESTION_TYPES = ["multiple_choice", "true_false", "true_false_doesnt_say", "writing", "speaking", "ordering", "listening_multiple_choice"];

export async function generateQuiz(input) {
  const section = normalizeSection(input.section);
  const count = clampInt(input.count, 1, 20, 8);
  const difficulty = normalizeDifficulty(input.difficulty);
  const topic = cleanText(input.topic, 120) || "mixed maritime workplace English";
  const includeAudio = Boolean(input.includeAudio || section === "listening");

  const system = [
    "You generate MEPT-style English practice tests for new seafarers.",
    "Return strict JSON only. Do not include Markdown.",
    "Questions must be original, not copied from sample guidance.",
    "Use simple, natural English suitable for maritime trainees.",
    "For objective questions, include exactly one correct answer.",
    "For listening questions, include a short script that can be converted into audio.",
    "Never put the correct answer inside the visible prompt text."
  ].join("\n");

  const user = {
    task: "Generate a MEPT practice quiz",
    requested: { section, count, difficulty, topic, includeAudio },
    meptFormat: section === "mixed" ? MEPT_FORMAT : getSection(section),
    allowedQuestionTypes: QUESTION_TYPES,
    requiredJsonShape: {
      title: "string",
      section: "grammar | reading | writing | listening | speaking | mixed",
      instructions: "string",
      questions: [{
        id: "q1",
        section: "grammar | reading | writing | listening | speaking",
        type: "multiple_choice | true_false | true_false_doesnt_say | writing | speaking | ordering | listening_multiple_choice",
        prompt: "student-facing prompt",
        passage: "optional reading passage",
        script: "optional listening script; required for listening questions",
        options: [{ id: "A", text: "option text" }],
        correctAnswer: "objective answer only",
        answerExplanation: "short explanation",
        rubric: ["open-ended grading rule"],
        wordLimit: "optional word limit",
        sampleAnswer: "optional sample answer"
      }]
    }
  };

  const quiz = await chatJson({
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }],
    temperature: 0.85,
    maxTokens: 6000
  });

  return normalizeQuiz(quiz, { section, count });
}

export function publicQuiz(fullQuiz) {
  return {
    id: fullQuiz.id,
    title: fullQuiz.title,
    section: fullQuiz.section,
    instructions: fullQuiz.instructions,
    questions: fullQuiz.questions.map((question) => {
      const { correctAnswer, answerExplanation, sampleAnswer, ...safeQuestion } = question;
      return safeQuestion;
    })
  };
}

function normalizeQuiz(quiz, context) {
  if (!quiz || typeof quiz !== "object") throw new Error("Generated quiz was not an object");
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (!questions.length) throw new Error("Generated quiz had no questions");
  return {
    id: crypto.randomUUID(),
    title: cleanText(quiz.title, 120) || "MEPT Practice Quiz",
    section: normalizeSection(quiz.section || context.section),
    instructions: cleanText(quiz.instructions, 600) || "Answer all questions, then submit for checking.",
    createdAt: new Date().toISOString(),
    questions: questions.slice(0, context.count).map(normalizeQuestion)
  };
}

function normalizeQuestion(question, index) {
  if (!question || typeof question !== "object") throw new Error(`Question ${index + 1} is invalid`);
  const id = cleanText(question.id, 40) || `q${index + 1}`;
  const type = QUESTION_TYPES.includes(question.type) ? question.type : "multiple_choice";
  const prompt = cleanText(question.prompt, 1200);
  if (!prompt) throw new Error(`Question ${index + 1} is missing a prompt`);
  const options = Array.isArray(question.options) ? question.options.map(normalizeOption).filter(Boolean) : [];
  if (requiresOptions(type) && options.length < 2) throw new Error(`Question ${index + 1} needs at least two options`);
  return {
    id,
    section: validSections().includes(question.section) ? question.section : "grammar",
    type,
    prompt,
    passage: cleanText(question.passage, 4000),
    script: cleanText(question.script, 4000),
    options,
    correctAnswer: cleanText(question.correctAnswer, 300),
    answerExplanation: cleanText(question.answerExplanation, 1000),
    rubric: Array.isArray(question.rubric) ? question.rubric.map((x) => cleanText(x, 160)).filter(Boolean) : [],
    wordLimit: cleanText(question.wordLimit, 60),
    sampleAnswer: cleanText(question.sampleAnswer, 1200)
  };
}

function normalizeOption(option, index) {
  if (!option || typeof option !== "object") return null;
  const id = cleanText(option.id, 10) || String.fromCharCode(65 + index);
  const text = cleanText(option.text, 500);
  return text ? { id, text } : null;
}
function requiresOptions(type) { return ["multiple_choice", "true_false", "true_false_doesnt_say", "ordering", "listening_multiple_choice"].includes(type); }
function normalizeSection(value) { const section = String(value || "mixed").toLowerCase().trim(); return [...validSections(), "mixed"].includes(section) ? section : "mixed"; }
function normalizeDifficulty(value) { const difficulty = String(value || "starter").toLowerCase().trim(); return ["starter", "normal", "hard"].includes(difficulty) ? difficulty : "starter"; }
function clampInt(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isNaN(number) ? fallback : Math.max(min, Math.min(max, number)); }
function cleanText(value, maxLength) { if (typeof value !== "string") return ""; return value.replace(/\s+/g, " ").trim().slice(0, maxLength); }
