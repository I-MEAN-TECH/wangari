/**
 * One label for a crop row, in the order a farmer reads it.
 *
 * A crop carries two names: `cropType` is WHAT grows ("Maize") and `name` is
 * the field it grows in ("Upper plot, behind the house"). A picker labelled
 * "Crop" has to lead with what grows — a plot the farmer happened to call
 * "land", "back" or "A" reads as nonsense on its own, and a page a buyer may
 * see must never show the plot as though it were the crop.
 *
 * The field name still follows, because two fields of the same crop on one
 * farm are otherwise indistinguishable, and it is dropped only when it merely
 * repeats the crop type ("Avocado" / "Avocado").
 */
export function cropLabel(crop: { cropType?: string | null; name?: string | null } | null | undefined): string {
  const type = String(crop?.cropType ?? "").trim();
  const field = String(crop?.name ?? "").trim();
  if (type && field && field.toLowerCase() !== type.toLowerCase()) return `${type} · ${field}`;
  return type || field || "Crop";
}
