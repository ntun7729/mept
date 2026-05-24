const state = { quiz: null, isGenerating: false, isChecking: false };
const $ = (id) => document.getElementById(id);
const quizEl = $("quiz");
const statusEl = $("status");
const resultEl = $("result");
const generateButton = $("generate");
let checkButton = null;

generateButton.addEventListener("click", generateQuiz);
quizEl.addEventListener("submit", (event) => event.preventDefault());

async function generateQuiz() {
  if (state.isGenerating || state.isChecking) return;
  const section = $("section").value;
  setGenerating(true);
  setStatus("Generating MEPT-style questions...");
  resultEl.innerHTML = "";
  quizEl.innerHTML = "";
  checkButton = null;
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section,
        difficulty: $("level")?.value || "normal",
        count: $("count").value,
        topic: $("topic")?.value || "",
        includeAudio: Boolean($("includeAudio")?.checked || section === "listening")
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to generate questions");
    state.quiz = data.quiz || { id: "", questions: data.questions || [] };
    renderQuiz();
    setStatus(`Generated ${state.quiz.questions.length} question(s). ${state.quiz.generatedBy === "local-fallback" ? "Using local fallback." : ""}`);
  } catch (error) {
    setStatus(error.message || "Something went wrong.");
  } finally {
    setGenerating(false);
  }
}

function renderQuiz() {
  quizEl.innerHTML = "";
  const heading = document.createElement("section");
  heading.className = "question-card";
  heading.innerHTML = `<h2>${esc(state.quiz.title || "MEPT Practice Quiz")}</h2><p>${esc(state.quiz.instructions || "Answer all questions.")}</p>`;
  if (state.quiz.warning) {
    const warning = document.createElement("p");
    warning.className = "warning";
    warning.textContent = state.quiz.warning;
    heading.append(warning);
  }
  quizEl.append(heading);
  state.quiz.questions.forEach((question, index) => quizEl.append(renderQuestion(question, index)));
  const row = document.createElement("div");
  row.className = "submit-row";
  checkButton = document.createElement("button");
  checkButton.type = "button";
  checkButton.textContent = "Check answers";
  checkButton.addEventListener("click", checkAnswers);
  row.append(checkButton);
  quizEl.append(row);
  updateBusyControls();
}

function renderQuestion(question, index) {
  const card = document.createElement("section");
  card.className = "question-card";
  const head = document.createElement("div");
  head.className = "question-head";
  head.innerHTML = `<h2>Question ${index + 1}</h2><span class="badge">${esc(question.section || question.type || "MEPT")}</span>`;
  card.append(head);
  if (question.passage) card.append(block("passage", question.passage));
  if (question.script) {
    const actions = document.createElement("div");
    actions.className = "audio-actions";
    actions.append(browserSpeechButton(question), serverAudioButton(question));
    card.append(actions);
  }
  card.append(block("prompt", question.prompt || ""));
  if (Array.isArray(question.options) && question.options.length && question.type !== "ordering") {
    const options = document.createElement("div");
    options.className = "options";
    question.options.forEach((option, optionIndex) => {
      const optionId = option.id || letter(optionIndex);
      const label = document.createElement("label");
      label.className = "option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = question.id;
      input.value = optionId;
      label.append(input, document.createTextNode(`${optionId}. ${option.text || option}`));
      options.append(label);
    });
    card.append(options);
  } else {
    const textarea = document.createElement("textarea");
    textarea.name = question.id;
    textarea.placeholder = question.type === "ordering" ? "Type the order, e.g. B, D, C, A" : "Type your answer here";
    card.append(textarea);
  }
  if (question.wordLimit) card.append(block("hint", `Word limit: ${question.wordLimit}`));
  if (question.script) {
    const details = document.createElement("details");
    details.className = "transcript";
    details.innerHTML = `<summary>Show transcript for review</summary><p>${esc(question.script)}</p>`;
    card.append(details);
  }
  return card;
}

async function checkAnswers() {
  if (!state.quiz || state.isGenerating || state.isChecking) return;
  setChecking(true);
  setStatus("Checking answers...");
  const responses = {};
  for (const question of state.quiz.questions) responses[question.id] = getAnswer(question);
  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId: state.quiz.id, responses })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to check answers");
    renderResult(data);
    setStatus("Done.");
  } catch (error) {
    setStatus(error.message || "Could not check answers.");
  } finally {
    setChecking(false);
  }
}

function setGenerating(value) {
  state.isGenerating = value;
  updateBusyControls();
}

function setChecking(value) {
  state.isChecking = value;
  updateBusyControls();
}

function updateBusyControls() {
  generateButton.disabled = state.isGenerating || state.isChecking;
  generateButton.textContent = state.isGenerating ? "Generating..." : "Generate questions";
  if (checkButton) {
    checkButton.disabled = state.isGenerating || state.isChecking;
    checkButton.textContent = state.isChecking ? "Checking..." : "Check answers";
  }
  for (const field of quizEl.querySelectorAll("input, textarea")) {
    field.disabled = state.isChecking;
  }
}

function getAnswer(question) {
  const checked = quizEl.querySelector(`input[name="${css(question.id)}"]:checked`);
  if (checked) return checked.value;
  const text = quizEl.querySelector(`textarea[name="${css(question.id)}"]`);
  return text ? text.value : "";
}

function renderResult(data) {
  resultEl.innerHTML = `<h2>Score: ${data.score} / ${data.maxScore} (${data.percent || 0}%)</h2>`;
  (data.results || []).forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "result-item";
    div.innerHTML = `<strong>Question ${index + 1}: ${item.correct ? "Correct" : "Review"}</strong><p>${esc(item.feedback || "")}</p>`;
    if (item.correctAnswer) div.innerHTML += `<p><strong>Answer:</strong> ${esc(String(item.correctAnswer))}</p>`;
    if (item.improvedAnswer) div.innerHTML += `<p><strong>Improved:</strong> ${esc(String(item.improvedAnswer))}</p>`;
    resultEl.append(div);
  });
}

function browserSpeechButton(question) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = "Read aloud in browser";
  button.addEventListener("click", () => {
    if (!window.speechSynthesis) return alert("This browser does not support speech synthesis.");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(question.script);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  });
  return button;
}

function serverAudioButton(question) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = "Generate audio";
  button.addEventListener("click", async () => {
    if (state.isGenerating || state.isChecking) return;
    button.disabled = true;
    button.textContent = "Generating audio...";
    try {
      const response = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: state.quiz.id, questionId: question.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.fallback || "Audio failed");
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = `data:${data.mimeType};base64,${data.audioBase64}`;
      button.after(audio);
      button.textContent = "Audio generated";
    } catch (error) {
      alert(`${error.message}\n\nUse Read aloud in browser as fallback.`);
      button.textContent = "Generate audio";
      button.disabled = false;
    }
  });
  return button;
}

function block(className, text) { const el = document.createElement("p"); el.className = className; el.textContent = text; return el; }
function letter(index) { return String.fromCharCode(65 + index); }
function setStatus(text) { statusEl.textContent = text; }
function esc(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function css(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
