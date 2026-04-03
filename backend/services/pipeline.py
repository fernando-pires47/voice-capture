import asyncio

from providers.factory import build_provider
from settings import get_settings


class AudioPipeline:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _resolve_grammar_selection(
        self,
        requested_provider: str | None,
        requested_model: str | None,
    ) -> tuple[str, str]:
        provider = (requested_provider or self.settings.ai_grammar_default_provider).strip().lower()
        if provider not in self.settings.allowed_grammar_providers:
            raise ValueError(
                f"Unsupported provider '{provider}'. "
                f"Allowed: {', '.join(self.settings.allowed_grammar_providers)}"
            )

        allowed_models = self.settings.allowed_correct_models.get(provider, [])
        if not allowed_models:
            raise ValueError(f"Provider '{provider}' has no allowlisted grammar models configured.")

        model = (requested_model or "").strip() or self.settings.ai_grammar_default_model
        if model not in allowed_models:
            raise ValueError(
                f"Model '{model}' is not allowlisted for provider '{provider}'. "
                f"Allowed: {', '.join(allowed_models)}"
            )

        return provider, model

    def _resolve_language(self, requested_language: str | None) -> str:
        language = (requested_language or self.settings.ai_default_language).strip()
        if language not in self.settings.supported_languages:
            raise ValueError(
                f"Unsupported language '{language}'. "
                f"Allowed: {', '.join(self.settings.supported_languages)}"
            )
        return language

    def _resolve_output_mode(self, requested_output_mode: str | None) -> str:
        output_mode = (requested_output_mode or "correction").strip().lower()
        allowed_modes = {"correction", "prompt"}
        if output_mode not in allowed_modes:
            raise ValueError(
                f"Unsupported output mode '{output_mode}'. "
                f"Allowed: {', '.join(sorted(allowed_modes))}"
            )
        return output_mode

    def _transcribe_model_for(self, provider: str) -> str:
        if provider == "gemini":
            return self.settings.gemini_transcribe_model
        if provider == "zai":
            return self.settings.zai_transcribe_model
        if provider == "openrouter":
            return self.settings.openrouter_transcribe_model
        return self.settings.ai_transcribe_model

    def grammar_options(self) -> dict:
        providers = {
            provider: {"correct": self.settings.allowed_correct_models.get(provider, [])}
            for provider in self.settings.allowed_grammar_providers
        }
        return {
            "providers": providers,
            "languages": self.settings.supported_languages,
            "defaults": {
                "provider": self.settings.ai_grammar_default_provider,
                "correct_model": self.settings.ai_grammar_default_model,
                "language": self._resolve_language(None),
            },
        }

    async def process(self, audio_bytes: bytes, mime_type: str) -> dict:
        provider_id, correct_model = self._resolve_grammar_selection(None, None)
        language = self._resolve_language(None)
        transcribe_model = self._transcribe_model_for(provider_id)
        provider = build_provider(provider_id, correct_model)

        transcript = await asyncio.to_thread(
            provider.transcribe_audio,
            audio_bytes,
            mime_type,
            transcribe_model,
        )

        warnings: list[str] = []
        try:
            corrected_text = await asyncio.to_thread(
                provider.correct_grammar,
                transcript,
                correct_model,
                language,
            )
        except Exception:
            corrected_text = transcript
            warnings.append("Grammar correction failed; returning original transcript.")

        return {
            "transcript": transcript,
            "corrected_text": corrected_text,
            "provider": provider_id,
            "models": {
                "transcribe": transcribe_model,
                "correct": correct_model,
            },
            "warnings": warnings,
        }

    async def correct_text(
        self,
        text: str,
        provider: str | None = None,
        correct_model: str | None = None,
        language: str | None = None,
        output_mode: str | None = None,
    ) -> dict:
        provider_id, selected_model = self._resolve_grammar_selection(provider, correct_model)
        selected_language = self._resolve_language(language)
        selected_output_mode = self._resolve_output_mode(output_mode)
        ai_provider = build_provider(provider_id, selected_model)
        corrected_text = await asyncio.to_thread(
            ai_provider.correct_grammar,
            text,
            selected_model,
            selected_language,
            selected_output_mode,
        )

        return {
            "corrected_text": corrected_text,
            "provider": provider_id,
            "models": {
                "correct": selected_model,
            },
            "language": selected_language,
            "output_mode": selected_output_mode,
        }
