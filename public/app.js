const state = { questions: [] };

const $ = (id) => document.getElementById(id);
const quiz = $('quiz');
const statusBox = $('status');
const resultBox = $('result');

$('generate').addEventListener('click', generateQuestions);

async function generateQuestions() {
  setStatus('Generating MEPT-style questions...');
  resultBox.innerHTML = '';
  quiz.innerHTML = '';
  $('generate').disabled = true;
  try {
    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: $('section').value,
        level: $('level').value,
        count: $('count').value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to generate questions');
    state.questions = Array.isArray(data.questions) ? data.questions : [];
    renderQuiz();
    setStatus(`Generated ${state.questions.length} question(s).`);
  } catch (error) {
    setStatus(error.message || 'Something went wrong.');
  } finally {
    $('generate').disabled = false;
  }
}

function renderQuiz() {
  quiz.innerHTML = '';
  state.questions.forEach((question, index) => quiz.append(renderQuestion(question, index)));
  if (state.questions.length) {
    const row = document.createElement('div');
    row.className = 'submit-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Check answers';
    button.addEventListener('click', checkAnswers);
    row.append(button);
    quiz.append(row);
  }
}

function renderQuestion(question, index) {
  const card = document.createElement('section');
  card.className = 'question-card';
  card.dataset.questionId = question.id;

  const head = document.createElement('div');
  head.className = 'question-head';
  head.innerHTML = `<h2>Question ${index + 1}</h2><span class="badge">${escapeHtml(question.section || 'MEPT')}</span>`;
  card.append(head);

  const title = document.createElement('h3');
  title.textContent = question.title || question.skill || 'Practice item';
  card.append(title);

  if (question.audioScript) card.append(renderAudioTools(question));

  const prompt = document.createElement('p');
  prompt.className = 'prompt';
  prompt.textContent = question.prompt || '';
  card.append(prompt);

  if (Array.isArray(question.options) && question.options.length && question.type !== 'ordering') {
    const options = document.createElement('div');
    options.className = 'options';
    question.options.forEach((option, optionIndex) => {
      const label = document.createElement('label');
      label.className = 'option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = question.id;
      input.value = letter(optionIndex);
      label.append(input, document.createTextNode(`${letter(optionIndex)}. ${option}`));
      options.append(label);
    });
    card.append(options);
  } else {
    const textarea = document.createElement('textarea');
    textarea.name = question.id;
    textarea.placeholder = question.type === 'ordering' ? 'Type the order, e.g. A, B, C, D' : 'Type your answer here';
    card.append(textarea);
  }

  if (question.audioScript) {
    const details = document.createElement('details');
    details.className = 'transcript';
    const summary = document.createElement('summary');
    summary.textContent = 'Show transcript for review';
    const text = document.createElement('p');
    text.textContent = question.audioScript;
    details.append(summary, text);
    card.append(details);
  }

  return card;
}

function renderAudioTools(question) {
  const wrap = document.createElement('div');
  wrap.className = 'audio-tools';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Play listening audio';
  button.addEventListener('click', () => {
    const utterance = new SpeechSynthesisUtterance(question.audioScript);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
  wrap.append(button);
  return wrap;
}

async function checkAnswers() {
  setStatus('Checking answers...');
  const answers = state.questions.map((question) => ({ questionId: question.id, answer: getAnswer(question) }));
  try {
    const response = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to check answers');
    renderResult(data);
    setStatus('Done.');
  } catch (error) {
    setStatus(error.message || 'Could not check answers.');
  }
}

function getAnswer(question) {
  const checked = quiz.querySelector(`input[name="${cssEscape(question.id)}"]:checked`);
  if (checked) return checked.value;
  const text = quiz.querySelector(`textarea[name="${cssEscape(question.id)}"]`);
  return text ? text.value : '';
}

function renderResult(data) {
  resultBox.innerHTML = `<h2>Score: ${data.score} / ${data.maxScore}</h2>`;
  (data.results || []).forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `<strong>Question ${index + 1}: ${item.score ? 'Correct' : 'Review'}</strong><p>${escapeHtml(item.feedback || '')}</p>`;
    if (item.correctAnswer) div.innerHTML += `<p><strong>Answer:</strong> ${escapeHtml(String(item.correctAnswer))}</p>`;
    resultBox.append(div);
  });
}

function letter(index) { return String.fromCharCode(65 + index); }
function setStatus(text) { statusBox.textContent = text; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function cssEscape(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
