import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type StatusType = "idle" | "recording" | "processing" | "done" | "error";
type OutputMode = "correction" | "prompt";

type ProviderConfig = {
  correct: string[];
};

type AIOptionsResponse = {
  defaults?: {
    provider?: string;
    correct_model?: string;
    language?: string;
  };
  providers: Record<string, ProviderConfig>;
  languages?: string[];
};

type CorrectTextResponse = {
  corrected_text?: string;
  provider?: string;
  language?: string;
  output_mode?: OutputMode;
  models?: {
    transcribe?: string;
    correct?: string;
  };
};

type Status = {
  type: StatusType;
  label: string;
};

const STORAGE_PROVIDER_KEY = "voiceCapture.grammarProvider";
const STORAGE_MODEL_KEY = "voiceCapture.grammarModel";
const STORAGE_LANGUAGE_KEY = "voiceCapture.language";
const STORAGE_APPLY_GRAMMAR_KEY = "voiceCapture.applyGrammarCorrection";
const STORAGE_OUTPUT_MODE_KEY = "voiceCapture.outputMode";
const DEFAULT_HINT = "Tip: Use a quiet environment for better transcription quality.";
const DEFAULT_SUPPORTED_LANGUAGES = ["en-US", "pt-BR"];

function providerLabel(providerId: string): string {
  if (providerId === "zai") {
    return "Z.AI";
  }
  if (providerId === "openrouter") {
    return "OpenRouter";
  }
  if (providerId === "gemini") {
    return "Gemini";
  }
  return providerId;
}

function languageLabel(languageCode: string): string {
  if (languageCode === "pt-BR") {
    return "Portuguese (Brazil)";
  }
  if (languageCode === "en-US") {
    return "English (US)";
  }
  return languageCode;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getStatusClass(type: StatusType): string {
  if (type === "recording") {
    return "bg-red-100 text-red-700";
  }
  if (type === "processing") {
    return "bg-amber-100 text-amber-800";
  }
  if (type === "done") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (type === "error") {
    return "bg-red-100 text-red-800";
  }
  return "bg-slate-200 text-slate-700";
}

export default function App() {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerIdRef = useRef<number | null>(null);
  const shouldProcessOnStopRef = useRef(false);
  const isRecordingRef = useRef(false);
  const rawOutputRef = useRef("");
  const providerRef = useRef("");
  const modelRef = useRef("");
  const languageRef = useRef("en-US");
  const applyGrammarCorrectionRef = useRef(true);
  const outputModeRef = useRef<OutputMode>("correction");
  const [isRecording, setIsRecording] = useState(false);
  const [timerLabel, setTimerLabel] = useState("00:00");
  const [speechSupported, setSpeechSupported] = useState(true);
  const [status, setStatus] = useState<Status>({ type: "idle", label: "Idle" });
  const [hint, setHint] = useState(DEFAULT_HINT);
  const [rawOutput, setRawOutput] = useState("");
  const [correctedOutput, setCorrectedOutput] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [aiOptions, setAiOptions] = useState<AIOptionsResponse | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [applyGrammarCorrection, setApplyGrammarCorrection] = useState(true);
  const [outputMode, setOutputMode] = useState<OutputMode>("correction");
  const [providerLoadingFailed, setProviderLoadingFailed] = useState(false);

  const hasTextContent = Boolean(rawOutput.trim() || correctedOutput.trim());
  const providers = Object.keys(aiOptions?.providers ?? {});
  const providerModels = provider ? aiOptions?.providers?.[provider]?.correct ?? [] : [];
  const supportedLanguages = aiOptions?.languages?.length ? aiOptions.languages : DEFAULT_SUPPORTED_LANGUAGES;
  const providerSelectDisabled = !applyGrammarCorrection || providerLoadingFailed || providers.length === 0;
  const modelSelectDisabled = !applyGrammarCorrection || providerLoadingFailed || providerModels.length === 0;
  const outputModeSelectDisabled = !applyGrammarCorrection;

  const startDisabled = !speechSupported || isRecording;
  const stopDisabled = !speechSupported || !isRecording;
  const cancelDisabled = !speechSupported || (!isRecording && !hasTextContent);

  function storeSelection(nextProvider: string, nextModel: string): void {
    localStorage.setItem(STORAGE_PROVIDER_KEY, nextProvider);
    localStorage.setItem(STORAGE_MODEL_KEY, nextModel);
  }

  function storeLanguageSelection(nextLanguage: string): void {
    localStorage.setItem(STORAGE_LANGUAGE_KEY, nextLanguage);
  }

  function storeApplyGrammarSelection(nextValue: boolean): void {
    localStorage.setItem(STORAGE_APPLY_GRAMMAR_KEY, String(nextValue));
  }

  function storeOutputModeSelection(nextMode: OutputMode): void {
    localStorage.setItem(STORAGE_OUTPUT_MODE_KEY, nextMode);
  }

  function resetTimer(): void {
    if (timerIdRef.current) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
    setTimerLabel("00:00");
  }

  function showToast(message: string): void {
    setToastMessage(message);
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 1800);
  }

  function stopRecognitionOnly(): void {
    if (recognitionRef.current && isRecordingRef.current) {
      recognitionRef.current.stop();
    }
  }

  async function processText(text: string): Promise<void> {
    setStatus({ type: "processing", label: "Processing" });
    setHint(
      outputModeRef.current === "prompt"
        ? "Sending text to AI structured prompt..."
        : "Sending text to AI grammar correction...",
    );

    try {
      const response = await fetch("/api/correct-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          provider: providerRef.current || null,
          correct_model: modelRef.current || null,
          language: languageRef.current || null,
          output_mode: outputModeRef.current,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorData.detail || "Text correction request failed.");
      }

      const data = (await response.json()) as CorrectTextResponse;
      const resolvedOutputMode = data.output_mode === "prompt" ? "prompt" : "correction";
      setOutputMode(resolvedOutputMode);
      storeOutputModeSelection(resolvedOutputMode);
      setCorrectedOutput(data.corrected_text || "");
      setStatus({ type: "done", label: "Completed" });
      setHint("Transcription and correction completed.");
      showToast("Done.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Text correction request failed.";
      setStatus({ type: "error", label: "Error" });
      setHint(message);
      showToast("Correction failed.");
    }
  }

  function startRecording(): void {
    if (!speechSupported || !recognitionRef.current || isRecordingRef.current) {
      return;
    }

    setRawOutput("");
    setCorrectedOutput("");

    shouldProcessOnStopRef.current = false;
    isRecordingRef.current = true;
    setIsRecording(true);

    const startAt = Date.now();
    timerIdRef.current = window.setInterval(() => {
      setTimerLabel(formatTime(Date.now() - startAt));
    }, 500);

    setStatus({ type: "recording", label: "Recording" });
    setHint("Recording with browser transcription... Click Stop when done.");
    recognitionRef.current.start();
  }

  function stopRecording(): void {
    if (!isRecordingRef.current || !recognitionRef.current) {
      return;
    }

    shouldProcessOnStopRef.current = true;
    setStatus({ type: "idle", label: "Finalizing" });
    setHint(
      applyGrammarCorrection
        ? outputMode === "prompt"
          ? "Transcription captured. Applying structured prompt..."
          : "Transcription captured. Applying grammar correction..."
        : "Transcription captured. Finalizing without grammar correction...",
    );
    recognitionRef.current.stop();
  }

  function cancelRecording(): void {
    shouldProcessOnStopRef.current = false;
    stopRecognitionOnly();
    isRecordingRef.current = false;
    setIsRecording(false);
    resetTimer();
    setRawOutput("");
    setCorrectedOutput("");
    setStatus({ type: "idle", label: "Idle" });
    setHint("Recording canceled.");
    showToast("Recording canceled.");
  }

  function clearOutputs(): void {
    shouldProcessOnStopRef.current = false;
    stopRecognitionOnly();
    isRecordingRef.current = false;
    setIsRecording(false);
    resetTimer();
    setRawOutput("");
    setCorrectedOutput("");
    setStatus({ type: "idle", label: "Idle" });
    setHint(DEFAULT_HINT);
  }

  async function copyText(text: string): Promise<void> {
    if (!text.trim()) {
      showToast("Nothing to copy.");
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast("Copied.");
  }

  useEffect(() => {
    rawOutputRef.current = rawOutput;
  }, [rawOutput]);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    applyGrammarCorrectionRef.current = applyGrammarCorrection;
  }, [applyGrammarCorrection]);

  useEffect(() => {
    outputModeRef.current = outputMode;
  }, [outputMode]);

  useEffect(() => {
    const savedValue = localStorage.getItem(STORAGE_APPLY_GRAMMAR_KEY);
    if (savedValue === "false") {
      setApplyGrammarCorrection(false);
    }
  }, []);

  useEffect(() => {
    const savedLanguage = localStorage.getItem(STORAGE_LANGUAGE_KEY);
    if (savedLanguage && DEFAULT_SUPPORTED_LANGUAGES.includes(savedLanguage)) {
      setLanguage(savedLanguage);
    }
  }, []);

  useEffect(() => {
    const savedOutputMode = localStorage.getItem(STORAGE_OUTPUT_MODE_KEY);
    if (savedOutputMode === "correction" || savedOutputMode === "prompt") {
      setOutputMode(savedOutputMode);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/ai-options");
        if (!response.ok) {
          throw new Error("Failed to load AI options.");
        }

        const data = (await response.json()) as AIOptionsResponse;
        const optionProviders = Object.keys(data.providers || {});
        setAiOptions(data);

        if (!optionProviders.length) {
          setProvider("");
          setModel("");
          return;
        }

        const savedProvider = localStorage.getItem(STORAGE_PROVIDER_KEY);
        const savedModel = localStorage.getItem(STORAGE_MODEL_KEY);
        const savedLanguage = localStorage.getItem(STORAGE_LANGUAGE_KEY);
        const defaultProvider = data.defaults?.provider || "";
        const initialProvider = optionProviders.includes(savedProvider || "")
          ? (savedProvider as string)
          : optionProviders.includes(defaultProvider)
            ? defaultProvider
            : optionProviders[0];

        const models = data.providers?.[initialProvider]?.correct || [];
        const defaultModel = data.defaults?.correct_model || "";
        const resolvedModel = models.includes(savedModel || "")
          ? (savedModel as string)
          : models.includes(defaultModel)
            ? defaultModel
            : models[0] || "";

        setProvider(initialProvider);
        setModel(resolvedModel);
        storeSelection(initialProvider, resolvedModel);

        const backendLanguages = data.languages?.length ? data.languages : DEFAULT_SUPPORTED_LANGUAGES;
        const defaultLanguage = data.defaults?.language || "";
        const initialLanguage = backendLanguages.includes(savedLanguage || "")
          ? (savedLanguage as string)
          : backendLanguages.includes(defaultLanguage)
            ? defaultLanguage
            : backendLanguages[0] || "en-US";

        setLanguage(initialLanguage);
        storeLanguageSelection(initialLanguage);
      } catch {
        setProviderLoadingFailed(true);
        setStatus({ type: "error", label: "Provider setup failed" });
        setHint("Could not load grammar provider options from backend.");
      }
    })();
  }, []);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
      setStatus({ type: "error", label: "Unsupported" });
      setHint("This browser does not support SpeechRecognition. Use a Chromium-based browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = languageRef.current;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcriptDelta = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcriptDelta += event.results[i][0].transcript;
      }

      if (!transcriptDelta.trim()) {
        return;
      }

      setRawOutput((previous) => {
        const existing = previous.trim();
        return existing ? `${existing} ${transcriptDelta.trim()}` : transcriptDelta.trim();
      });
    };

    recognition.onerror = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
      resetTimer();
      setStatus({ type: "error", label: "Error" });
      setHint("Speech recognition failed. Please retry.");
    };

    recognition.onend = () => {
      const shouldProcess = shouldProcessOnStopRef.current;
      isRecordingRef.current = false;
      setIsRecording(false);
      shouldProcessOnStopRef.current = false;
      resetTimer();

      if (!shouldProcess) {
        return;
      }

      const text = rawOutputRef.current.trim();
      if (!text) {
        setStatus({ type: "error", label: "No speech detected" });
        setHint("No speech detected. Try speaking louder and closer to the microphone.");
        return;
      }

      if (!applyGrammarCorrectionRef.current) {
        setCorrectedOutput("");
        setStatus({ type: "done", label: "Completed" });
        setHint("Transcription completed without grammar correction.");
        showToast("Done without correction.");
        return;
      }

      void processText(text);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      stopRecognitionOnly();
      resetTimer();
    };
  }, []);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language;
    }
  }, [language]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "r" && !startDisabled) {
        startRecording();
      }
      if (key === "s" && !stopDisabled) {
        stopRecording();
      }
      if (key === "x" && !cancelDisabled) {
        cancelRecording();
      }
      if (key === "c") {
        clearOutputs();
      }
      if (key === "1" && rawOutput.trim()) {
        void copyText(rawOutput);
      }
      if (key === "2" && correctedOutput.trim()) {
        void copyText(correctedOutput);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [
    cancelDisabled,
    correctedOutput,
    rawOutput,
    startDisabled,
    stopDisabled,
  ]);

  function onProviderChange(nextProvider: string): void {
    const nextModels = aiOptions?.providers?.[nextProvider]?.correct || [];
    const nextModel = nextModels[0] || "";
    setProvider(nextProvider);
    setModel(nextModel);
    storeSelection(nextProvider, nextModel);
  }

  function onModelChange(nextModel: string): void {
    setModel(nextModel);
    storeSelection(provider, nextModel);
  }

  function onApplyGrammarCorrectionChange(nextValue: boolean): void {
    setApplyGrammarCorrection(nextValue);
    storeApplyGrammarSelection(nextValue);
    if (!nextValue) {
      setCorrectedOutput("");
    }
  }

  function onLanguageChange(nextLanguage: string): void {
    setLanguage(nextLanguage);
    storeLanguageSelection(nextLanguage);
  }

  function onOutputModeChange(nextMode: OutputMode): void {
    setOutputMode(nextMode);
    storeOutputModeSelection(nextMode);
  }

  return (
    <>
      <main className="mx-auto max-w-5xl px-5 pb-12 pt-10 sm:px-6">
        <header>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Fernando Pires</p>
          <h1 className="mb-2 mt-2 flex items-center gap-2 text-[clamp(1.7rem,4vw,2.4rem)] font-bold leading-tight text-slate-900">
            <img src="/icon.svg" alt="" className="h-7 w-7 shrink-0" />
            Voice Capture Grammar Assistant
          </h1>
          <p className="m-0 max-w-prose text-slate-500">
            Record audio, transcribe it, and apply grammar correction with a configurable AI provider.
          </p>
        </header>

        <section
          aria-label="Recording controls"
          className="mt-6 rounded-[14px] border border-slate-200 bg-white p-5 shadow-panel"
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusClass(status.type)}`}>
              {status.label}
            </span>
            <span className="text-sm font-bold tabular-nums text-slate-500">{timerLabel}</span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Grammar provider selection">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-500" htmlFor="languageSelect">
              <span>Language</span>
              <select
                id="languageSelect"
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-200 transition focus-visible:ring-2"
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
              >
                {supportedLanguages.map((languageCode) => (
                  <option key={languageCode} value={languageCode}>
                    {languageLabel(languageCode)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-500" htmlFor="providerSelect">
              <span>Grammar Provider</span>
              <select
                id="providerSelect"
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-200 transition focus-visible:ring-2"
                value={provider}
                onChange={(event) => onProviderChange(event.target.value)}
                disabled={providerSelectDisabled}
              >
                {providers.map((providerId) => (
                  <option key={providerId} value={providerId}>
                    {providerLabel(providerId)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-500" htmlFor="modelSelect">
              <span>Grammar Model</span>
              <select
                id="modelSelect"
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-200 transition focus-visible:ring-2"
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
                disabled={modelSelectDisabled}
              >
                {providerModels.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-500" htmlFor="outputModeSelect">
              <span>Correction Structure</span>
              <select
                id="outputModeSelect"
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-900 outline-none ring-blue-200 transition focus-visible:ring-2"
                value={outputMode}
                onChange={(event) => onOutputModeChange(event.target.value as OutputMode)}
                disabled={outputModeSelectDisabled}
              >
                <option value="correction">Correction</option>
                <option value="prompt">Prompt</option>
              </select>
            </label>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700" htmlFor="applyGrammarCorrection">
            <span className="font-semibold">Apply grammar correction</span>
            <button
              id="applyGrammarCorrection"
              role="switch"
              aria-checked={applyGrammarCorrection}
              type="button"
              onClick={() => onApplyGrammarCorrectionChange(!applyGrammarCorrection)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                applyGrammarCorrection ? "bg-blue-900" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                  applyGrammarCorrection ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </label>

          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              className="rounded-xl border border-blue-900 bg-blue-900 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:border-blue-950 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={startRecording}
              disabled={startDisabled}
            >
              Start Recording (R)
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={stopRecording}
              disabled={stopDisabled}
            >
              Stop (S)
            </button>
            <button
              type="button"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={cancelRecording}
              disabled={cancelDisabled}
            >
              Cancel (X)
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-transparent px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-100"
              onClick={clearOutputs}
            >
              Clear (C)
            </button>
          </div>

          <p className="mb-0 mt-3 text-sm text-slate-500">{hint}</p>
        </section>

        <section aria-label="Outputs" className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-panel">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="m-0 text-base font-semibold text-slate-900">Raw Transcript</h2>
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-sm font-semibold text-blue-900 transition hover:text-blue-950"
                onClick={() => void copyText(rawOutput)}
              >
                Copy (1)
              </button>
            </div>
            <div className="min-h-[220px] rounded-xl border border-slate-200 bg-white p-3 text-base leading-relaxed text-slate-900 max-sm:min-h-[180px]">
              {rawOutput.trim() ? (
                    <div className="text-sm leading-relaxed text-slate-900 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-1 [&_ol]:mb-3 [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawOutput}</ReactMarkdown>
              </div>
              ) :
              (
                <p className="m-0 text-slate-400">
                Transcript will appear here.
              </p>
              )}
          
      
            </div>
          </article>

          <article className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-panel">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="m-0 text-base font-semibold text-slate-900">
                {outputMode === "prompt" ? "Structured Output" : "Grammar Corrected"}
              </h2>
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-sm font-semibold text-blue-900 transition hover:text-blue-950"
                onClick={() => void copyText(correctedOutput)}
              >
                Copy (2)
              </button>
            </div>
            <div className="min-h-[220px] rounded-xl border border-slate-200 bg-white p-3 text-base leading-relaxed text-slate-900 max-sm:min-h-[180px]">
              {correctedOutput.trim() && applyGrammarCorrection ? (
                <div className="text-sm leading-relaxed text-slate-900 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-1 [&_ol]:mb-3 [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{correctedOutput}</ReactMarkdown>
                </div>
              ) : (
                <p className="m-0 text-slate-400">
                  {applyGrammarCorrection
                    ? "Structured output will appear here."
                    : "Grammar correction is disabled."}
                </p>
              )}
            </div>
          </article>
        </section>
      </main>

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-5 right-5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-sm text-white transition ${
          toastVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {toastMessage}
      </div>
    </>
  );
}
