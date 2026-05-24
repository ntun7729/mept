import crypto from "node:crypto";
import { chatJson, hasAiKey } from "./ai-client.js";
import { MEPT_FORMAT, getSection, validSections } from "./mept-format.js";
import { logDebug, logError, logInfo, logWarn } from "./logger.js";

const QUESTION_TYPES = ["multiple_choice", "true_false", "true_false_doesnt_say", "writing", "speaking", "ordering", "listening_multiple_choice"];

export async function generateQuiz(input) {
  const section = normalizeSection(input.section);
  const count = clampInt(input.count, 1, 20, 8);
  const difficulty = normalizeDifficulty(input.difficulty);
  const topic = cleanText(input.topic, 120) || "mixed maritime workplace English";
  const includeAudio = Boolean(input.includeAudio || section === "listening");
  const context = { section, count, difficulty, topic, includeAudio };
  logInfo("question.generate.start", context);

  if (!hasAiKey()) {
    logWarn("question.generate.no_ai_key", { action: "using_local_fallback" });
    return fallbackQuiz(context, "No AI key configured. Generated local practice questions.");
  }

  try {
    const quiz = await requestAiQuiz(context);
    const normalized = normalizeQuiz(quiz, context);
    logInfo("question.generate.normalized", {
      quizId: normalized.id,
      title: normalized.title,
      section: normalized.section,
      questions: normalized.questions.length,
      types: normalized.questions.map((question) => question.type)
    });
    return normalized;
  } catch (error) {
    logError("question.generate.ai_failed", { error: messageOf(error), action: "using_local_fallback" });
    return fallbackQuiz(context, `AI generation failed: ${messageOf(error)}. Generated local practice questions.`);
  }
}

async function requestAiQuiz(context) {
  const { section, count, difficulty, topic, includeAudio } = context;
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

  logDebug("question.generate.prompt_ready", { systemChars: system.length, userChars: JSON.stringify(user).length });
  return chatJson({
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }],
    temperature: 0.85,
    maxTokens: 6000
  });
}

export function publicQuiz(fullQuiz) {
  logDebug("question.public_quiz", { quizId: fullQuiz.id, questions: fullQuiz.questions.length, answersHidden: true });
  return {
    id: fullQuiz.id,
    title: fullQuiz.title,
    section: fullQuiz.section,
    instructions: fullQuiz.instructions,
    generatedBy: fullQuiz.generatedBy,
    warning: fullQuiz.warning,
    questions: fullQuiz.questions.map((question) => {
      const { correctAnswer, answerExplanation, sampleAnswer, ...safeQuestion } = question;
      return safeQuestion;
    })
  };
}

function normalizeQuiz(quiz, context) {
  if (Array.isArray(quiz)) quiz = { questions: quiz };
  if (!quiz || typeof quiz !== "object") throw new Error("Generated quiz was not an object");
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (!questions.length) throw new Error("Generated quiz had no questions");
  return {
    id: crypto.randomUUID(),
    title: cleanText(quiz.title, 120) || "MEPT Practice Quiz",
    section: normalizeSection(quiz.section || context.section),
    instructions: cleanText(quiz.instructions, 600) || "Answer all questions, then submit for checking.",
    generatedBy: "ai",
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
    section: validSections().includes(question.section) ? question.section : inferSection(type),
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

function fallbackQuiz(context, warning) {
  const pool = fallbackPool(context.topic, context.includeAudio);
  const selected = selectFallback(pool, context.section, context.count).map((question, index) => ({ ...question, id: `q${index + 1}` }));
  const quiz = {
    id: crypto.randomUUID(),
    title: `${labelSection(context.section)} Practice Quiz`,
    section: context.section,
    instructions: "Answer all questions. Some questions are locally generated fallback items.",
    generatedBy: "local-fallback",
    warning,
    createdAt: new Date().toISOString(),
    questions: selected
  };
  logInfo("question.generate.fallback_ready", { quizId: quiz.id, questions: quiz.questions.length, warning });
  return quiz;
}

function fallbackPool(topic, includeAudio) {
  const deckTopic = topic || "safety drill";
  const questions = [
    { section: "grammar", type: "multiple_choice", prompt: "Choose the correct sentence.", options: [{ id: "A", text: "He go to the engine room." }, { id: "B", text: "He goes to the engine room." }, { id: "C", text: "He going to the engine room." }], correctAnswer: "B", answerExplanation: "Use 'goes' for he/she/it in the present simple." },
    { section: "grammar", type: "multiple_choice", prompt: "The crew _____ wearing lifejackets during the drill.", options: [{ id: "A", text: "is" }, { id: "B", text: "are" }, { id: "C", text: "am" }], correctAnswer: "B", answerExplanation: "Crew as a group of people commonly takes 'are' here." },
    { section: "reading", type: "true_false_doesnt_say", passage: "Notice: All trainees must wear safety shoes on deck. Helmets are required during mooring practice. Report damaged PPE to the officer on duty.", prompt: "Trainees must tell the officer if PPE is damaged.", options: [{ id: "A", text: "True" }, { id: "B", text: "False" }, { id: "C", text: "Doesn't say" }], correctAnswer: "A", answerExplanation: "The notice says to report damaged PPE to the officer on duty." },
    { section: "reading", type: "multiple_choice", passage: "Before entering the engine room, trainees must ask permission, wear ear protection, and stay with the duty engineer.", prompt: "What must trainees do before entering the engine room?", options: [{ id: "A", text: "Enter alone" }, { id: "B", text: "Ask permission" }, { id: "C", text: "Remove ear protection" }], correctAnswer: "B", answerExplanation: "The passage says trainees must ask permission first." },
    { section: "writing", type: "writing", prompt: `Write 40 to 60 words to your supervisor about a problem with ${deckTopic}. Explain the problem and ask for advice.`, rubric: ["Clear problem", "Polite request", "Basic grammar", "Relevant vocabulary"], wordLimit: "40 to 60 words", sampleAnswer: "Sir, I found a problem during the safety drill. One lifejacket strap was damaged and could not close properly. Please advise me what to do. I can mark it and keep it separate until it is checked." },
    { section: "speaking", type: "speaking", prompt: "Introduce yourself to a senior officer. Say your name, your role, and one safety rule you always follow.", rubric: ["Introduction", "Relevant safety rule", "Clear and polite English"], sampleAnswer: "Good morning, Sir. My name is Min. I am a new trainee. I always wear my PPE correctly before starting deck work." },
    { section: "listening", type: "listening_multiple_choice", script: "Attention crew. The safety drill will start at nine thirty. Bring your lifejacket and helmet. Meet beside lifeboat number two.", prompt: "Where should the crew meet?", options: [{ id: "A", text: "In the engine room" }, { id: "B", text: "Beside lifeboat number two" }, { id: "C", text: "On the bridge" }], correctAnswer: "B", answerExplanation: "The announcement says to meet beside lifeboat number two." },
    { section: "listening", type: "ordering", script: "First, check your helmet. Next, put on your lifejacket. Then go to the muster station. Finally, wait for your team leader.", prompt: "Put the actions in the correct order: A wait for team leader, B check helmet, C go to muster station, D put on lifejacket.", options: [{ id: "A", text: "Wait for team leader" }, { id: "B", text: "Check helmet" }, { id: "C", text: "Go to muster station" }, { id: "D", text: "Put on lifejacket" }], correctAnswer: "B,D,C,A", answerExplanation: "The order is first check helmet, next put on lifejacket, then go to the muster station, finally wait." }
  ];
  return includeAudio ? questions : questions.map((question) => question.section === "listening" ? { ...question, script: "" } : question);
}

function selectFallback(pool, section, count) {
  const filtered = section === "mixed" ? pool : pool.filter((question) => question.section === section);
  const source = filtered.length ? filtered : pool;
  return Array.from({ length: count }, (_, index) => structuredClone(source[index % source.length]));
}

function normalizeOption(option, index) { if (!option || typeof option !== "object") return null; const id = cleanText(option.id, 10) || String.fromCharCode(65 + index); const text = cleanText(option.text, 500); return text ? { id, text } : null; }
function inferSection(type) { if (type === "writing") return "writing"; if (type === "speaking") return "speaking"; if (type === "listening_multiple_choice") return "listening"; return "grammar"; }
function requiresOptions(type) { return ["multiple_choice", "true_false", "true_false_doesnt_say", "ordering", "listening_multiple_choice"].includes(type); }
function normalizeSection(value) { const section = String(value || "mixed").toLowerCase().trim(); return [...validSections(), "mixed"].includes(section) ? section : "mixed"; }
function normalizeDifficulty(value) { const difficulty = String(value || "starter").toLowerCase().trim(); return ["starter", "normal", "hard"].includes(difficulty) ? difficulty : "starter"; }
function clampInt(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isNaN(number) ? fallback : Math.max(min, Math.min(max, number)); }
function cleanText(value, maxLength) { if (typeof value !== "string") return ""; return value.replace(/\s+/g, " ").trim().slice(0, maxLength); }
function labelSection(section) { return section === "mixed" ? "Mixed MEPT" : section.charAt(0).toUpperCase() + section.slice(1); }
function messageOf(error) { return error instanceof Error ? error.message : "Unknown error"; }
