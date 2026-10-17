import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  transcribeAudio,
  type AudioInput,
  type TranscribeResult,
} from "../lib/stt.js";

/**
 * Speech-to-text backend (pluggable).
 *
 * The route /api/ai/transcribe takes an audio upload from the chat
 * composer and returns { text }. The actual STT provider is pluggable
 * behind the `transcribeAudio` function — the default is a no-op that
 * returns an empty string, so the architecture is right and a real
 * provider (Whisper, Google STT, Deepgram) can be wired later without
 * changing any caller.
 *
 * Why a stub today: the user has not picked an STT provider. Picking
 * one commits to a paid API and a per-minute cost. The right move is
 * to ship the pipeline (recording -> upload -> transcribe -> insert
 * into composer) with a known-empty backend, then plug a provider in
 * once the operator has a preference and a key.
 */

describe("transcribeAudio (default no-op stub)", () => {
  it("returns a TranscribeResult with an empty text and a 'no provider' reason", async () => {
    const input: AudioInput = {
      mimeType: "audio/webm",
      size: 12_345,
      durationMs: 2_500,
      data: Buffer.from([1, 2, 3, 4, 5]),
    };
    const r = await transcribeAudio(input);
    expect(r).toBeDefined();
    expect(typeof r.text).toBe("string");
    expect(r.text).toBe("");
    expect(r.reason).toMatch(/provider|not configured|stub/i);
  });

  it("rejects audio that is too small (under 200 bytes is silence)", async () => {
    const tiny: AudioInput = {
      mimeType: "audio/webm",
      size: 50,
      durationMs: 200,
      data: Buffer.from([0]),
    };
    const r = await transcribeAudio(tiny);
    expect(r.text).toBe("");
    expect(r.reason).toMatch(/silent|too small|short/i);
  });

  it("rejects audio that exceeds the 60s ceiling", async () => {
    const huge: AudioInput = {
      mimeType: "audio/webm",
      size: 5_000_000,
      durationMs: 70_000,
      data: Buffer.alloc(1024),
    };
    const r = await transcribeAudio(huge);
    expect(r.text).toBe("");
    expect(r.reason).toMatch(/too long|over|limit/i);
  });

  it("rejects a size over 10MB (a 1-minute webm is <300KB)", async () => {
    const big: AudioInput = {
      mimeType: "audio/webm",
      size: 11_000_000,
      durationMs: 60_000,
      data: Buffer.alloc(2048),
    };
    const r = await transcribeAudio(big);
    expect(r.text).toBe("");
    expect(r.reason).toMatch(/large|size|over/i);
  });

  it("rejects unsupported mime types", async () => {
    const wrong: AudioInput = {
      mimeType: "audio/x-foo",
      size: 5_000,
      durationMs: 2_000,
      data: Buffer.alloc(1024),
    };
    const r = await transcribeAudio(wrong);
    expect(r.text).toBe("");
    expect(r.reason).toMatch(/type|format|supported/i);
  });
});

describe("the transcribe route exists and validates input", () => {
  const route = readFileSync(
    join(process.cwd(), "src", "routes", "ai-transcribe.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("mounts a POST route", () => {
    expect(route).toMatch(/router\.post\(/);
  });

  it("imports transcribeAudio from the lib", () => {
    expect(route).toMatch(/transcribeAudio/);
  });

  it("returns 400 when no audio is attached", () => {
    expect(route).toMatch(/400/);
  });

  it("returns the transcribed text in {text} plus {reason} for client telemetry", () => {
    expect(route).toMatch(/text:\s*r\.text/);
  });

  it("uses JSON body with base64-encoded audio (no extra dep needed)", () => {
    // The client records in the browser, encodes the Blob to base64, and
    // POSTs JSON. A multipart upload would need a parser dep; base64 in
    // JSON works with Express's built-in body parser. 10MB audio in
    // base64 is ~13MB JSON — under most default request body limits.
    expect(route).toMatch(/Buffer\.from\(/);
    expect(route).toMatch(/["']base64["']/);
  });
});
