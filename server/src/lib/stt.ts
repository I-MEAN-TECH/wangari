/**
 * Speech-to-text backend (pluggable).
 *
 * The default implementation is a no-op: it returns an empty string
 * with a "no provider configured" reason. This ships the pipeline
 * (recorder -> upload -> transcribe -> composer) without committing
 * to a paid STT provider; the operator can plug Whisper, Google
 * Speech-to-Text, or Deepgram in by setting the env vars and
 * replacing the function body. The route, the frontend, and the
 * contract do not change.
 *
 * Why a stub today: every real STT provider is a paid API and a
 * per-minute cost the operator has to approve. The chat panel's
 * mic button works end-to-end against this stub; pressing it and
 * recording produces an empty transcription with a clear reason
 * the client can surface ("Voice transcription is not configured
 * yet. Type your message instead.").
 */

export interface AudioInput {
  /** MIME type from the recorder. webm/opus and mp4/aac are the two browser-side defaults. */
  mimeType: string;
  /** Size of the encoded audio in bytes. */
  size: number;
  /** Duration in milliseconds (reported by the recorder; trusted only as a hint). */
  durationMs: number;
  /** The raw bytes. */
  data: Buffer;
}

export interface TranscribeResult {
  /** The transcribed text. Empty when no transcription was produced. */
  text: string;
  /** Diagnostic string for client telemetry. */
  reason: string;
  /** Provider that produced the result. "stub" when no provider is configured. */
  provider: "stub" | "whisper" | "google" | "deepgram" | string;
}

/** The hard limits. Larger files are almost certainly an abuse vector or a bug. */
const MIN_BYTES = 200;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_DURATION_MS = 250;
const MAX_DURATION_MS = 60_000; // 60s — a chat question, not a podcast
const SUPPORTED_MIME = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

/**
 * Validate first. A 200-byte blob, a 70-second blob, and a 12MB blob are
 * all wrong for a "tell me about my farm" question. Failing fast here
 * keeps a no-op provider from accidentally logging a farmer's audio.
 */
function validate(input: AudioInput): { ok: true } | { ok: false; reason: string } {
  if (!SUPPORTED_MIME.has(input.mimeType.toLowerCase())) {
    return { ok: false, reason: `Unsupported audio type: ${input.mimeType}` };
  }
  if (input.size < MIN_BYTES) {
    return { ok: false, reason: "Audio too short or silent" };
  }
  if (input.size > MAX_BYTES) {
    return { ok: false, reason: "Audio file is too large (over 10MB)" };
  }
  if (input.durationMs < MIN_DURATION_MS) {
    return { ok: false, reason: "Recording is under a quarter of a second" };
  }
  if (input.durationMs > MAX_DURATION_MS) {
    return { ok: false, reason: "Recording is over 60 seconds" };
  }
  return { ok: true };
}

/**
 * The single public function. The body is the stub; the route layer
 * does not care, and a future real provider (Whisper / Google /
 * Deepgram) replaces ONLY this body.
 */
export async function transcribeAudio(input: AudioInput): Promise<TranscribeResult> {
  const v = validate(input);
  if (!v.ok) {
    return { text: "", reason: v.reason, provider: "stub" };
  }
  // ── Plug a real STT provider here when ready. ──
  // The contract is: return { text, reason, provider } where
  //   - `text` is the transcription, "" if the provider had no result
  //   - `reason` is a short human-readable string for client telemetry
  //   - `provider` is the id of the provider that produced the result
  //
  // Until then, the no-op stub is the correct answer. The user pressed
  // the mic, the bytes got here, and the system is honest: voice
  // transcription is not configured yet. A fake response that
  // pretends to work would be worse.
  return {
    text: "",
    reason: "Voice transcription is not configured yet. Set STT_PROVIDER and the matching API key to enable it.",
    provider: "stub",
  };
}
