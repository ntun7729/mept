const state = { quiz: null };
const $ = (id) => document.getElementById(id);
const quiz = $("quiz");
const statusBox = $("status");
const resultBox = $("result");

$("generate").addEventListener("click", generateQuiz);

async function generateQuiz() {
  setStatus("Generating MEPT-style questions...");
  resultBox.innerHTML = "";
  quiz.innerHTML = "";
  $("generate").disabled = true;
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: $("section").value,
        difficulty: $("level")?.value || "normal",
        count: $("count").value,
        includeAudio: $("section").value === "listening"
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to generate questions");
    state.quiz = data.quiz || { id: "", questions: data.questions || [] };
    renderQuiz();
    setStatus(`Generated ${state.quiz.questions.length} question(s).`);
  } catch (error) {
    setStatus(error.message || "Something went wrong.");
  } finally {
    $("generate").disabled = false;
  }
}

function renderQuiz() {
  quiz.innerHTML = "";
  const heading = document.createElement("section");
  heading.className = "question-card";
  heading.innerHTML = `<h2>${escapeHtml(state.quiz.title || "MEPT Practice Quiz")}</h2><p>${escapeHtml(state.quiz.instructions || "Answer all questions.")}</p>`;
  quiz.append(heading);
  state.quiz.questions.forEach((question, index) => quiz.append(renderQuestion(question, index)));
  const row = document.createElement("div");
  row.className = "submit-row";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Check answers";
  button.addEventListener("click", checkAnswers);
  row.append(button);
  quiz.append(row);
}

function renderQuestion(question, index) {
  const card = document.createElement("section");
  card.className = "question-card";
  card.dataset.questionId = question.id;

  const head = document.createElement("div");
  head.className = "question-head";
  head.innerHTML = `<h2>Question ${index + 1}</h2><span class="badge">${escapeHtml(question.section || question.type || "MEPT")}</span>`;
  card.append(head);

  if (question.passage) {
    const passage = document.createElement("div");
    passage.className = "passage";
    passage.textContent = question.passage;
    card.append(passage);
  }

  if (question.script) {
    const actions = document.createElement("div");
    actions.className = "audio-actions";
    actions.append(browserSpeechButton(question), serverAudioButton(question));
    card.append(actions);
  }

  const prompt = document.createElement("p");
  prompt.className = "prompt";
  prompt.textContent = question.prompt || "";
  card.append(prompt);

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
    textarea.placeholder = question.type === "ordering" ? "Type the order, e.g. A, B, C, D" : "Type your answer here";
    card.append(textarea);
  }

  if (question.script) {
    const details = document.createElement("details");
    details.className = "transcript";
    const summary = document.createElement("summary");
    summary.textContent = "Show transcript for review";
    const text = document.createElement("p");
    text.textContent = question.script;
    details.append(summary, text);
    card.append(details);
  }
  return card;
}

async function checkAnswers() {
  if (!state.quiz) return;
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
  }
}

function getAnswer(question) {
  const checked = quiz.querySelector(`input[name="${cssEscape(question.id)}"]:checked`);
  if (checked) return checked.value;
  const text = quiz.querySelector(`textarea[name="${cssEscape(question.id)}"]`);
  return text ? text.value : "";
}

function renderResult(data) {
  resultBox.innerHTML = `<h2>Score: ${data.score} / ${data.maxScore} (${data.percent || 0}%)</h2>`;
  (data.results || []).forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "result-item";
    div.innerHTML = `<strong>Question ${index + 1}: ${item.correct ? "Correct" : "Review"}</strong><p>${escapeHtml(item.feedback || "")}</p>`;
    if (item.correctAnswer) div.innerHTML += `<p><strong>Answer:</strong> ${escapeHtml(String(item.correctAnswer))}</p>`;
    if (item.improvedAnswer) div.innerHTML += `<p><strong>Improved:</strong> ${escapeHtml(String(item.improvedAnswer))}</p>`;
    resultBox.append(div);
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

function letter(index) { return String.fromCharCode(65 + index); }
function setStatus(text) { statusBox.textContent = text; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function cssEscape(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
