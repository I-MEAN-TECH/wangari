import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { transcribeAudio, type AudioInput } from "../lib/stt.js";

/**
 * /api/ai/transcribe — voice input for the AI chat composer.
 *
 * The client records audio in the browser (MediaRecorder API), encodes
 * the resulting Blob to base64, and POSTs it as JSON:
 *   { mimeType, durationMs, data: "<base64>" }
 *
 * The server validates, then calls the pluggable transcribeAudio()
 * (default: a no-op stub). When the operator wires a real STT provider
 * (Whisper, Google STT, Deepgram) into lib/stt.ts, this route does not
 * change. The contract is fixed: POST JSON in, get { text, reason }
 * JSON out. text is empty when no provider is configured; reason
 * tells the client why so the composer can show "Voice transcription
 * is not configured yet".
 *
 * Read-only on Free Core: the audio is never used to write anything.
 * The transcribed text goes into the composer, and the composer
 * itself runs the same AI gate as a typed message.
 */

const router = Router();
router.use(authMiddleware);

const MAX_BASE64_CHARS = 14_000_000; // ~10MB binary = 13.3MB base64

router.post("/", async (req: Request, res: Response) => {
  try {
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
    const durationMs = Number(req.body?.durationMs);
    const dataB64 = typeof req.body?.data === "string" ? req.body.data : "";

    if (!mimeType || !dataB64) {
      return res.status(400).json({ error: "mimeType and data required" });
    }
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return res.status(400).json({ error: "durationMs must be a non-negative number" });
    }
    if (dataB64.length > MAX_BASE64_CHARS) {
      return res.status(413).json({ error: "Audio too large (over 10MB)" });
    }

    const data = Buffer.from(dataB64, "base64");
    if (data.length === 0) {
      return res.status(400).json({ error: "Audio data is empty" });
    }

    const input: AudioInput = { mimeType, size: data.length, durationMs, data };
    const r = await transcribeAudio(input);

    // Best-effort audit: an audio transcription request is interesting
    // telemetry, but no farmer PII (the audio is discarded).
    prisma.auditLog.create({
      data: {
        farmId: req.user?.farmId ?? 0,
        userId: req.user?.userId ?? null,
        action: "ai_transcribe",
        entityType: "ai",
        details: {
          mimeType,
          size: data.length,
          durationMs,
          provider: r.provider,
          reason: r.reason,
        },
      },
    }).catch(() => {});

    return res.json({ text: r.text, reason: r.reason, provider: r.provider });
  } catch (e: any) {
    console.error("Transcribe error:", e);
    return res.status(500).json({ error: "Transcription failed" });
  }
});

// Late-bind prisma so the import graph stays clean.
import { prisma } from "../db.js";

export default router;
