# MEPT English Trainer

A Node.js web app for MEPT-style English practice.

Features:

- Generate grammar, reading, writing, listening, speaking, or mixed quizzes.
- Render Google-Form-style answer choices.
- Check objective answers locally and writing/speaking answers with an AI provider.
- Generate listening scripts and optionally create audio through a compatible speech endpoint.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:8787`.

Keep provider keys in `.env`; never put them in browser code.
