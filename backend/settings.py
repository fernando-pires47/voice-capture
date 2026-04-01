from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    log_level: str = "INFO"

    ai_provider: str = "gemini"
    ai_api_key: str = ""
    ai_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    ai_transcribe_model: str = "gemini-2.0-flash"
    ai_correct_model: str = "gemini-2.0-flash"
    ai_timeout_seconds: float = 60.0

    ai_grammar_default_provider: str = Field(default="gemini", alias="AI_GRAMMAR_DEFAULT_PROVIDER")
    ai_grammar_default_model: str = Field(default="gemini-2.0-flash", alias="AI_GRAMMAR_DEFAULT_MODEL")
    ai_default_language: str = Field(default="en-US", alias="AI_DEFAULT_LANGUAGE")
    ai_supported_languages_raw: str = Field(
        default="en-US,pt-BR",
        alias="AI_SUPPORTED_LANGUAGES",
    )
    ai_allowed_grammar_providers_raw: str = Field(
        default="gemini,zai,openrouter",
        alias="AI_ALLOWED_GRAMMAR_PROVIDERS",
    )

    ai_allowed_models_gemini_correct_raw: str = Field(
        default="gemini-2.0-flash",
        alias="AI_ALLOWED_MODELS_GEMINI_CORRECT",
    )
    ai_allowed_models_zai_correct_raw: str = Field(
        default="glm-5",
        alias="AI_ALLOWED_MODELS_ZAI_CORRECT",
    )
    ai_allowed_models_openrouter_correct_raw: str = Field(
        default="openai/gpt-oss-20b:free",
        alias="AI_ALLOWED_MODELS_OPENROUTER_CORRECT",
    )

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        alias="GEMINI_BASE_URL",
    )
    gemini_transcribe_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_TRANSCRIBE_MODEL")

    zai_api_key: str = Field(default="", alias="ZAI_API_KEY")
    zai_base_url: str = Field(default="https://api.z.ai/api/paas/v4", alias="ZAI_BASE_URL")
    zai_transcribe_model: str = Field(default="whisper-1", alias="ZAI_TRANSCRIBE_MODEL")

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1", alias="OPENROUTER_BASE_URL")
    openrouter_transcribe_model: str = Field(default="whisper-1", alias="OPENROUTER_TRANSCRIBE_MODEL")

    max_text_chars: int = Field(default=8000, alias="MAX_TEXT_CHARS")

    cors_origins_raw: str = Field(
        default="http://127.0.0.1:8080,http://localhost:8080",
        alias="CORS_ORIGINS",
    )
    max_audio_mb: int = 20

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    @property
    def allowed_grammar_providers(self) -> list[str]:
        return self._csv(self.ai_allowed_grammar_providers_raw)

    @property
    def supported_languages(self) -> list[str]:
        return self._csv(self.ai_supported_languages_raw)

    @property
    def allowed_correct_models(self) -> dict[str, list[str]]:
        return {
            "gemini": self._csv(self.ai_allowed_models_gemini_correct_raw),
            "zai": self._csv(self.ai_allowed_models_zai_correct_raw),
            "openrouter": self._csv(self.ai_allowed_models_openrouter_correct_raw),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
