"use client";

/**
 * Voice recorder chip for the AI chat composer.
 *
 * The recorder uses the browser's MediaRecorder API to capture audio,
 * converts the resulting Blob to base64, and POSTs it to the backend's
 * /api/ai/transcribe. The backend returns { text, reason, provider }.
 * On success, the text is piped into the composer's input. On failure
 * (no STT provider configured yet, or the user revoked the mic), the
 * reason is shown as a tooltip.
 *
 * Why a separate component: chat-panel.tsx is the busiest file in the
 * AI surface; keeping the recorder here means the recording state and
 * the MediaRecorder instance are scoped to a single button. The
 * composer only knows about a string of text the user wants to send.
 *
 * The backend is currently a no-op stub (lib/stt.ts) — pressing the
 * button, recording, and stopping produces an empty transcription
 * with a clear reason. The component still works end-to-end, so the
 * next step is just plugging an STT provider into the backend.
 */

import * as React from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "idle" | "permission" | "recording" | "uploading" | "error";

const MAX_DURATION_MS = 60_000;

export function VoiceRecorder({
  onTranscript,
  className = "",
}: {
  /** Called with the transcribed text. Empty string = no transcription. */
  onTranscript: (text: string) => void;
  className?: string;
}) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef<number>(0);
  const watchRef = React.useRef<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  const isRecording = status === "recording";
  const isBusy = status === "uploading" || status === "permission";

  const stop = React.useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    rec.stop();
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("This device does not support voice recording.");
      return;
    }
    setStatus("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // webm/opus is the standard MediaRecorder mime on Chrome/Firefox/Edge.
      // Safari prefers mp4/aac. The server's supported list is in lib/stt.ts.
      const preferred = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: preferred });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        // Hard 60s ceiling — stop ourselves if the user kept the mic open.
        stream.getTracks().forEach((t) => t.stop());
        if (watchRef.current) {
          clearInterval(watchRef.current);
          watchRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: preferred });
        const duration = Date.now() - startedAtRef.current;
        setStatus("uploading");
        try {
          const dataB64 = await blobToBase64(blob);
          // The AI page uses streamAI, not the api-client; this fetch matches
          // the auth pattern of the rest of the AI surface (cookie-based JWT).
          const res = await fetch("/api/ai/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              mimeType: preferred,
              durationMs: duration,
              data: dataB64,
            }),
          });
          if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
          const r = await res.json().catch(() => ({}));
          const text = typeof r?.text === "string" ? r.text : "";
          const reason = typeof r?.reason === "string" ? r.reason : "Transcription failed.";
          if (text) onTranscript(text);
          else {
            setStatus("error");
            setError(reason);
          }
        } catch (e: any) {
          setStatus("error");
          setError(e?.message || "Could not upload audio.");
        } finally {
          if (status !== "error") setStatus("idle");
        }
      };
      rec.start(250); // chunk every 250ms so we don't lose the tail on a crash
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");
      // Watchdog: stop at the 60s ceiling. A chat question, not a podcast.
      watchRef.current = window.setInterval(() => {
        const e = Date.now() - startedAtRef.current;
        setElapsed(Math.floor(e / 1000));
        if (e >= MAX_DURATION_MS) {
          stop();
        }
      }, 250) as unknown as number;
    } catch (e: any) {
      setStatus("error");
      setError(e?.message || "Microphone access was denied.");
    }
  }, [onTranscript, status, stop]);

  const toggle = React.useCallback(() => {
    if (isBusy) return;
    if (isRecording) stop();
    else start();
  }, [isBusy, isRecording, start, stop]);

  // Clean up on unmount.
  React.useEffect(() => {
    return () => {
      if (watchRef.current) clearInterval(watchRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stream?.getTracks().forEach((t) => t.stop());
        rec.stop();
      }
    };
  }, []);

  const Icon = isBusy ? Loader2 : isRecording ? MicOff : Mic;
  const label = isRecording
    ? `Stop recording (${elapsed}s / 60s)`
    : isBusy
    ? "Sending…"
    : "Record a question";
  const tip = error
    ? error
    : isRecording
    ? "Tap to stop. Voice transcription is read-only on Free Core."
    : "Tap to record a question for the assistant (up to 60s).";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isBusy}
      aria-label={label}
      title={tip}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl border transition-all",
        isRecording
          ? "border-wangari-coral-300 bg-wangari-coral-50 text-wangari-coral-700 animate-pulse"
          : status === "error"
          ? "border-wangari-red-200 bg-wangari-red-50 text-wangari-red-700"
          : "border-wangari-green-200 bg-wangari-green-50 text-wangari-green-800 hover:bg-wangari-green-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wangari-green-500/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <Icon className={cn("h-5 w-5", isBusy && "animate-spin")} />
    </button>
  );
}

/** Convert a Blob to base64 (without the data: URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is "data:audio/webm;base64,XXXX". Strip the prefix.
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export default VoiceRecorder;
