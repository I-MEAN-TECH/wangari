/**
 * The "she is still here" indicator, rendered.
 *
 * This exists because the thing being replaced was a bare green dot. The
 * request was for Wangari's actual face at a small size, running the same
 * animation, with a word beside it — and a request like that can be satisfied
 * on paper and still ship as a grey circle, because nothing here renders the
 * panel.
 *
 * Rendered with renderToStaticMarkup: no DOM, which is what the `node`
 * vitest environment gives us.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ChatPanel } from "./chat-panel";
import { type Presence } from "@/lib/wangari-presence";

const TURN = { id: "1", role: "user" as const, content: "add 200 sasso layers" };

function render(props: { running?: boolean; turns?: any[]; presenceOverride?: Presence; waitSeconds?: number | null } = {}) {
  return renderToStaticMarkup(
    createElement(ChatPanel, {
      turns: [TURN],
      pending: [],
      steps: [],
      running: true,
      offline: false,
      onSend: () => {},
      onStop: () => {},
      onRetry: () => {},
      onQuickAction: () => {},
      composer: createElement("textarea", null),
      ...props,
    } as Parameters<typeof ChatPanel>[0]),
  );
}

describe("the thinking indicator", () => {
  it("shows Wangari's face and the state word while she works", () => {
    const html = render({ running: true, presenceOverride: "working" });
    // Her avatar, not a coloured circle: the mark carries the same animation
    // classes the header and the module icon use.
    expect(html).toContain("wangari-avatar");
    expect(html).toContain(">Working</span>");
    expect(html).toContain("width:26px");
    expect(html).toContain('role="status"');
  });

  it("says Thinking, then Answering, as the state changes", () => {
    expect(render({ presenceOverride: "reasoning" })).toContain(">Thinking</span>");
    expect(render({ presenceOverride: "speaking" })).toContain(">Answering</span>");
  });

  it("disappears the moment she stops", () => {
    // A face left floating under the last message after the run ends reads
    // as a stuck spinner, which is worse than never showing one.
    expect(render({ presenceOverride: "working" })).toContain(">Working</span>");
    expect(render({ running: false, presenceOverride: "working" })).not.toContain(">Working</span>");
  });

  it("does not reappear in the empty state", () => {
    // The empty state is its own onboarding: the hero face and the chips.
    // A second indicator on top of that is two faces saying the same thing.
    const html = render({ turns: [], running: true, presenceOverride: "working" });
    expect(html).toContain("Ask Wangari about your farm");
    expect(html).not.toContain(">Working<");
  });
});
/**
 * The rate-limit wait, rendered.
 *
 * The helper can be perfect and the panel still show nothing, so this asserts
 * the markup. It matters because of the shape of the problem: the provider's
 * free tier allows one request a minute, an agentic farm turn spends two, and
 * a measured 84-second turn was silent for almost all of it. A farmer who
 * thinks the app has frozen does not wait for the answer.
 */
describe("the provider's minute, rendered", () => {
  it("says Waiting with the server's countdown", () => {
    const html = render({ running: true, presenceOverride: "waiting", waitSeconds: 45 });
    expect(html).toContain("Waiting — about 45s");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("still shows her face, still animating, while she waits", () => {
    const html = render({ running: true, presenceOverride: "waiting", waitSeconds: 45 });
    expect(html).toContain("wangari-avatar");
    expect(html).toContain("width:26px");
  });

  it("says Waiting rather than nothing when no countdown has arrived", () => {
    // The `waiting` event can land before the number, and opensAt is null
    // when the server has never had a call succeed. Falling back to the
    // longer "Waiting for a free slot" is the point: an empty indicator here
    // is the exact freeze this replaced, and the longer line still names the
    // cause without promising a time we do not control.
    for (const props of [{ presenceOverride: "waiting" as const }, { presenceOverride: "waiting" as const, waitSeconds: 0 }]) {
      const html = render(props);
      // Assert on the status element itself. A blanket "no empty span" regex
      // matches the decorative aria-hidden wrappers everywhere else in the
      // panel and would fail for reasons that have nothing to do with this.
      expect(html).toMatch(/role="status" aria-live="polite">Waiting for a free slot<\/span>/);
    }
  });

  it("goes back to the ordinary verbs the moment work resumes", () => {
    expect(render({ presenceOverride: "working" })).toContain(">Working</span>");
    expect(render({ presenceOverride: "speaking" })).toContain(">Answering</span>");
    // And the stale countdown must not survive into either of them.
    expect(render({ presenceOverride: "speaking", waitSeconds: 45 })).not.toContain("Waiting");
  });

  it("disappears when the run ends", () => {
    expect(render({ running: false, presenceOverride: "waiting", waitSeconds: 45 })).not.toContain("Waiting");
  });
});
