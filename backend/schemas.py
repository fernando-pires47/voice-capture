from typing import Literal

from pydantic import BaseModel, Field


class ProcessModelInfo(BaseModel):
    transcribe: str
    correct: str


class CorrectModelInfo(BaseModel):
    correct: str


class ProcessAudioResponse(BaseModel):
    transcript: str
    corrected_text: str
    provider: str
    models: ProcessModelInfo
    warnings: list[str] = Field(default_factory=list)


class CorrectTextRequest(BaseModel):
    text: str
    provider: str | None = None
    correct_model: str | None = None
    language: Literal["en-US", "pt-BR"] | None = None
    output_mode: Literal["correction", "prompt"] | None = None


class CorrectTextResponse(BaseModel):
    corrected_text: str
    provider: str
    models: CorrectModelInfo
    language: Literal["en-US", "pt-BR"]
    output_mode: Literal["correction", "prompt"]


class ProviderModels(BaseModel):
    correct: list[str] = Field(default_factory=list)


class AIOptionsDefaults(BaseModel):
    provider: str
    correct_model: str
    language: Literal["en-US", "pt-BR"]


class AIOptionsResponse(BaseModel):
    providers: dict[str, ProviderModels]
    languages: list[Literal["en-US", "pt-BR"]]
    defaults: AIOptionsDefaults
