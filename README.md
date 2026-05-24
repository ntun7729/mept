# MEPT English Trainer

A Node.js web app for MEPT-style English practice.

Features:

- Generate grammar, reading, writing, listening, speaking, or mixed quizzes.
- Render Google-Form-style answer choices.
- Check objective answers locally and writing/speaking answers with an AI provider.
- Generate listening scripts and optionally create audio through a compatible speech endpoint.
- Structured JSON logs for requests, AI calls, quiz generation, checking, and audio.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8787`.

Keep provider keys in environment variables; never put them in browser code.

Required provider variables:

```bash
AI_API_KEY=your_key
AI_BASE_URL=https://integrate.api.nvidia.com/v1
AI_MODEL=z-ai/glm-5.1
PORT=8787
```

Optional audio variables:

```bash
AUDIO_API_KEY=your_audio_key_or_same_key
AUDIO_BASE_URL=https://api.openai.com/v1
AUDIO_MODEL=tts-1
AUDIO_VOICE=alloy
```

## Logs

Logs are enabled by default at `info` level. They are printed as JSON lines in the terminal where you run the server.

```bash
npm run dev
```

For more detail:

```bash
npm run dev:debug
```

Or set the level manually:

```bash
LOG_LEVEL=debug npm run dev
LOG_LEVEL=info npm run dev
LOG_LEVEL=warn npm run dev
LOG_LEVEL=error npm run dev
LOG_LEVEL=silent npm run dev
```

Useful log events:

- `server.started`
- `http.request`
- `quiz.generate.request`
- `question.generate.start`
- `ai.chat.request`
- `ai.chat.response`
- `quiz.generate.success`
- `quiz.check.request`
- `check.complete`
- `audio.request`
- `ai.audio.response`

API keys, tokens, secrets, passwords, and authorization fields are redacted before logging.

## Check syntax

```bash
npm run check
```
