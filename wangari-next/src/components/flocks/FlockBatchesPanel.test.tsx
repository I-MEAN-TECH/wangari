/**
 * FlockBatchesPanel, rendered — plus source pins for what a static render
 * cannot reach.
 *
 * The panel answers the question farmers actually ask:
 *
 *   "I have 300 chickens. I bought 200 more. I want them in the same place,
 *    but I still need to tell the two apart later."
 *
 * Before this panel existed both answers were unreachable from the UI: the
 * backend had six working batch endpoints and the frontend used them in
 * exactly one place — a checkbox buried inside the merge form. Nothing
 * rendered that fact, so it could (and did) regress silently.
 *
 * ── What this file can and cannot prove ────────────────────────────────────
 * The vitest environment is `node` — no jsdom, no testing-library — so this
 * is renderToStaticMarkup. Two consequences, stated rather than worked around:
 *
 *  1. Effects do not run. The panel starts in its loading state (the same
 *     convention FlockHerdPanel and FlockAnimalsPanel use), so a static
 *     render shows the SHELL: heading, framing copy, action buttons, help
 *     text. The loaded list is not reachable here.
 *  2. Nothing is clickable. Copy that only appears inside an opened form is
 *     pinned against the component SOURCE instead — the same technique
 *     server/src/lib/flock-batches.test.ts already uses for Express routes.
 *
 * So: render assertions for the shell, source assertions for the behaviour
 * whose whole risk is "the farmer chose wrong and the total silently
 * corrupted". Both are real regression guards; neither pretends to be a
 * browser.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FlockBatchesPanel } from "./FlockBatchesPanel";

const panelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "FlockBatchesPanel.tsx"),
  "utf8"
);

function render(flock: { id: number; name: string; currentCount: number; category?: string }) {
  return renderToStaticMarkup(
    createElement(FlockBatchesPanel, { flock, onChanged: () => {} })
  );
}

const CHICKENS = { id: 7, name: "Layers A", currentCount: 300, category: "poultry" };

describe("the sub-group panel renders its shell", () => {
  it("renders without crashing — a bad import would fail here", () => {
    expect(render(CHICKENS).length).toBeGreaterThan(200);
  });

  it("names the panel in a farmer's words, not the schema's", () => {
    const html = render(CHICKENS);
    expect(html).toContain("Groups inside this flock");
    // "Batch" is the database's word. A farmer says flock and group.
    expect(html).not.toContain("Batch");
  });

  it("explains the one-flock-many-groups idea before asking for input", () => {
    const html = render(CHICKENS);
    expect(html).toContain("One flock, one total");
    expect(html).toContain("tell your groups apart");
  });

  it("offers all three actions in plain verbs", () => {
    const html = render(CHICKENS);
    expect(html).toContain("Add a group");
    expect(html).toContain("Move between groups");
    expect(html).toContain("Combine two groups");
  });

  it("disables the two-group actions until a second group exists", () => {
    // With no batches loaded, moving and combining are impossible. Offering
    // them live would be a dead tap — the worst possible feedback on a phone
    // with no signal.
    const html = render(CHICKENS);
    expect(html.match(/disabled="/g)?.length).toBe(2);
    expect(html).toContain("Add a second group to move animals between groups");
  });

  it("keeps the help text on the same sentence the farmer would ask", () => {
    expect(render(CHICKENS)).toContain("What is a group inside a flock?");
  });
});

describe("the panel is strictly additive — a flock with no batches is untouched", () => {
  it("says one group so far, rather than implying something is wrong", () => {
    // A flock that has never been split is not broken. The empty state must
    // reassure, not scold — a farmer who never opens this panel sees the
    // screen they saw before this component existed.
    //
    // Pinned against the source, not the render: the empty state is inside
    // the `loading === false` branch, and a static render never runs the
    // effect that flips it. (FlockHerdPanel and FlockAnimalsPanel start in
    // the same loading state, so this is the panel fitting in, not a bug.)
    expect(panelSource).toContain('title="One group so far"');
    expect(panelSource).toMatch(/All \$\{flockTotal\} animals are in one group/);
  });

  it("renders for a brand-new flock with no animals at all", () => {
    const html = render({ id: 1, name: "New group", currentCount: 0 });
    expect(html).toContain("Groups inside this flock");
    expect(html).toContain("Add a group");
  });

  it("renders for a non-poultry flock", () => {
    expect(render({ id: 2, name: "Dairy herd", currentCount: 12, category: "cattle" })).toContain(
      "Groups inside this flock"
    );
  });
});

/**
 * The two scenarios from the field, pinned against the source.
 *
 * These are the writes whose failure is silent: choose "new animals" when the
 * farmer meant "name what I already have", and the flock total moves when it
 * should not — with no error, no warning, and a number a buyer will later
 * refuse to pay against.
 */
describe("scenario 1 — 300 birds, then 200 bought in", () => {
  it("asks which of the two events happened, rather than assuming", () => {
    expect(panelSource).toContain("New animals I bought or bred");
    expect(panelSource).toContain("A name for animals I already have");
  });

  it("sends addToFlock only on the new-stock branch", () => {
    // The single field that decides whether the flock total moves.
    expect(panelSource).toMatch(/\.\.\.\(isNewStock \? \{ addToFlock: true, reason: addForm\.reason \} : \{\}\)/);
  });

  it("lets the farmer say the animals were BORN, not only bought", () => {
    // Defaulting every arrival to "purchase" puts a cost against an animal
    // that cost nothing, which then reads wrong in the profit figures.
    expect(panelSource).toContain('How did they arrive?');
    expect(panelSource).toContain('>Bought</option>');
    expect(panelSource).toContain('>Born on the farm</option>');
    // Offered only for genuine arrivals — relabelling has no arrival story.
    expect(panelSource).toMatch(/isNewStock \? \(\s*<label/);
  });

  it("previews the new total in the farmer's units before they commit", () => {
    expect(panelSource).toMatch(/will go up by/);
    expect(panelSource).toMatch(/The total does not change/);
  });

  it("refuses a zero-head arrival, pointing at relabelling instead", () => {
    // The quotes are JSX-escaped in the source, so match the escaped form.
    expect(panelSource).toContain('switch off \\"new animals\\"');
  });

  it("uses the unit a poultry farmer says, and the one a cattle farmer says", () => {
    expect(panelSource).toMatch(/category === "poultry" \? "birds" : "head"/);
  });
});

describe("scenario 2 — two groups under one flock", () => {
  it("combining keeps history rather than deleting it", () => {
    // Archive-not-delete is the server rule; the UI must promise the same
    // thing or the farmer will not trust the button.
    expect(panelSource).toContain("Both keep their history");
    expect(panelSource).toContain("being listed on its own");
  });

  it("moving between groups states that the flock total is unchanged", () => {
    expect(panelSource).toContain("the flock total stays the same");
  });

  it("dissolving keeps the animals and says so before confirming", () => {
    // The destructive-looking action is not destructive. Saying so in the
    // confirm dialog is what stops a farmer avoiding the feature entirely.
    expect(panelSource).toContain("they just stop being tracked separately");
    expect(panelSource).toContain("The animals stay in the flock");
  });
});

describe("honesty about a total that does not add up", () => {
  it("warns in plain words", () => {
    // A discrepancy nobody mentions is how a farm record stops being
    // believable to a buyer or a county officer.
    expect(panelSource).toContain("but");
    expect(panelSource).toContain("totals");
  });

  it("never claims balance while the parts disagree", () => {
    expect(panelSource).toMatch(/isBalanced = batches\.length === 0 \|\| batchTotal === flockTotal/);
  });

  it("names a fix that can ACTUALLY close the gap", () => {
    // The earlier copy pointed at "Move between groups", which cannot work:
    // moving head between two groups leaves their sum exactly where it was,
    // so the farmer would tap it and nothing would change. The advice has to
    // point at the one action that moves both numbers.
    expect(panelSource).toContain("Add or remove");
    expect(panelSource).not.toContain("even it out");
  });

  it("says WHICH direction the gap runs", () => {
    // "Too few in groups" and "groups claim too many" call for different
    // actions, so the warning has to distinguish them rather than hedge.
    expect(panelSource).toMatch(/flockTotal > batchTotal/);
    expect(panelSource).toMatch(/not in any group yet/);
    expect(panelSource).toMatch(/more than the flock has/);
  });
});

/**
 * The action that keeps the parts adding up to the whole.
 *
 * Before it existed, a death could only be recorded against the flock alone —
 * the total dropped, every group kept its old number, and the two never
 * agreed again. This is the write that prevents that, so it is pinned
 * separately from the general add/move/combine actions.
 */
describe("a group's own head can be added to or removed from", () => {
  it("offers the action per group, not once for the flock", () => {
    expect(panelSource).toContain("Add or remove");
    expect(panelSource).toMatch(/aria-label=\{`Add or remove animals in \$\{b\.name\}`\}/);
  });

  it("posts the group's id alongside the count change", () => {
    // The one field that stops the drift — without it this is just the
    // flock-level count change wearing a new button.
    expect(panelSource).toMatch(/batchId: adjustFor\.id/);
  });

  it("signs the delta by direction, letting the server clamp", () => {
    expect(panelSource).toMatch(/delta: adjustForm\.direction === "in" \? n : -n/);
  });

  it("snaps the reason when the direction flips", () => {
    // Otherwise "removed" with "Bought" still selected silently records a
    // purchase as a death — an error the farmer would never see.
    expect(panelSource).toMatch(/opt\.on === "in" \? IN_REASONS\[0\]\.value : OUT_REASONS\[0\]\.value/);
  });

  it("offers only reasons that fit the direction", () => {
    // Bought is not a thing that can happen to head leaving a group.
    expect(panelSource).toMatch(/adjustForm\.direction === "in" \? IN_REASONS : OUT_REASONS/);
    expect(panelSource).toContain('label: "Died"');
    expect(panelSource).toContain('label: "Sold"');
  });

  it("says both numbers change, so the farmer knows why it matters", () => {
    expect(panelSource).toMatch(/both change, so the groups keep adding up/);
  });
});

describe("offline is reported as good news, not as an error", () => {
  it("keeps the queued notice in a separate state from the error", () => {
    // Rendering "saved on this device" in the red error slot would teach a
    // farmer with no signal that they had done something wrong.
    expect(panelSource).toContain("setNotice(message)");
    expect(panelSource).toMatch(/is good news/);
    expect(panelSource).toContain("Saved on this device");
  });
});
