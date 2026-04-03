import base64

import httpx

from providers.base import AIProvider
from providers.prompts import (
    TRANSCRIPTION_COMMAND,
    build_grammar_system_command,
    build_grammar_user_prompt,
    resolve_language_name,
)


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
        return self._generate_with_audio(
            model=model or self.default_transcribe_model,
            prompt=TRANSCRIPTION_COMMAND,
            audio_bytes=audio_bytes,
            mime_type=mime_type,
        )

    def correct_grammar(
        self,
        text: str,
        model: str | None = None,
        language: str | None = None,
        output_mode: str | None = None,
    ) -> str:
        target_language = resolve_language_name(language)
        prompt = (
            f"{build_grammar_system_command(target_language, output_mode or 'correction')}\n\n"
            f"{build_grammar_user_prompt(text)}"
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
