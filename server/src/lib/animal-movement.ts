/**
 * The §20 movement vocabulary — one list, in one place.
 *
 * Two different writers put a string in `AnimalMovement.reason`, and neither is
 * allowed to invent its own words:
 *
 *  - THE FARMER, choosing from the reasons the movement form offers. Those are
 *    FARMER_MOVEMENT_REASONS, and they are the only values the movement
 *    endpoint will accept.
 *  - THE GROUP MOVE, which writes GROUP_MOVE_REASON itself when a tagged animal
 *    is moved between two of the farm's own groups.
 *
 * GROUP_MOVE_REASON is deliberately NOT in the farmer's list. The form asks for
 * "from premises" and "to premises", and a change of GROUP is not a change of
 * premises — so offering it as a button would invite a farmer to type a premises
 * where a group name belongs, and the §20 chain would then assert something
 * about a location that never happened. The group move writes it from the group
 * names it already knows.
 *
 * Why the set is closed at all: the county export prints the reason into the
 * animal's movement chain. `bought` / `purchased` / `bought in` would hand a
 * county officer three ways to read one event, and a register that can be read
 * several ways is not a register.
 */

/** Reasons the FARMER can pick on the movement form, and the only ones
 *  `POST /api/animals/:id/movements` accepts. */
export const FARMER_MOVEMENT_REASONS = [
  "sale",
  "transfer",
  "grazing",
  "vet",
  "quarantine",
  "other",
] as const;

/**
 * Written automatically when tagged animals move between the farm's own groups.
 *
 * It is a real movement — the animals are somewhere else now, and the §20 chain
 * should say so — but it is NOT an exit from the farm: nothing here flips an
 * animal's status to "moved", because it has not gone anywhere a buyer or the
 * county needs to be told about as a departure.
 */
export const GROUP_MOVE_REASON = "group_move" as const;

/** Every reason that may legitimately appear on an AnimalMovement row. */
export const ALL_MOVEMENT_REASONS = [
  ...FARMER_MOVEMENT_REASONS,
  GROUP_MOVE_REASON,
] as const;

export type FarmerMovementReason = (typeof FARMER_MOVEMENT_REASONS)[number];
export type MovementReason = (typeof ALL_MOVEMENT_REASONS)[number];

/** Is this a reason the movement form is allowed to submit? */
export function isFarmerMovementReason(value: unknown): value is FarmerMovementReason {
  return (
    typeof value === "string" &&
    (FARMER_MOVEMENT_REASONS as readonly string[]).includes(value)
  );
}
