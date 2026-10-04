"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Send, Mic, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChatPanel, type Turn } from "@/components/ai/chat-panel";
import type { AgentActivity, AgentStep } from "@/components/ai/agent-presence";
import { streamAI, type WireMessage, type StreamEvent } from "@/lib/ai-stream";
import { caretGaze } from "@/lib/caret-gaze";
import { TypingTracker } from "@/lib/typing-signal";

export default function AIAssistantPage() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [steps, setSteps] = React.useState<AgentStep[]>([]);
  const [pending, setPending] = React.useState<{ tool: string }[]>([]);
  const [activity, setActivity] = React.useState<AgentActivity>("idle");
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [offline, setOffline] = React.useState(false);
  const [value, setValue] = React.useState("");

  // Caret gaze and typing pace feed the avatar's eyes. WangariAgent
  // receives them; see components/ai/agent-presence.tsx.
  const [gaze, setGaze] = React.useState<{ x: number; y: number } | undefined>();
  const [pace, setPace] = React.useState(0);

  const tracker = React.useRef(new TypingTracker());
  const wordTick = React.useRef(0);
  const fontSize = React.useRef(16);
  const fontSizeRead = React.useRef(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const idRef = React.useRef(0);

  /* ── offline awareness ─────────────────────────────────────
     Wangari must not look broken when the network is simply gone. The
     panel says so plainly instead of failing a request the farmer cannot
     see the reason for. */
  React.useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  /* ── one agent run ──────────────────────────────────────────
     Each server event mutates the SAME assistant turn rather than appending
     a new one per event. A streaming reply is one bubble filling in; making
     a bubble per token produces a hundred single-word messages. */
  const run = React.useCallback(async (history: WireMessage[], prompt: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const userId = `u${++idRef.current}`;
    const botId = `a${++idRef.current}`;
    setTurns((t) => [
      ...t,
      { id: userId, role: "user", content: prompt },
      { id: botId, role: "assistant", content: "", streaming: true },
    ]);
    setRunning(true);
    setError(undefined);
    setSteps([]);
    setPending([]);
    setActivity("reasoning");

    const next = [...history, { role: "user" as const, content: prompt }];

    await streamAI(
      next,
      (e: StreamEvent) => {
        switch (e.type) {
          case "start":
            setActivity("reasoning");
            break;

          case "message":
            // First token: she is answering, no longer just thinking.
            setActivity((a) => (a === "reasoning" ? "speaking" : a));
            setTurns((t) =>
              t.map((turn) =>
                turn.id === botId
                  ? { ...turn, content: turn.content + e.content, streaming: true }
                  : turn,
              ),
            );
            break;

          case "tool_start":
            setActivity("working");
            setPending((p) => [...p, { tool: e.tool }]);
            break;

          case "tool_end":
            setPending((p) => {
              // Drop the FIRST match, not any match: a second step with the
              // same tool name is a different step and must keep its spinner.
              const i = p.findIndex((x) => x.tool === e.tool);
              return i >= 0 ? [...p.slice(0, i), ...p.slice(i + 1)] : p;
            });
            setSteps((s) => [
              ...s,
              { tool: e.tool, ok: e.ok, result: e.result, error: e.error },
            ]);
            break;

          case "done":
            setActivity(e.steps > 0 ? "done" : "idle");
            break;

          case "error":
            setTurns((t) =>
              t.map((turn) =>
                turn.id === botId
                  ? {
                      ...turn,
                      streaming: false,
                      error: turn.content ? undefined : e.message,
                      // An empty bubble would render as a blank gap; say
                      // the thing instead of showing nothing.
                      content: turn.content || e.message,
                    }
                  : turn,
              ),
            );
            setError(e.message);
            setActivity("error");
            break;
        }
      },
      ac.signal,
    );

    setRunning(false);
    setPending([]);
    setTurns((t) => t.map((turn) => (turn.id === botId ? { ...turn, streaming: false } : turn)));
  }, []);

  const send = React.useCallback(async () => {
    const prompt = value.trim();
    if (!prompt || running) return;

    // History is rebuilt from the visible conversation, excluding the empty
    // assistant bubble that is about to be replaced.
    const history: WireMessage[] = turns
      .filter((t) => t.content.trim())
      .map((t) => ({ role: t.role, content: t.content }));

    setValue("");
    tracker.current.reset();
    setPace(0);
    await run(history, prompt);
  }, [value, running, turns, run]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    const text = el.value;
    setValue(text);
    if (!fontSizeRead.current) {
      fontSizeRead.current = true;
      fontSize.current = parseFloat(window.getComputedStyle(el).fontSize) || 16;
    }
    // WangariAgent reads these; see components/ai/agent-presence.tsx.
    setGaze(caretGaze({ ...el, fontSize: fontSize.current, clientWidth: el.clientWidth }));

    const delta = text.length - tracker.current.textLength;
    const signal =
      Math.abs(delta) === 1
        ? tracker.current.keystroke(performance.now(), text)
        : tracker.current.edit(text);
    setPace(signal.pace);
    if (signal.completedWord) wordTick.current += 1;
    if (!text.trim()) {
      tracker.current.reset();
      setGaze(undefined);
      setPace(0);
    }
  };

  const hasText = value.trim().length > 0;
  React.useEffect(() => {
    if (!hasText) return;
    const id = window.setInterval(() => {
      const p = tracker.current.paceAt(performance.now());
      setPace((prev) => (Math.abs(prev - p) < 0.02 ? prev : p));
    }, 120);
    return () => window.clearInterval(id);
  }, [hasText]);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setPending([]);
    setActivity("idle");
    setTurns((t) => t.map((turn) => (turn.streaming ? { ...turn, streaming: false } : turn)));
  };

  const retry = () => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser) return;
    const history = turns
      .filter((t) => t.content.trim() && t.id !== lastUser.id)
      .map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => t.filter((x) => x.id !== lastUser.id));
    run(history, lastUser.content);
  };

  const composer = (
    <div className="flex items-end gap-2">
      <label htmlFor="ask-wangari" className="sr-only">
        Ask Wangari to do something on your farm
      </label>
      <textarea
        id="ask-wangari"
        value={value}
        onChange={onChange}
        rows={2}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter is a newline — the convention every
          // chat UI uses, so nobody has to learn ours.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="e.g. Record 200 eggs from flock 1 today"
        className="flex-1 resize-none rounded-2xl border border-wangari-border bg-wangari-cream px-4 py-3 text-base text-wangari-heading placeholder:text-wangari-subtle focus:outline-none focus:border-wangari-green-500 focus:ring-2 focus:ring-wangari-green-500/20"
      />
      {/* Voice is the intended primary path (§0 R1). The button is present
          and correctly sized; the recorder itself is not built yet, so it
          is disabled rather than a control that silently does nothing. */}
      <Button
        type="button"
        aria-label="Speak to Wangari"
        disabled
        title="Voice input is not built yet"
        className="h-12 w-12 shrink-0 rounded-2xl bg-gray-100 text-gray-400"
      >
        <Mic className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        aria-label="Send to Wangari"
        onClick={() => void send()}
        disabled={!hasText || running}
        className="h-12 w-12 shrink-0 rounded-2xl bg-wangari-green-600 text-white touch-target disabled:opacity-40"
      >
        <Send className="h-5 w-5" />
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="touch-target flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-wangari-heading">
            Wangari AI Assistant
          </h1>
          <p className="mt-0.5 text-xs text-wangari-muted">
            Tell Wangari what you need. It works on your farm records.
          </p>
        </div>
        {/* Undo over confirm: a misheard instruction must be reversible in
            one tap, not confirmed in a dialog. */}
        <button
          onClick={() => void retry()}
          disabled={running || !turns.some((t) => t.role === "user")}
          aria-label="Undo the last thing Wangari did"
          className="touch-target ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 disabled:opacity-40"
        >
          <Undo2 className="h-5 w-5" />
        </button>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-wangari-border bg-wangari-card">
        <CardContent className="p-0">
          <ChatPanel
            turns={turns}
            pending={pending}
            activity={activity}
            steps={steps}
            running={running}
            offline={offline}
            error={error}
            onSend={() => void send()}
            onStop={stop}
            onRetry={retry}
            composer={composer}
            gaze={gaze}
            pace={pace}
            wordTick={wordTick.current}
          />
        </CardContent>
      </Card>
    </div>
  );
}
