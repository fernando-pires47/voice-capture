# Provider API Keys and Models Runbook

Step-by-step guide to:

- create API keys for supported providers (`Gemini`, `Z.AI`, `OpenRouter`)
- discover available models
- map provider setup into this project `.env`
- verify what the app actually exposes in the frontend

This project does not hardcode provider/model choices in the frontend. The dropdown list comes from backend `GET /api/ai-options`, which is built from env allowlists.

## 1) Prepare local environment

1. Copy env template:

```bash
cp .env.example .env
```

2. Open `.env` and keep these fields in mind:

- credentials and base URLs:
  - `GEMINI_API_KEY`, `GEMINI_BASE_URL`
  - `ZAI_API_KEY`, `ZAI_BASE_URL`
  - `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
- frontend-visible allowlist:
  - `AI_ALLOWED_GRAMMAR_PROVIDERS`
  - `AI_ALLOWED_MODELS_GEMINI_CORRECT`
  - `AI_ALLOWED_MODELS_ZAI_CORRECT`
  - `AI_ALLOWED_MODELS_OPENROUTER_CORRECT`
- defaults:
  - `AI_GRAMMAR_DEFAULT_PROVIDER`
  - `AI_GRAMMAR_DEFAULT_MODEL`
  - `AI_DEFAULT_LANGUAGE`
  - `AI_SUPPORTED_LANGUAGES`

## 2) Create API key: Gemini

1. Go to Google AI Studio: `https://aistudio.google.com/`
2. Sign in with your Google account.
3. Open API keys page and create a new key.
4. Copy the key and store it in `.env`:

```env
GEMINI_API_KEY=your_real_key_here
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

5. Optional quick key check:

```bash
curl -sS "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```

If successful, you will receive a JSON payload with `models`.

## 3) Create API key: Z.AI

1. Go to Z.AI developer/console portal and sign in.
2. Create an API key in the credentials section.
3. Copy the key and place it in `.env`:

```env
ZAI_API_KEY=your_real_key_here
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
```

4. Optional quick key/model check (OpenAI-compatible style):

```bash
curl -sS "$ZAI_BASE_URL/models" \
  -H "Authorization: Bearer $ZAI_API_KEY"
```

If your account/region uses a different endpoint shape, use the endpoint shown in Z.AI docs/console for model listing.

## 4) Create API key: OpenRouter

1. Go to OpenRouter dashboard: `https://openrouter.ai/`
2. Sign in and open API Keys.
3. Create a key and copy it.
4. Store it in `.env`:

```env
OPENROUTER_API_KEY=your_real_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

5. Optional quick key/model check:

```bash
curl -sS "https://openrouter.ai/api/v1/models" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

## 5) Decide which models the app should expose

After you know available models, decide your allowlist in `.env`.

Example:

```env
AI_ALLOWED_GRAMMAR_PROVIDERS=gemini,zai,openrouter

AI_ALLOWED_MODELS_GEMINI_CORRECT=gemini-2.0-flash
AI_ALLOWED_MODELS_ZAI_CORRECT=glm-5
AI_ALLOWED_MODELS_OPENROUTER_CORRECT=openai/gpt-oss-20b:free

AI_GRAMMAR_DEFAULT_PROVIDER=gemini
AI_GRAMMAR_DEFAULT_MODEL=gemini-2.0-flash
AI_DEFAULT_LANGUAGE=en-US
AI_SUPPORTED_LANGUAGES=en-US,pt-BR
```

Notes:

- Only allowlisted models appear in the frontend dropdown.
- Provider/model requests outside the allowlist are rejected by backend validation.

## 6) Apply and validate

1. Restart stack after `.env` updates:

```bash
docker compose up --build -d
```

2. Verify backend-generated provider/model list:

```bash
curl -sS http://127.0.0.1:8080/api/ai-options
```

3. Open app and verify dropdown values:

- `http://127.0.0.1:8080`

The frontend provider list is exactly what `/api/ai-options` returns.

## 7) Troubleshooting

- `Provider setup failed` in UI: check `.env` and container logs (`docker compose logs -f api`).
- Provider missing from dropdown: ensure it exists in `AI_ALLOWED_GRAMMAR_PROVIDERS`.
- Model missing from dropdown: ensure it is present in the corresponding `AI_ALLOWED_MODELS_*_CORRECT` var.
- 400 error with `not allowlisted`: requested model/provider is not in env allowlist.
- Provider enabled but requests fail: key may be invalid, expired, or missing permissions/billing.

## 8) Operational checklist (copy/paste)

Use this as a quick onboarding checklist.

- [ ] Gemini key created and saved to `GEMINI_API_KEY`
- [ ] Z.AI key created and saved to `ZAI_API_KEY`
- [ ] OpenRouter key created and saved to `OPENROUTER_API_KEY`
- [ ] Allowed providers set in `AI_ALLOWED_GRAMMAR_PROVIDERS`
- [ ] Allowed models set in each `AI_ALLOWED_MODELS_*_CORRECT`
- [ ] Defaults set in `AI_GRAMMAR_DEFAULT_PROVIDER` and `AI_GRAMMAR_DEFAULT_MODEL`
- [ ] `docker compose up --build -d` completed
- [ ] `GET /api/ai-options` returns expected providers/models
