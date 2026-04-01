from providers.base import AIProvider
from providers.gemini_provider import GeminiProvider
from providers.openai_compatible import OpenAICompatibleProvider
from settings import get_settings


def _provider_credentials(provider: str, settings) -> tuple[str, str, str]:
    if provider == "gemini":
        api_key = settings.gemini_api_key or settings.ai_api_key
        base_url = settings.gemini_base_url or settings.ai_base_url
        transcribe_model = settings.gemini_transcribe_model or settings.ai_transcribe_model
        return api_key, base_url, transcribe_model

    if provider == "zai":
        return settings.zai_api_key, settings.zai_base_url, settings.zai_transcribe_model

    if provider == "openrouter":
        return (
            settings.openrouter_api_key,
            settings.openrouter_base_url,
            settings.openrouter_transcribe_model,
        )

    raise ValueError(f"Unsupported provider '{provider}'.")


def build_provider(provider: str, correct_model: str) -> AIProvider:
    settings = get_settings()
    api_key, base_url, transcribe_model = _provider_credentials(provider, settings)

    if provider == "gemini":
        return GeminiProvider(
            api_key=api_key,
            base_url=base_url,
            timeout_seconds=settings.ai_timeout_seconds,
            transcribe_model=transcribe_model,
            correct_model=correct_model,
        )

    if provider in {"zai", "openrouter"}:
        return OpenAICompatibleProvider(
            api_key=api_key,
            base_url=base_url,
            timeout_seconds=settings.ai_timeout_seconds,
            transcribe_model=transcribe_model,
            correct_model=correct_model,
        )

    raise ValueError(f"Unsupported provider '{provider}'.")
