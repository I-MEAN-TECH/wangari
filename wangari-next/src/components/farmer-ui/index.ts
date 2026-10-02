/**
 * farmer-ui — the shared low-literacy component library.
 *
 * Every component here exists because a large share of Wangari's farmers
 * cannot read comfortably, let alone type. They are built once and reused by
 * every feature so the whole app speaks the same visual language:
 *
 *  - BigKeypad     numbers are tapped, never typed
 *  - Stepper       "how many today?" via two huge buttons
 *  - StatusChip    one fixed green/amber/red + icon language app-wide
 *  - AnitracTag    ANITRAC ear-tag entry (15 digits, 141 prefix, range mode)
 *
 * Voice/speech is intentionally deferred to the AI + WhatsApp phase; when it
 * lands it should slot in here without changing any call site.
 *
 * See docs/module-plan.md §0 for the rules these components enforce.
 */

export { BigKeypad, type BigKeypadProps } from "./big-keypad";
export { Stepper, type StepperProps } from "./stepper";
export {
  StatusChip,
  toneForStatus,
  type StatusChipProps,
  type StatusTone,
} from "./status-chip";
export {
  AnitracTagInput,
  validateTag,
  expandTagRange,
  ANITRAC_PREFIX,
  ANITRAC_MAX_DIGITS,
  type AnitracTagValue,
  type AnitracTagInputProps,
} from "./anitrac-tag";
