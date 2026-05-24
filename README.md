# MEPT English Trainer

A Node.js and Cloudflare Pages web app for MEPT-style English practice.

Features:

- Generate grammar, reading, writing, listening, speaking, or mixed quizzes.
- Render Google-Form-style answer choices.
- Check objective answers locally and writing/speaking answers with an AI provider.
- Generate listening scripts and optionally create audio through a compatible speech endpoint.
- Structured JSON logs for local debugging.
- Local fallback generation, so the Generate button still returns questions if the AI provider fails.
- Cloudflare Pages Functions support for deployment with Wrangler.

## Run locally with Node

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8787`.

## Run locally with Wrangler Pages

```bash
npm install
npm run pages:dev
```

Open the local URL printed by Wrangler.

## Deploy with Wrangler

Login first:

```bash
npx wrangler login
```

Set secrets:

```bash
npx wrangler pages secret put AI_API_KEY --project-name=mept
```

Optional audio secrets:

```bash
npx wrangler pages secret put AUDIO_API_KEY --project-name=mept
```

Deploy:

```bash
npm run deploy
```

The app uses `wrangler.toml` for production defaults. Production logs are silent by default:

```toml
NODE_ENV = "production"
LOG_LEVEL = "silent"
```

## Environment variables

Keep provider keys in environment variables; never put them in browser code.

Provider variables:

```bash
AI_API_KEY=your_key
AI_BASE_URL=https://integrate.api.nvidia.com/v1
AI_MODEL=z-ai/glm-5.1
PORT=8787
```

If `AI_API_KEY` is missing or the provider fails, `/api/generate` returns local fallback MEPT questions instead of returning an empty quiz. The page displays a warning explaining why fallback mode was used.

## Audio model settings

The audio model can be chosen separately from the chat model. Use these optional variables:

```bash
AUDIO_API_KEY=your_audio_key_or_same_key
AUDIO_BASE_URL=https://api.openai.com/v1
AUDIO_MODEL=tts-1
AUDIO_VOICE=alloy
```

Examples:

```bash
AUDIO_MODEL=tts-1
AUDIO_MODEL=gpt-4o-mini-tts
AUDIO_VOICE=alloy
AUDIO_VOICE=verse
```

The chat question generator uses `AI_MODEL`. The listening audio endpoint uses `AUDIO_MODEL`, `AUDIO_BASE_URL`, `AUDIO_API_KEY`, and `AUDIO_VOICE`. If `AUDIO_API_KEY` is omitted, it falls back to `AI_API_KEY` or `NVIDIA_API_KEY`.

## Cloudflare note about checking answers

The Cloudflare Pages Function keeps generated quizzes in memory for simple deployment. This is enough for basic use and quick testing. For high traffic, a future improvement is to store quizzes in Cloudflare KV so check requests always find the quiz across isolates.

## UI behavior

The Generate button is locked while questions are being generated. The Check answers button is locked while answers are being checked. This prevents duplicate overlapping requests from double-clicks or repeated presses.

## Logs

Local logs are enabled by default at `info` level. Production logs are silent by default through `wrangler.toml`.

For local detail:

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
- `question.generate.no_ai_key`
- `question.generate.ai_failed`
- `question.generate.fallback_ready`
- `ai.chat.retry_without_json_mode`
- `ai.chat.request`
- `ai.chat.response`
- `quiz.generate.success`
- `quiz.check.request`
- `check.complete`
- `audio.request`
- `ai.audio.response`

API keys, tokens, secrets, passwords, and authorization fields are redacted before logging.

## Quick API test

This should return questions even without an AI key because fallback mode is built in:

```bash
curl -s http://127.0.0.1:8787/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"section":"mixed","count":3,"difficulty":"normal","topic":"PPE","includeAudio":true}'
```

## Check syntax

```bash
npm run check
```
