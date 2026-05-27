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
const DEFAULT_HINT =
  "Tip: Use a quiet environment.";
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

type SpokenCommandRule = {
  pattern: RegExp;
  replacement: string;
};

const SPOKEN_COMMAND_RULES: SpokenCommandRule[] = [
  { pattern: /\b(new paragraph|novo paragrafo)\b/gi, replacement: "\n\n" },
  { pattern: /\b(paragraph break|quebra de paragrafo)\b/gi, replacement: "\n\n" },
  { pattern: /\b(new line|nova linha)\b/gi, replacement: "\n" },
  { pattern: /\b(line break|quebra de linha)\b/gi, replacement: "\n" },
  { pattern: /\b(new bullet|novo item|novo topico)\b/gi, replacement: "\n- " },
  { pattern: /\b(new title|novo titulo)\b/gi, replacement: "\n## " },
  { pattern: /\b(comma|virgula)\b/gi, replacement: "," },
  { pattern: /\b(period|ponto final|ponto|dot|full stop)\b/gi, replacement: "." },
  { pattern: /\b(question mark|interrogacao)\b/gi, replacement: "?" },
  { pattern: /\b(exclamation mark|exclamacao)\b/gi, replacement: "!" },
  { pattern: /\b(colon|dois pontos)\b/gi, replacement: ":" },
  { pattern: /\b(semicolon|ponto e virgula)\b/gi, replacement: ";" },
];

function applySpokenCommands(input: string): string {
  let next = input;
  for (const rule of SPOKEN_COMMAND_RULES) {
    next = next.replace(rule.pattern, rule.replacement);
  }
  return next;
}

function normalizeSpacing(input: string): string {
  let next = input;
  next = next.replace(/[ \t]+/g, " ");
  next = next.replace(/\s*\n\s*/g, "\n");
  next = next.replace(/\n{3,}/g, "\n\n");
  next = next.replace(/\s+([,.;:!?])/g, "$1");
  next = next.replace(/([,.;:!?])(?!\s|\n|$)/g, "$1 ");
  next = next.replace(/\n([,.;:!?])/g, "$1");
  return next.trim();
}

function applySentenceCasing(input: string): string {
  const chars = [...input.toLowerCase()];
  let shouldUppercase = true;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(char) && shouldUppercase) {
      chars[i] = char.toUpperCase();
      shouldUppercase = false;
      continue;
    }

    if (char === "." || char === "?" || char === "!" || char === "\n") {
      shouldUppercase = true;
    }
  }

  return chars.join("");
}

function formatTranscriptDelta(input: string): string {
  const withCommands = applySpokenCommands(input);
  const withSpacing = normalizeSpacing(withCommands);
  return applySentenceCasing(withSpacing);
}

function mergeTranscript(previous: string, delta: string): string {
  const formattedDelta = formatTranscriptDelta(delta);
  if (!formattedDelta.trim()) {
    return previous;
  }

  const base = previous.trimEnd();
  if (!base) {
    return formattedDelta;
  }

  if (formattedDelta.startsWith("\n")) {
    return `${base}${formattedDelta}`;
  }

  const separator = /[\n\s]$/.test(base) ? "" : " ";
  const merged = `${base}${separator}${formattedDelta}`;
  return applySentenceCasing(normalizeSpacing(merged));
}

function getStatusClass(type: StatusType): string {
  if (type === "recording") {
    return "bg-error/10 text-error border-error/20";
  }
  if (type === "processing") {
    return "bg-primary/10 text-primary border-primary/20";
  }
  if (type === "done") {
    return "bg-surface-bright text-on-surface border-on-secondary-container/20";
  }
  if (type === "error") {
    return "bg-error/10 text-error border-error/20";
  }
  return "bg-surface-variant text-on-surface-variant border-outline-variant/30";
}

function getStatusDotColor(type: StatusType): string {
  if (type === "recording") return "bg-error";
  if (type === "processing") return "bg-primary";
  if (type === "done") return "bg-on-secondary-container";
  if (type === "error") return "bg-error";
  return "bg-outline";
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
        return mergeTranscript(previous, transcriptDelta);
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
      <main className="max-w-[1200px] mx-auto w-full px-lg py-xl flex flex-col gap-lg flex-1">
        <div className="flex flex-col gap-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Fernando Pires</span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
            Voice Capture Grammar Assistant
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Record audio, transcribe it, and apply grammar correction with a configurable AI provider.
          </p>
        </div>

        <section
          aria-label="Recording controls"
          className="bg-surface-container rounded-lg p-lg border border-outline-variant/50 shadow-sm flex flex-col gap-lg relative overflow-hidden"
        >
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex justify-between items-center border-b border-outline-variant/30 pb-sm">
            <span className={`inline-flex items-center gap-xs rounded-full px-sm py-xs font-label-sm text-label-sm border ${getStatusClass(status.type)}`}>
              <span className={`w-2 h-2 rounded-full ${getStatusDotColor(status.type)}`}></span>
              {status.label}
            </span>
            <span className="font-label-md text-on-surface font-mono text-lg">{timerLabel}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
            <div className="flex flex-col gap-xs">
              <label className="font-label-sm text-on-surface-variant" htmlFor="languageSelect">Language</label>
              <select
                id="languageSelect"
                className="bg-surface-container-high border border-outline-variant/50 text-on-surface text-sm rounded-lg focus:ring-primary/50 focus:border-primary/50 block w-full p-2.5 pr-8 appearance-none chevron-dark outline-none transition-colors"
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
              >
                {supportedLanguages.map((languageCode) => (
                  <option key={languageCode} value={languageCode}>
                    {languageLabel(languageCode)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-sm text-on-surface-variant" htmlFor="providerSelect">Grammar Provider</label>
              <select
                id="providerSelect"
                className="bg-surface-container-high border border-outline-variant/50 text-on-surface text-sm rounded-lg focus:ring-primary/50 focus:border-primary/50 block w-full p-2.5 pr-8 appearance-none chevron-dark outline-none transition-colors"
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
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-sm text-on-surface-variant" htmlFor="modelSelect">Grammar Model</label>
              <select
                id="modelSelect"
                className="bg-surface-container-high border border-outline-variant/50 text-on-surface text-sm rounded-lg focus:ring-primary/50 focus:border-primary/50 block w-full p-2.5 pr-8 appearance-none chevron-dark outline-none transition-colors"
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
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-sm text-on-surface-variant" htmlFor="outputModeSelect">Correction Structure</label>
              <select
                id="outputModeSelect"
                className="bg-surface-container-high border border-outline-variant/50 text-on-surface text-sm rounded-lg focus:ring-primary/50 focus:border-primary/50 block w-full p-2.5 pr-8 appearance-none chevron-dark outline-none transition-colors"
                value={outputMode}
                onChange={(event) => onOutputModeChange(event.target.value as OutputMode)}
                disabled={outputModeSelectDisabled}
              >
                <option value="correction">Correction</option>
                <option value="prompt">Prompt</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <span className="font-label-md text-on-surface">Apply grammar correction</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={applyGrammarCorrection}
                onChange={() => onApplyGrammarCorrectionChange(!applyGrammarCorrection)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-md pt-sm">
            <button
              type="button"
              className="h-11 w-full bg-primary text-on-primary text-sm font-medium tracking-normal px-md py-sm rounded-lg inline-flex items-center justify-center gap-xs hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-45 disabled:cursor-not-allowed"
              onClick={startRecording}
              disabled={startDisabled}
            >
              <span className="material-symbols-outlined text-[13px]">mic</span>
              Start Recording (R)
            </button>
            <button
              type="button"
              className="h-11 w-full bg-surface-variant text-on-surface text-sm font-medium tracking-normal px-md py-sm rounded-lg inline-flex items-center justify-center gap-xs hover:bg-surface-container-highest transition-colors border border-outline-variant/30 disabled:opacity-45 disabled:cursor-not-allowed"
              onClick={stopRecording}
              disabled={stopDisabled}
            >
              <span className="material-symbols-outlined text-[13px]">stop_circle</span>
              Stop (S)
            </button>
            <button
              type="button"
              className="h-11 w-full bg-error/10 text-error text-sm font-medium tracking-normal px-md py-sm rounded-lg inline-flex items-center justify-center gap-xs hover:bg-error/20 transition-colors border border-error/20 disabled:opacity-45 disabled:cursor-not-allowed"
              onClick={cancelRecording}
              disabled={cancelDisabled}
            >
              <span className="material-symbols-outlined text-[13px]">close</span>
              Cancel (X)
            </button>
            <button
              type="button"
              className="h-11 w-full bg-transparent text-on-surface text-sm font-medium tracking-normal px-md py-sm rounded-lg inline-flex items-center justify-center gap-xs hover:bg-surface-variant transition-colors border border-outline-variant/30"
              onClick={clearOutputs}
            >
              <span className="material-symbols-outlined text-[13px]">delete</span>
              Clear (C)
            </button>
          </div>

          <div className="pt-sm border-t border-outline-variant/30">
            <p className="font-body-md text-sm text-on-surface-variant">{hint}</p>
          </div>
        </section>

        <section aria-label="Outputs" className="grid grid-cols-1 md:grid-cols-2 gap-lg h-full pb-xl">
          <article className="bg-surface-container rounded-lg p-md border border-outline-variant/50 shadow-sm flex flex-col h-full min-h-[300px]">
            <div className="flex justify-between items-center mb-sm">
              <h3 className="font-label-md text-on-surface">Raw Transcript</h3>
              <button
                type="button"
                className="text-primary hover:text-primary/80 text-sm font-medium tracking-normal inline-flex items-center gap-xs transition-colors"
                onClick={() => void copyText(rawOutput)}
              >
                <span className="material-symbols-outlined text-[13px]">content_copy</span>
                Copy (1)
              </button>
            </div>
            <div className="w-full h-full flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-md p-md text-on-surface font-body-md overflow-auto">
              {rawOutput.trim() ? (
                <div className="text-on-surface [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-1 [&_ol]:mb-3 [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{rawOutput}</ReactMarkdown>
                </div>
              ) : (
                <p className="m-0 text-on-surface-variant/50">
                  Transcript will appear here.
                </p>
              )}
            </div>
          </article>

          <article className="bg-surface-container rounded-lg p-md border border-outline-variant/50 shadow-sm flex flex-col h-full min-h-[300px]">
            <div className="flex justify-between items-center mb-sm">
              <h3 className="font-label-md text-on-surface">
                {outputMode === "prompt" ? "Structured Output" : "Grammar Corrected"}
              </h3>
              <button
                type="button"
                className="text-primary hover:text-primary/80 text-sm font-medium tracking-normal inline-flex items-center gap-xs transition-colors"
                onClick={() => void copyText(correctedOutput)}
              >
                <span className="material-symbols-outlined text-[13px]">content_copy</span>
                Copy (2)
              </button>
            </div>
            <div className="w-full h-full flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-md p-md text-on-surface font-body-md overflow-auto">
              {correctedOutput.trim() && applyGrammarCorrection ? (
                <div className="text-on-surface [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-1 [&_ol]:mb-3 [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{correctedOutput}</ReactMarkdown>
                </div>
              ) : (
                <p className="m-0 text-on-surface-variant/50">
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
        className={`pointer-events-none fixed bottom-5 right-5 rounded-lg bg-surface-container-highest px-md py-sm text-sm text-on-surface transition border border-outline-variant/30 ${
          toastVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {toastMessage}
      </div>
    </>
  );
}
