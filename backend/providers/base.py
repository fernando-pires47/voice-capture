from abc import ABC, abstractmethod


class AIProvider(ABC):
    @abstractmethod
    def transcribe_audio(self, audio_bytes: bytes, mime_type: str, model: str | None = None) -> str:
        raise NotImplementedError

    @abstractmethod
    def correct_grammar(
        self,
        text: str,
        model: str | None = None,
        language: str | None = None,
        output_mode: str | None = None,
    ) -> str:
        raise NotImplementedError
