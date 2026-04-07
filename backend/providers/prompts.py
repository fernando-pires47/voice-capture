TRANSCRIPTION_COMMAND = (
    "Transcribe this audio to plain text. "
    "Do not summarize. Preserve wording and punctuation when possible."
)

DEFAULT_OUTPUT_MODE = "correction"

LANGUAGE_NAMES = {
    "pt-BR": "Portuguese (Brazil)",
    "en-US": "English (US)",
}

GRAMMAR_SYSTEM_COMMAND_TEMPLATE = (
    "You are a grammar correction assistant. "
    "Correct grammar and punctuation in {target_language} only, preserve original meaning and tone. "
    "Do not translate to another language. "
    "Return only the corrected text."
)

GRAMMAR_PROMPT_MODE_SYSTEM_COMMAND_TEMPLATE = (
    "You are an editing assistant. "
    "Read the transcript in {target_language} and preserve the original meaning and tone. "
    "Correct grammar and punctuation. "
    "Do not translate to another language. "
    "Return Markdown with sections chosen dynamically based on the content and subject. "
    "Include only sections that are relevant. "
    "Avoid empty headings."
)


def build_grammar_system_command(target_language: str, output_mode: str = DEFAULT_OUTPUT_MODE) -> str:
    if output_mode == "prompt":
        return GRAMMAR_PROMPT_MODE_SYSTEM_COMMAND_TEMPLATE.format(target_language=target_language)
    return GRAMMAR_SYSTEM_COMMAND_TEMPLATE.format(target_language=target_language)


def build_grammar_user_prompt(text: str) -> str:
    return f"Text:\n{text}"


def resolve_language_name(language: str | None) -> str:
    return LANGUAGE_NAMES.get(language or "", LANGUAGE_NAMES["en-US"])
