# Voice Capture + AI Grammar Correction

Local-first app that records voice in the browser, transcribes it on the frontend, and applies grammar correction on the backend with a selectable AI provider.

This setup is intended for local use only.

## Stack

- Frontend: React, TypeScript (strict), Tailwind CSS (Vite)
- Backend: Python, FastAPI
- AI integration: provider adapters (`gemini`, `zai`, `openrouter`)
- Infra: Docker Compose, Nginx

Browser transcription uses the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).

## Project Structure

- `backend/` FastAPI API and AI pipeline
- `frontend/` React app built with Vite and served by Nginx
- `docker-compose.yml` local orchestration
- `.env.example` environment template

## Requirements

- Docker
- Docker Compose v2
- API key(s) for one or more providers (`Gemini`, `Z.AI`, `OpenRouter`)

## Environment Configuration

For full provider onboarding (API key creation + model discovery + allowlist setup), see `docs/providers-runbook.md`.

1. Copy the template:

```bash
cp .env.example .env
```

2. Update `.env` values.

### Core Variables

- `AI_TIMEOUT_SECONDS`: request timeout in seconds.
- `MAX_TEXT_CHARS`: maximum allowed text payload for `/api/correct-text`.
- `AI_GRAMMAR_DEFAULT_PROVIDER`: default grammar provider.
- `AI_GRAMMAR_DEFAULT_MODEL`: default grammar model.
- `AI_DEFAULT_LANGUAGE`: default language for grammar correction and speech recognition (`en-US` or `pt-BR`).
- `AI_SUPPORTED_LANGUAGES`: comma-separated allowlist of supported languages.
- `AI_ALLOWED_GRAMMAR_PROVIDERS`: strict allowlist of selectable providers.
- `AI_ALLOWED_MODELS_<PROVIDER>_CORRECT`: strict allowlist of grammar models for each provider.

### Provider Credentials

- Gemini: `GEMINI_API_KEY`, `GEMINI_BASE_URL`
- Z.AI: `ZAI_API_KEY`, `ZAI_BASE_URL`
- OpenRouter: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`

### Other Variables

- `APP_ENV`: defaults to `local`.
- `LOG_LEVEL`: defaults to `INFO`.
- `CORS_ORIGINS`: comma-separated allowed origins.
- `MAX_TEXT_CHARS`: text payload limit for `POST /api/correct-text`.
- `MAX_AUDIO_MB`: audio upload size limit.

## Example `.env`

```env
APP_ENV=local
LOG_LEVEL=INFO

AI_TIMEOUT_SECONDS=60
MAX_TEXT_CHARS=8000

AI_GRAMMAR_DEFAULT_PROVIDER=gemini
AI_GRAMMAR_DEFAULT_MODEL=gemini-2.0-flash
AI_DEFAULT_LANGUAGE=en-US
AI_SUPPORTED_LANGUAGES=en-US,pt-BR
AI_ALLOWED_GRAMMAR_PROVIDERS=gemini,zai,openrouter
AI_ALLOWED_MODELS_GEMINI_CORRECT=gemini-2.0-flash
AI_ALLOWED_MODELS_ZAI_CORRECT=glm-5
AI_ALLOWED_MODELS_OPENROUTER_CORRECT=openai/gpt-oss-20b:free

GEMINI_API_KEY=your_gemini_key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta

ZAI_API_KEY=your_zai_key
ZAI_BASE_URL=https://api.z.ai/api/paas/v4

OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

CORS_ORIGINS=http://127.0.0.1:8080,http://localhost:8080
MAX_AUDIO_MB=20
```

## Runbook

### Start (foreground)

```bash
docker compose up --build
```

### Start (background)

```bash
docker compose up --build -d
```

### Access

- App: `http://127.0.0.1:8080`
- API health: `http://127.0.0.1:8000/api/health`

### Frontend (local dev)

```bash
cd frontend
npm install
npm run dev
```

- Vite dev server: `http://127.0.0.1:5173`
- API requests to `/api` are proxied to `http://127.0.0.1:8000` in dev mode.

### Logs

```bash
docker compose logs -f
```

### Stop

```bash
docker compose down
```

## API Endpoints

- `GET /api/health`
- `GET /api/ai-options` returns allowlisted grammar providers/models + defaults
- `POST /api/correct-text` with JSON body:

```json
{
  "text": "your raw transcript",
  "provider": "openrouter",
  "correct_model": "openai/gpt-oss-20b:free",
  "language": "pt-BR"
}
```

- `POST /api/process-audio` with `multipart/form-data` field `audio`

## Notes

- Grammar provider/model selection is strictly allowlisted by backend env config.
- Supported speech/correction languages are English (`en-US`) and Portuguese (Brazil) (`pt-BR`).
- Frontend remembers selected grammar provider/model/language in browser local storage.
- API keys stay on backend (`.env`) and are never exposed to the browser.

## Local Security Notes

- Ports are bound to localhost (`127.0.0.1`) only.
- Do not commit `.env`.
- Audio is processed per request and not persisted by default.
- This project is not production hardened.
