from openai import OpenAI

from providers.base import AIProvider


class OpenAICompatibleProvider(AIProvider):
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

        self.default_transcribe_model = transcribe_model
        self.default_correct_model = correct_model

        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout_seconds,
        )

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str, model: str | None = None) -> str:
        ext = self._ext_from_mime(mime_type)
        response = self.client.audio.transcriptions.create(
            model=model or self.default_transcribe_model,
            file=(f"recording.{ext}", audio_bytes, mime_type),
        )

        text = getattr(response, "text", "") or ""
        if not text.strip():
            raise ValueError("Transcription returned empty text.")
        return text.strip()

    def correct_grammar(
        self,
        text: str,
        model: str | None = None,
        language: str | None = None,
    ) -> str:
        target_language = self._language_name(language)
        response = self.client.chat.completions.create(
            model=model or self.default_correct_model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a grammar correction assistant. "
                        f"Correct grammar and punctuation in {target_language} only, preserve original meaning and tone. "
                        "Do not translate to another language. "
                        "Return only the corrected text."
                    ),
                },
                {"role": "user", "content": text},
            ],
        )

        corrected = response.choices[0].message.content if response.choices else ""
        if not corrected or not corrected.strip():
            raise ValueError("Grammar correction returned empty text.")
        return corrected.strip()

    @staticmethod
    def _ext_from_mime(mime_type: str) -> str:
        if "webm" in mime_type:
            return "webm"
        if "wav" in mime_type:
            return "wav"
        if "mpeg" in mime_type or "mp3" in mime_type:
            return "mp3"
        if "ogg" in mime_type:
            return "ogg"
        return "bin"

    @staticmethod
    def _language_name(language: str | None) -> str:
        if language == "pt-BR":
            return "Portuguese (Brazil)"
        return "English (US)"
