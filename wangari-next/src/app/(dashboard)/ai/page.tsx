"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Mic, Undo2, History } from "lucide-react";
import { ChatPanel, type Turn } from "@/components/ai/chat-panel";
import ConversationList from "@/components/ai/conversation-list";
import {
  saveConversation,
  getConversation,
  newConversationId,
} from "@/lib/ai-conversations";
import type { QuickAction } from "@/components/ai/quick-actions";
import { WangariMark } from "@/components/ai/wangari-mark";
import type { AgentActivity, AgentStep } from "@/components/ai/agent-presence";
import { streamAI, type WireMessage, type StreamEvent } from "@/lib/ai-stream";
import { setPresence, clearPresence, type Presence } from "@/lib/wangari-presence";
import { caretGaze } from "@/lib/caret-gaze";
import { TypingTracker } from "@/lib/typing-signal";

export default function AIAssistantPage() {
  /* ── which conversation is on screen ──────────────────────
     The panel on the left and the chat in the middle are two views of one
     thing, so they share a single id. Without it "new chat" would clear the
     screen but leave the farmer editing a row they are no longer looking
     at, and the next message would land in the old conversation. */
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [listOpen, setListOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [steps, setSteps] = React.useState<AgentStep[]>([]);
  const [pending, setPending] = React.useState<{ tool: string }[]>([]);
  const [activity, setActivity] = React.useState<AgentActivity>("idle");
  /**
   * Seconds the server is about to wait out the provider's free-tier limit,
   * or null when it is not waiting. Lives here rather than inside the panel
   * because it is stream state, not presentation state - the panel only ever
   * needs to render whatever the last event said.
   */
  const [waitSeconds, setWaitSeconds] = React.useState<number | null>(null);
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

  /* ── save as the farmer talks, not on the way out ─────────
     Closing the tab, a crash, or the phone running out of battery all skip
     an unmount handler. Saving on every settled change means the last answer
     is already on the phone before they close anything. */
  React.useEffect(() => {
    if (!conversationId) return;
    if (!turns.some((t) => t.content.trim())) return;
    if (turns.some((t) => t.streaming)) return;
    saveConversation(conversationId, turns);
  }, [turns, conversationId]);

  const startNew = React.useCallback(() => {
    // The previous conversation is already saved by the effect above, so
    // starting a new one cannot lose it.
    setConversationId(newConversationId());
    setTurns([]);
    setSteps([]);
    setPending([]);
    setError(undefined);
    setValue("");
    setListOpen(false);
  }, []);

  const openConversation = React.useCallback((id: string) => {
    const found = getConversation(id);
    setConversationId(id);
    setTurns(found ? found.turns : []);
    setSteps([]);
    setPending([]);
    setError(undefined);
    setListOpen(false);
  }, []);

  /* ── one agent run ──────────────────────────────────────────
     Each server event mutates the SAME assistant turn rather than appending
     a new one per event. A streaming reply is one bubble filling in; making
     a bubble per token produces a hundred single-word messages. */
  const run = React.useCallback(async (history: WireMessage[], prompt: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    /* The conversation is created HERE, not in the callers.

       run() has three doors: typing and sending, tapping a quick-action
       chip, and retry. Guarding only the first meant a farmer whose very
       first action was tapping "Record eggs" got no conversation at all, so
       nothing was ever written and their work vanished the moment they
       closed the app - the exact failure this feature exists to prevent,
       hiding behind a feature that was supposed to fix it.

       The functional updater needs no dependency, so run stays stable. */
    setConversationId((id) => id ?? newConversationId());

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
    setWaitSeconds(null);

    const next = [...history, { role: "user" as const, content: prompt }];

    await streamAI(
      next,
      (e: StreamEvent) => {
        switch (e.type) {
          case "start":
            setActivity("reasoning");
            setWaitSeconds(null);
            break;

          case "message":
            // First token: she is answering, no longer just thinking.
            setActivity((a) => (a === "reasoning" ? "speaking" : a));
            setWaitSeconds(null);
            setTurns((t) =>
              t.map((turn) =>
                turn.id === botId
                  ? { ...turn, content: turn.content + e.content, streaming: true }
                  : turn,
              ),
            );
            break;

          case "waiting":
            /* The provider's free tier is holding the next call. Keep the
               thinking animation and say how long, because the alternative -
               a silent avatar for a minute - reads as a crashed app, and
               farmers do not wait a minute to find out. */
            setActivity("waiting");
            setWaitSeconds(e.seconds);
            break;

          case "tool_start":
            setActivity("working");
            setWaitSeconds(null);
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
                      error: turn.error ? turn.error : e.message,
                      content: turn.content,
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

  const router = useRouter();

  /* ── a chip was tapped ─────────────────────────────────
     Sends straight away rather than filling the box: a farmer who has to
     press send as well has been asked for two decisions when they made one,
     and most of them will not press the second. Exactly one request is spent
     either way, and the phrasing is known to reach the right tool. */
  const quickSend = React.useCallback(
    async (action: QuickAction) => {
      if (running) return;
      const history = turns
        .filter((t) => t.content.trim())
        .map((t) => ({ role: t.role, content: t.content }));
      tracker.current.reset();
      setPace(0);
      setValue("");
      await run(history, action.prompt);
    },
    [turns, running, run],
  );

  const hasText = value.trim().length > 0;

  /* ── tell the rest of the app what she is doing ────────────
     Her face is now the module's icon and sits at the top of the
     Home screen, but the run happens on THIS page. Without this the
     farmer taps the module, sees her mid-task in the panel, and the
     icon beside it sitting still — which teaches them the face is
     decoration. One published state, every surface agrees.

     Typing counts as a state of its own: a farmer watching the icon
     while she works should see her looking down and patient at their
     words, not idle. */
  React.useEffect(() => {
    const next: Presence = running
      ? activity === "done"
        ? "idle"
        : activity
      : hasText
        ? "typing"
        : "idle";
    setPresence(next);
  }, [activity, running, hasText]);

  // Leaving the page must not strand her mid-thought on the icon.
  React.useEffect(() => () => clearPresence(), []);

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
    /* One pill, the way Gemini's is: the field and the send button share a
       single rounded surface, so there is one object to look at rather than a
       text box floating beside two buttons. */
    <div className="flex items-end gap-1.5 rounded-3xl border border-wangari-border bg-wangari-cream/60 p-1.5 pl-4 transition-colors focus-within:border-wangari-subtle focus-within:bg-white">
      <label htmlFor="ask-wangari" className="sr-only">
        Ask Wangari to do something on your farm
      </label>
      <textarea
        id="ask-wangari"
        value={value}
        onChange={onChange}
        rows={1}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter is a newline — the convention every
          // chat UI uses, so nobody has to learn ours.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Tell Wangari what to do…"
        className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-base text-wangari-heading placeholder:text-wangari-subtle focus:outline-none"
      />
      {/* Voice is the intended primary path (§0 R1) but the recorder is not
          built. It stays visible so the promise stays visible, and it is
          honestly disabled rather than a control that silently does nothing.
          No copy tells anyone to tap it. */}
      <button
        type="button"
        aria-label="Speak to Wangari"
        disabled
        title="Voice input is not built yet"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-wangari-subtle"
      >
        <Mic className="h-5 w-5" aria-hidden />
      </button>
      {/* Solid and unmistakable when armed. The old version was a pale green
          that read as broken rather than disabled — on a screen whose only
          job is one button, "looks broken" is the wrong thing to say. */}
      <button
        type="button"
        aria-label="Send to Wangari"
        onClick={() => void send()}
        disabled={!hasText || running}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-wangari-green-600 text-white shadow-sm transition-all hover:bg-wangari-green-700 active:scale-95 disabled:bg-wangari-border disabled:text-wangari-subtle disabled:shadow-none"
      >
        <Send className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );

  return (
    /* The page itself NEVER scrolls — measured off Gemini's live DOM, where
       body.scrollHeight always equals the viewport height. Exactly one
       element scrolls (the message list inside ChatPanel) and the composer is
       pinned by flex, so it can never drift over a message the way a
       position:fixed bar does on a long answer. */
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-wangari-cream">
      {/* ── the conversation list ────────────────────────────
          A rail on a wide screen, a sheet on a phone. It is hidden until it
          is asked for on small screens because the chat is what the farmer
          came here for, and a panel that is already open on a 390px phone
          leaves nothing to read. */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 md:block">
          <ConversationList
            activeId={conversationId}
            onOpen={openConversation}
            onNew={startNew}
          />
        </aside>
        {listOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div className="w-[85%] max-w-xs shadow-xl">
              <ConversationList
                activeId={conversationId}
                onOpen={openConversation}
                onNew={startNew}
                onClose={() => setListOpen(false)}
              />
            </div>
            <button
              aria-label="Close the conversation list"
              onClick={() => setListOpen(false)}
              className="flex-1 bg-black/30"
            />
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-wangari-border bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[768px] items-center gap-2.5 px-3 py-2.5">
          <button
            onClick={() => router.push("/dashboard")}
            aria-label="Back to your farm"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-wangari-muted transition-colors hover:bg-wangari-green-50 hover:text-wangari-green-800"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>

          {/* Only on a phone: on a wide screen the rail is already open and
              this would be a second way to do the same thing. */}
          <button
            onClick={() => setListOpen(true)}
            aria-label="Past conversations"
            aria-expanded={listOpen}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-wangari-muted transition-colors hover:bg-wangari-green-50 hover:text-wangari-green-800 md:hidden"
          >
            <History className="h-5 w-5" aria-hidden />
          </button>

          <WangariMark size={34} />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold leading-tight text-wangari-heading">
              Wangari
            </h1>
            <p className="truncate text-[11px] text-wangari-muted">
              Your farm assistant
            </p>
          </div>

          {/* Undo sits in the header rather than floating, so it is always in
              the same place. A misheard instruction must be reversible in one
              tap, not confirmed in a dialog. */}
          <button
            onClick={() => void retry()}
            disabled={running || !turns.some((t) => t.role === "user")}
            aria-label="Undo the last thing Wangari did"
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-wangari-green-50 px-3 text-xs font-bold text-wangari-green-800 transition-colors hover:bg-wangari-green-100 disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Undo</span>
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <ChatPanel
          turns={turns}
          pending={pending}
          steps={steps}
          running={running}
          offline={offline}
          error={error}
          onSend={() => void send()}
          onStop={stop}
          onRetry={retry}
          onQuickAction={(a) => void quickSend(a)}
          composer={composer}
          gaze={gaze}
          pace={pace}
          wordTick={wordTick.current}
          waitSeconds={waitSeconds}
        />
      </main>
        </div>
      </div>
    </div>
  );
}
