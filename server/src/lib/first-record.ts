/**
 * "Has this farmer recorded anything real yet?" — one definition, used twice.
 *
 * The dashboard needs it to decide whether to show the zero-state first-run
 * card. The activation funnel needs it to *verify* that a farmer claiming to
 * have recorded something actually has, rather than taking the client's word.
 *
 * Both are only correct if they read the same rows, so the query lives here
 * instead of being written twice. Anything inferred from configuration — "does
 * this farm have flocks?" — is not the same question and has already misled us
 * once: a dairy farmer logging milk nightly without ever adding a flock was
 * stuck on "Welcome to Wangari! Start here" forever.
 *
 * Deliberately a raw UNION MIN: four separate `findFirst` calls would be four
 * round trips on the hottest endpoint in the product, and MIN over the union
 * is exactly the same answer.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Earliest date across every table that represents real farm activity:
 * production, harvest, money moved, and a delivery to a buyer.
 *
 * Returns null for a farm that has recorded nothing. Never throws — the
 * dashboard treats "unknown" as "not yet" rather than failing the whole page.
 */
export async function firstRecordAt(farmId: number): Promise<string | null> {
  const rows = await prisma
    .$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
      SELECT MIN(d) AS first FROM (
        SELECT MIN(date) AS d FROM daily_production WHERE farm_id = ${farmId}
        UNION ALL SELECT MIN(date) FROM crop_harvests WHERE farm_id = ${farmId}
        UNION ALL SELECT MIN(date) FROM transactions WHERE farm_id = ${farmId}
        UNION ALL SELECT MIN(date) FROM deliveries WHERE farm_id = ${farmId}
      ) t
    `)
    .catch(() => [{ first: null }]);

  const row = rows?.[0];
  const first = row?.first;
  return first ? new Date(first).toISOString() : null;
}