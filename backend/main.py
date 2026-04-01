from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from schemas import AIOptionsResponse, CorrectTextRequest, CorrectTextResponse, ProcessAudioResponse
from services.pipeline import AudioPipeline
from settings import get_settings


settings = get_settings()

app = FastAPI(title="Voice Capture API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

pipeline = AudioPipeline()


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}


@app.get("/api/ai-options", response_model=AIOptionsResponse)
async def ai_options() -> AIOptionsResponse:
    return AIOptionsResponse(**pipeline.grammar_options())


@app.post("/api/process-audio", response_model=ProcessAudioResponse)
async def process_audio(
    audio: UploadFile = File(...),
) -> ProcessAudioResponse:
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an audio type.")

    audio_bytes = await audio.read()
    max_bytes = settings.max_audio_mb * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file exceeds limit of {settings.max_audio_mb} MB.",
        )

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    try:
        result = await pipeline.process(audio_bytes=audio_bytes, mime_type=audio.content_type)
        return ProcessAudioResponse(**result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI processing failed: {exc}") from exc


@app.post("/api/correct-text", response_model=CorrectTextResponse)
async def correct_text(
    payload: CorrectTextRequest,
) -> CorrectTextResponse:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    if len(text) > settings.max_text_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds limit of {settings.max_text_chars} characters.",
        )

    try:
        result = await pipeline.correct_text(
            text,
            provider=payload.provider,
            correct_model=payload.correct_model,
            language=payload.language,
        )
        return CorrectTextResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Text correction failed: {exc}") from exc
