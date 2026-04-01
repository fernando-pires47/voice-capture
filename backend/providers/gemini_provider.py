import base64

import httpx

from providers.base import AIProvider


class GeminiProvider(AIProvider):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_seconds: float,
        transcribe_model: str,
        correct_model: str,
    ) -> None:
        if not api_key:
            raise ValueError("AI_API_KEY is required.")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout_seconds
        self.default_transcribe_model = transcribe_model
        self.default_correct_model = correct_model

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str, model: str | None = None) -> str:
        prompt = (
            "Transcribe this audio to plain text. "
            "Do not summarize. Preserve wording and punctuation when possible."
        )
        return self._generate_with_audio(
            model=model or self.default_transcribe_model,
            prompt=prompt,
            audio_bytes=audio_bytes,
            mime_type=mime_type,
        )

    def correct_grammar(
        self,
        text: str,
        model: str | None = None,
        language: str | None = None,
    ) -> str:
        target_language = self._language_name(language)
        prompt = (
            f"Correct grammar and punctuation in {target_language} only. Preserve original meaning and tone. "
            "Do not translate to another language. "
            "Return only corrected text.\n\n"
            f"Text:\n{text}"
        )
        return self._generate_text(
            model=model or self.default_correct_model,
            prompt=prompt,
        )

    def _generate_with_audio(
        self,
        model: str,
        prompt: str,
        audio_bytes: bytes,
        mime_type: str,
    ) -> str:
        encoded_audio = base64.b64encode(audio_bytes).decode("ascii")
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": encoded_audio,
                            }
                        },
                    ],
                }
            ],
        }

        data = self._post_generate_content(model=model, payload=payload)
        text = self._extract_text(data)
        if not text:
            raise ValueError("Gemini transcription returned empty text.")
        return text

    def _generate_text(self, model: str, prompt: str) -> str:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
        }

        data = self._post_generate_content(model=model, payload=payload)
        text = self._extract_text(data)
        if not text:
            raise ValueError("Gemini grammar correction returned empty text.")
        return text

    def _post_generate_content(self, model: str, payload: dict) -> dict:
        endpoint = f"{self.base_url}/models/{model}:generateContent"
        params = {"key": self.api_key}

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(endpoint, params=params, json=payload)

        if response.status_code >= 400:
            raise ValueError(f"Gemini API error {response.status_code}: {response.text}")

        return response.json()

    @staticmethod
    def _extract_text(data: dict) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            return ""

        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        text_fragments: list[str] = []
        for part in parts:
            value = part.get("text")
            if value:
                text_fragments.append(value)

        return "\n".join(fragment.strip() for fragment in text_fragments if fragment.strip()).strip()

    @staticmethod
    def _language_name(language: str | None) -> str:
        if language == "pt-BR":
            return "Portuguese (Brazil)"
        return "English (US)"
