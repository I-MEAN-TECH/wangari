/**
 * What the farm was ACTUALLY paid, by buyer and by grade — and whether the
 * butterfat it recorded has anything to do with the price (gap report §2 B7 and
 * §1 A7).
 *
 * `MarketPrice` already answers "what is the going rate". This answers the
 * different question "what did I get" — which is the one a farmer takes to a
 * co-op, because it is made of their own receipts.
 *
 * Rules:
 *  - **A price is only computed from deliveries that recorded one.** The
 *    quantity with no price is reported next to the average rather than merged
 *    into it: an average over the third of deliveries that happened to have a
 *    price is not an average, and presenting it as one is how a farmer ends up
 *    quoting a number the co-op can dismantle.
 *  - **No quality bands are imported.** QBMP bands are a co-op's commercial term
 *    and we are not told them. So the quality comparison splits on the FARMER'S
 *    OWN median fat percentage and states plainly that it is a description of
 *    their deliveries, not a payment rule.
 *  - **Grade comes from the harvest, not the delivery**, because that is where
 *    it is recorded (`CropHarvest.quality`) — coffee's grades live on the batch,
 *    not on the lorry ticket.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PricedDelivery {
  id: number;
  date: Date;
  commodity: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  buyer: string;
  fatPct: number | null;
  snfPct: number | null;
  expectedPay: number | null;
  paidAmount: number | null;
  status: string;
}

export interface RealisedPrice {
  deliveries: number;
  quantity: number;
  unit: string | null;
  /** Quantity across deliveries that carried a price — the average's real base. */
  pricedQuantity: number;
  /** Quantity with no price recorded. Never folded into the average. */
  unpricedQuantity: number;
  /** Quantity × unit price, summed. */
  value: number;
  /** Value ÷ pricedQuantity. Null when nothing was priced. */
  pricePerUnit: number | null;
}

function realise(rows: PricedDelivery[]): RealisedPrice {
  let quantity = 0;
  let pricedQuantity = 0;
  let unpricedQuantity = 0;
  let value = 0;
  const units = new Set<string>();

  for (const d of rows) {
    const q = Number(d.quantity) || 0;
    quantity += q;
    if (d.unit) units.add(d.unit);
    if (d.unitPrice != null && d.unitPrice > 0) {
      pricedQuantity += q;
      value += q * d.unitPrice;
    } else {
      unpricedQuantity += q;
    }
  }

  return {
    deliveries: rows.length,
    quantity: r2(quantity),
    unit: units.size === 1 ? [...units][0] : null,
    pricedQuantity: r2(pricedQuantity),
    unpricedQuantity: r2(unpricedQuantity),
    value: r2(value),
    pricePerUnit: pricedQuantity > 0 ? r2(value / pricedQuantity) : null,
  };
}

export const realisedPrice = (rows: PricedDelivery[]): RealisedPrice => realise(rows);

export interface BuyerPrice extends RealisedPrice {
  /** The buyer's own name as the farmer typed it — never normalised. */
  buyer: string;
  commodity: string;
}

/**
 * Realised price per buyer, per commodity.
 *
 * Per commodity as well as per buyer on purpose: a co-op that takes milk AND
 * coffee cherry would otherwise average litres with kilos and produce a number
 * that means nothing at all.
 */
export function byBuyer(rows: PricedDelivery[]): BuyerPrice[] {
  const groups = new Map<string, PricedDelivery[]>();
  for (const d of rows) {
    const key = `${d.buyer}\u0000${d.commodity}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [buyer, commodity] = key.split("\u0000");
      return { ...realise(group), buyer, commodity };
    })
    // Worst-paid first: the line a farmer acts on is the one at the bottom.
    .sort((a, b) => (a.pricePerUnit ?? Infinity) - (b.pricePerUnit ?? Infinity));
}

export interface QualityPricePair {
  deliveryId: number;
  date: Date;
  fatPct: number;
  pricePerUnit: number;
  quantity: number;
  buyer: string;
}

export interface QualityVsPrice {
  pairs: QualityPricePair[];
  /** The farmer's own middle fat figure — the split point, not a standard. */
  medianFatPct: number | null;
  /** Deliveries at or above their own median. */
  atOrAbove: { deliveries: number; pricePerUnit: number | null; quantity: number };
  below: { deliveries: number; pricePerUnit: number | null; quantity: number };
  /**
   * Stated on screen beside the comparison. This is a description of the
   * farmer's own deliveries; it is not a payment rule and not a promise.
   */
  basis: string;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : r2((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Butterfat against the price actually received, on the farmer's own numbers.
 *
 * Only deliveries with BOTH a fat figure and a price take part — anything else
 * would be comparing a measurement with a guess. Below three paired deliveries
 * the split is not shown as a finding, because two points make a line through
 * everything and through nothing.
 */
export function qualityVsPrice(rows: PricedDelivery[], commodity = "milk"): QualityVsPrice {
  const pairs: QualityPricePair[] = rows
    .filter((d) => d.commodity === commodity)
    .map((d) => ({
      deliveryId: d.id,
      date: d.date,
      fatPct: d.fatPct as number,
      pricePerUnit: d.unitPrice as number,
      quantity: Number(d.quantity) || 0,
      buyer: d.buyer,
    }))
    .filter((p) => p.fatPct != null && isFinite(p.fatPct) && p.pricePerUnit != null && p.pricePerUnit > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const basis =
    "Compared using the middle butterfat figure of your own deliveries. Your co-op's payment bands may differ.";

  if (pairs.length < 3) {
    return {
      pairs,
      medianFatPct: null,
      atOrAbove: { deliveries: 0, pricePerUnit: null, quantity: 0 },
      below: { deliveries: 0, pricePerUnit: null, quantity: 0 },
      basis,
    };
  }

  const medianFatPct = median(pairs.map((p) => p.fatPct)) as number;
  const above = pairs.filter((p) => p.fatPct >= medianFatPct);
  const below = pairs.filter((p) => p.fatPct < medianFatPct);

  const summarise = (group: QualityPricePair[]) => {
    const quantity = group.reduce((s, p) => s + p.quantity, 0);
    const value = group.reduce((s, p) => s + p.quantity * p.pricePerUnit, 0);
    return {
      deliveries: group.length,
      pricePerUnit: quantity > 0 ? r2(value / quantity) : null,
      quantity: r2(quantity),
    };
  };

  return { pairs, medianFatPct, atOrAbove: summarise(above), below: summarise(below), basis };
}

export interface HarvestGradeRow {
  cropType: string;
  /** A | B | C, or whatever the farmer wrote. */
  quality: string | null;
  quantityKg: number;
  salePrice: number | null;
}

export interface GradePrice {
  cropType: string;
  grade: string;
  quantityKg: number;
  pricedQuantityKg: number;
  value: number;
  pricePerKg: number | null;
}

/**
 * Realised price per grade, per crop.
 *
 * A harvest with no grade is grouped as "ungraded" rather than dropped, because
 * a farmer needs to see how much of their crop they are NOT grading — that gap
 * is usually where the money is.
 */
export function byGrade(rows: HarvestGradeRow[]): GradePrice[] {
  const groups = new Map<string, HarvestGradeRow[]>();
  for (const h of rows) {
    const key = `${h.cropType}\u0000${h.quality?.trim() || "ungraded"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(h);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [cropType, grade] = key.split("\u0000");
      let quantityKg = 0;
      let pricedQuantityKg = 0;
      let value = 0;
      for (const h of group) {
        const q = Number(h.quantityKg) || 0;
        quantityKg += q;
        if (h.salePrice != null && h.salePrice > 0 && q > 0) {
          pricedQuantityKg += q;
          value += Number(h.salePrice);
        }
      }
      return {
        cropType,
        grade,
        quantityKg: r2(quantityKg),
        pricedQuantityKg: r2(pricedQuantityKg),
        value: r2(value),
        pricePerKg: pricedQuantityKg > 0 ? r2(value / pricedQuantityKg) : null,
      };
    })
    .sort((a, b) => a.cropType.localeCompare(b.cropType) || a.grade.localeCompare(b.grade));
}
