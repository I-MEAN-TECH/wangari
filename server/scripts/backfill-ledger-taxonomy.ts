/**
 * Backfill `Transaction.costBucket` / `Transaction.enterpriseKind`.
 *
 *   cd server && npx tsx scripts/backfill-ledger-taxonomy.ts            # dry run
 *   cd server && npx tsx scripts/backfill-ledger-taxonomy.ts --apply    # write
 *
 * ## Why this is safe to run at any time, in any order
 *
 * It is **idempotent in both directions**:
 *   - it only touches rows where the target column IS NULL, so running it
 *     twice cannot overwrite a value a human set deliberately
 *   - it classifies with the same pure functions the API uses, imported from
 *     `src/lib/ledger-taxonomy.ts` — so the backfilled value and the
 *     on-the-fly value can never disagree
 *
 * The API does not depend on this having run: `profitability.ts` falls back to
 * classifying on read when the column is null. This exists so that *grouping*
 * queries (which need an index on the column) are correct, and so the live
 * table stops carrying two conventions for one thing.
 *
 * ## Why dry run is the default
 *
 * The target is the production database. A script that writes on a bare
 * invocation is a script somebody eventually runs by accident while trying to
 * remember what it does. Printing the cross-tab first is also how we find out
 * that a category needs a new mapping before it is frozen into 17 rows.
 */

import { PrismaClient } from "@prisma/client";
import { classifyExpense, classifyIncome } from "../src/lib/ledger-taxonomy.js";

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient();

type Count = Map<string, number>;

async function main() {
  const rows = await prisma.transaction.findMany({
    select: { id: true, type: true, category: true, costBucket: true, enterpriseKind: true },
    orderBy: { id: "asc" },
  });

  console.log(`transactions in the database: ${rows.length}`);
  console.log(`mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log("");

  const expenseRows = rows.filter((r) => r.type === "expense");
  const incomeRows = rows.filter((r) => r.type === "income");
  const otherRows = rows.filter((r) => r.type !== "expense" && r.type !== "income");

  // ── The cross-tab: what each live category maps to, and how many rows carry it.
  const expenseTab: Count = new Map();
  for (const r of expenseRows) {
    const key = `${r.category ?? "(null)"}  ->  ${classifyExpense(r.category)}`;
    expenseTab.set(key, (expenseTab.get(key) ?? 0) + 1);
  }
  const incomeTab: Count = new Map();
  for (const r of incomeRows) {
    const key = `${r.category ?? "(null)"}  ->  ${classifyIncome(r.category)}`;
    incomeTab.set(key, (incomeTab.get(key) ?? 0) + 1);
  }

  console.log("── expense categories ──");
  for (const [k, n] of [...expenseTab].sort()) console.log(`  ${n} x  ${k}`);
  console.log("── income categories ──");
  for (const [k, n] of [...incomeTab].sort()) console.log(`  ${n} x  ${k}`);
  if (otherRows.length) {
    console.log(`── rows whose type is neither expense nor income: ${otherRows.length} ──`);
    for (const r of otherRows) console.log(`  #${r.id} type=${JSON.stringify(r.type)}`);
  }
  console.log("");

  // ── What would change. A row already carrying the right value is skipped, so
  // the "would update" count is the honest measure of work remaining.
  const toExpense = expenseRows.filter(
    (r) => r.costBucket == null || r.costBucket !== classifyExpense(r.category)
  );
  const toIncome = incomeRows.filter(
    (r) => r.enterpriseKind == null || r.enterpriseKind !== classifyIncome(r.category)
  );

  console.log(`expense rows needing a costBucket:      ${toExpense.length}`);
  console.log(`income rows needing an enterpriseKind:  ${toIncome.length}`);
  console.log("");

  // ── Anything that fell through to a catch-all is worth seeing by name.
  const unmapped = rows.filter((r) =>
    r.type === "expense"
      ? classifyExpense(r.category) === "other"
      : classifyIncome(r.category) === "general"
  );
  if (unmapped.length) {
    console.log(`── landed in the catch-all bucket (${unmapped.length}) ──`);
    for (const r of unmapped) {
      console.log(`  #${r.id} ${r.type} category=${JSON.stringify(r.category)}`);
    }
    console.log("");
    console.log("  These are not errors — they are the categories the taxonomy has no");
    console.log("  rule for yet. Add a mapping in src/lib/ledger-taxonomy.ts and re-run,");
    console.log("  or accept them as 'other'/'general'.");
    console.log("");
  }

  if (!APPLY) {
    console.log("dry run complete. Re-run with --apply to write.");
    return;
  }

  let updated = 0;
  for (const r of toExpense) {
    await prisma.transaction.update({
      where: { id: r.id },
      data: { costBucket: classifyExpense(r.category) },
    });
    updated++;
  }
  for (const r of toIncome) {
    await prisma.transaction.update({
      where: { id: r.id },
      data: { enterpriseKind: classifyIncome(r.category) },
    });
    updated++;
  }

  console.log(`updated ${updated} rows.`);
  console.log("verifying...");
  const after = await prisma.transaction.findMany({
    select: { type: true, costBucket: true, enterpriseKind: true },
  });
  const stillNull = after.filter((r) =>
    r.type === "expense" ? r.costBucket == null : r.enterpriseKind == null
  ).length;
  console.log(stillNull === 0
    ? "OK — every expense has a costBucket and every income has an enterpriseKind."
    : `WARNING — ${stillNull} rows are still null. Investigate before deploying.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
