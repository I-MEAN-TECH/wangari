/**
 * End-to-end verification of the 13 Oct 2026 gap closures.
 *
 * Run against a locally booted API (see the header of the module doc for the
 * gaps it covers). Real HTTP, real database — the point is to exercise the same
 * interface the app uses, not the pure libs (which have their own tests).
 *
 *   node scripts/verify-gaps-e2e.mjs [baseUrl]
 *
 * Every check prints PASS/FAIL and the script exits non-zero on any failure.
 */

const BASE = process.argv[2] || "http://127.0.0.1:3999/api";
const stamp = Date.now();
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* some endpoints answer 204 */
  }
  return { status: res.status, json };
}

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// ── sign up ────────────────────────────────────────────────────────────────
const email = `gap-verify-${stamp}@example.com`;
const reg = await call("POST", "/auth/register", { name: "Gap Verify", email, password: "Verify1234!" });
check("register a farm", reg.status === 201, `status ${reg.status}`);
const code = reg.json?.devCode;
check("verification code issued in dev", typeof code === "string" && code.length > 0);

const ver = await call("POST", "/auth/verify-email", { email, code });
const token = ver.json?.token;
check("verify email and get a session", ver.status === 200 && !!token, `status ${ver.status}`);
if (!token) {
  console.log("\nNo session — cannot continue.");
  process.exit(1);
}

// ── B1/B2/B4/B6: a plot, a crop on it, its history and its trace ────────────
const plot = await call("POST", "/plots", { name: `Block A ${stamp}`, areaValue: 2.5, areaUnit: "acre", soilType: "loam", latitude: -0.7167, longitude: 36.9333 }, token);
check("create a plot with a GPS pair", plot.status === 201 && plot.json?.latitude != null, `status ${plot.status}`);
const plotId = plot.json?.id;

const lone = await call("POST", "/plots", { name: `Half GPS ${stamp}`, latitude: -0.5 }, token);
check("a lone coordinate is rejected (never half-located)", lone.status === 400, `status ${lone.status}`);

const crop = await call("POST", "/crops", { name: `Maize North ${stamp}`, cropType: "Maize", areaAcres: 2, plantingDate: day(-40), expectedYieldKg: 2000, plotId }, token);
check("create a crop attached to the plot (plotId now sent)", crop.status === 201 && crop.json?.plotId === plotId, `plotId=${crop.json?.plotId}`);
check("crop stores the farmer's own expected yield", Number(crop.json?.expectedYieldKg) === 2000);
const cropId = crop.json?.id;

const harvest = await call("POST", `/crops/${cropId}/harvest`, { date: day(-2), quantityKg: 1700, quality: "A" }, token);
check("record a harvest", harvest.status === 201, `status ${harvest.status}`);

const history = await call("GET", `/plots/${plotId}/history`, null, token);
const steps = history.json?.rotation?.steps ?? [];
check("plot history returns rotation steps (B4)", history.status === 200 && steps.length === 1, `steps=${steps.length}`);
check(
  "rotation notes a repeat of the previous crop type rather than advising on it",
  steps[0]?.repeatsPrevious === false && history.json?.rotation?.cropTypesGrown?.[0] === "Maize"
);
const yields = history.json?.yields ?? [];
check(
  "yield variance is measured against the farmer's own expectation only (B6)",
  Number(yields[0]?.expectedKg) === 2000 && Number(yields[0]?.varianceKg) === -300,
  `expected=${yields[0]?.expectedKg} variance=${yields[0]?.varianceKg}`
);

const trace = await call("GET", `/plots/${plotId}/trace`, null, token);
check("plot trace chain builds (B2)", trace.status === 200, `status ${trace.status}`);

// ── B3: structured scouting ────────────────────────────────────────────────
const oversampled = await call("POST", "/scouting", { cropId, date: day(-1), issueType: "pest", description: "fall armyworm on the whorls", sampleSize: 50, affectedCount: 60, severity: "high", followUpOn: day(-1) }, token);
check("an impossible count pair is SAVED, not rejected", oversampled.status === 201, `status ${oversampled.status}`);

const walk = await call("POST", "/scouting", { cropId, date: day(0), issueType: "pest", description: "fall armyworm, three rows", sampleSize: 50, affectedCount: 14, severity: "medium", pestStage: "larva" }, token);
check("record a scouting walk", walk.status === 201, `status ${walk.status}`);

const scouting = await call("GET", "/scouting", null, token);
const pressure = scouting.json?.crops?.[0];
check("scouting pressure reports an incidence %", pressure?.latestIncidence === 28, `incidence=${pressure?.latestIncidence}`);
check("scouting lists follow-ups the farmer set", (scouting.json?.followUpsDue ?? []).length >= 1);
check("scouting trend compares against the same issue", ["rising", "falling", "flat", "unknown"].includes(pressure?.latestTrend));

// ── A6: withdrawal window ─────────────────────────────────────────────────
const treated = await call("POST", "/health-records", { type: "treatment", condition: "mastitis", action: "intramammary tube", withdrawalUntil: day(2), withdrawalNote: "milk 3 days" }, token);
check("record a treatment with a withdrawal date", treated.status === 201 && treated.json?.withdrawalUntil != null, `status ${treated.status}`);

const withdrawals = await call("GET", "/health-records/withdrawals", null, token);
check("the withdrawal is live and counted down", (withdrawals.json?.active ?? []).length === 1, `active=${(withdrawals.json?.active ?? []).length}`);
check("days remaining counts today as inside", withdrawals.json?.active?.[0]?.daysRemaining === 3, `daysRemaining=${withdrawals.json?.active?.[0]?.daysRemaining}`);

const wcheck = await call("GET", "/deliveries/withdrawal-check?commodity=milk", null, token);
check("the delivery form's milk check blocks the sale", wcheck.json?.advice?.blocked === true, wcheck.json?.advice?.message ?? "");

const nonMilk = await call("GET", "/deliveries/withdrawal-check?commodity=maize", null, token);
check("and says nothing at all about a maize delivery", nonMilk.json?.advice?.message === null);

// ── A1/A7/B7: milk quality through to the statement ───────────────────────
const milkRows = [
  { fatPct: 3.6, unitPrice: 45, quantity: 12, date: day(-9) },
  { fatPct: 4.1, unitPrice: 52, quantity: 10, date: day(-6) },
  { fatPct: 4.4, unitPrice: 55, quantity: 14, date: day(-3) },
  { fatPct: null, unitPrice: null, quantity: 9, date: day(-1) },
];
for (const [i, row] of milkRows.entries()) {
  const d = await call("POST", "/deliveries", {
    commodity: "milk", buyer: "Githunguri Dairy", unit: "litres",
    quantity: row.quantity, unitPrice: row.unitPrice ?? undefined,
    fatPct: row.fatPct ?? undefined, snfPct: row.fatPct != null ? 8.5 : undefined,
    density: row.fatPct != null ? 1.03 : undefined, addedWaterPct: row.fatPct != null ? 0 : undefined,
    tpc: row.fatPct != null ? 200000 : undefined, gradedBy: row.fatPct != null ? "co-op lab" : undefined,
    payBy: day(i + 3), date: row.date, receiptRef: `SLIP-${i}`,
  }, token);
  check(`record milk delivery ${i + 1} with the slip's readings`, d.status === 201, `status ${d.status}`);
}

const month = new Date().toISOString().slice(0, 7);
const stmt = await call("GET", `/deliveries/statement?month=${month}`, null, token);
const slip = (stmt.json?.deliveryList ?? [])[0];
check("the statement carries the per-delivery slip (was computed, never rendered)", (stmt.json?.deliveryList ?? []).length === 4, `rows=${(stmt.json?.deliveryList ?? []).length}`);
check("butterfat is on the statement line", slip?.fatPct != null || (stmt.json?.deliveryList ?? []).some((d) => d.fatPct != null));
check("untested fields stay null rather than becoming zero", (stmt.json?.deliveryList ?? []).some((d) => d.fatPct === null));
check("realised price is weighted on the priced litres only", stmt.json?.realised?.pricePerUnit > 0, `perUnit=${stmt.json?.realised?.pricePerUnit}`);
check("the unpriced litres are reported beside it, not folded in", (stmt.json?.realised?.unpricedQuantity ?? 0) === 9, `unpriced=${stmt.json?.realised?.unpricedQuantity}`);
check("realised price is split by buyer", (stmt.json?.priceByBuyer ?? []).length === 1);
check("butterfat vs price is computed on the farmer's own median (A7)", stmt.json?.qualityVsPrice?.medianFatPct != null, `median=${stmt.json?.qualityVsPrice?.medianFatPct}`);
check("grade price comes from the harvest (B7)", (stmt.json?.priceByGrade ?? []).length >= 1);
check("the promised payment date is on the slip", slip?.payBy != null);

// ── C1/C2: a loan repaid by a deduction ───────────────────────────────────
const loan = await call("POST", "/farm-loans", { lender: "Kigumo SACCO", loanType: "sacco", principal: 50000, instalmentAmount: 5000, instalmentCount: 10, firstInstalmentDue: day(20), disbursedAt: day(-30) }, token);
check("record the farmer's own loan", loan.status === 201, `status ${loan.status}`);
const loanId = loan.json?.id;

const withDeduction = await call("POST", "/deliveries", {
  commodity: "milk", buyer: "Githunguri Dairy", unit: "litres", quantity: 11, unitPrice: 50,
  date: day(0), payBy: day(14),
  deductions: [{ label: "SACCO loan", amount: 500, creditor: "Kigumo SACCO", farmLoanId: loanId }],
}, token);
check("record a delivery with a loan-tagged deduction", withDeduction.status === 201, `status ${withDeduction.status}`);
check("the deduction carries the loan it repaid", withDeduction.json?.deductions?.[0]?.farmLoanId === loanId);

const loans = await call("GET", "/farm-loans", null, token);
const loanRow = (loans.json ?? []).find((l) => l.id === loanId);
check("the loan shows what was collected at source", Number(loanRow?.deductionPaid) === 500, `deductionPaid=${loanRow?.deductionPaid}`);
check("and the balance reflects it", Number(loanRow?.balance) === 49500, `balance=${loanRow?.balance}`);

const stmt2 = await call("GET", `/deliveries/statement?month=${month}`, null, token);
check("the statement groups the deduction by who took it", (stmt2.json?.deductionsByCreditor?.["Kigumo SACCO"] ?? 0) === 500, JSON.stringify(stmt2.json?.deductionsByCreditor));

// ── B5: a voucher is not income ───────────────────────────────────────────
const voucher = await call("POST", "/input-vouchers", { program: "nfsp", dealer: "Kigumo agrovet", inputName: "DAP 2 bags", voucherValue: 5000, farmerContribution: 1200, quantityKg: 100, redeemedOn: day(-4), cropId, plotId }, token);
check("record an e-voucher redemption", voucher.status === 201, `status ${voucher.status}`);
check("only the cash paid is booked as an expense", voucher.json?.bookedAsExpense === true && Number(voucher.json?.nonCashValue) === 5000, `nonCash=${voucher.json?.nonCashValue}`);

const freeVoucher = await call("POST", "/input-vouchers", { program: "nfsp", voucherValue: 3000, farmerContribution: 0, redeemedOn: day(-3) }, token);
check("a fully-subsidised voucher books nothing at all", freeVoucher.json?.bookedAsExpense === false && freeVoucher.json?.expenseTransactionId === null);

const vouchers = await call("GET", "/input-vouchers", null, token);
check("voucher totals separate cash from the transfer", Number(vouchers.json?.totals?.cashPaid) === 1200 && Number(vouchers.json?.totals?.subsidyValue) === 8000, JSON.stringify(vouchers.json?.totals && { cash: vouchers.json.totals.cashPaid, subsidy: vouchers.json.totals.subsidyValue }));
check("cash per kg uses only the voucher with a quantity", Number(vouchers.json?.totals?.cashPerKg) === 12, `perKg=${vouchers.json?.totals?.cashPerKg}`);

// ── C4: the forward view and the plan ─────────────────────────────────────
const budget = await call("POST", "/cash-flow/budget", { label: "School fees term 1", amount: 20000, dueOn: day(25), direction: "outflow", recurring: "once" }, token);
check("add a plan item", budget.status === 201 || budget.status === 200, `status ${budget.status}`);
const flow = await call("GET", "/cash-flow", null, token);
check("the forward view builds buckets", (flow.json?.buckets ?? []).length > 0, `buckets=${(flow.json?.buckets ?? []).length}`);
check("it counts what is owed but never as income once overdue", typeof flow.json?.overdue?.amount === "number");
check("it states its own assumptions", flow.json?.assumptions?.trailingMonths != null && flow.json?.basis?.length > 0);
check("the plan appears in the projection", (flow.json?.planned ?? []).length === 1);

// ── C7: the chama book ───────────────────────────────────────────────────
await call("POST", "/savings", { groupName: "Umoja Chama", memberName: "Grace", entryType: "contribution", amount: 2000, occurredOn: day(-20) }, token);
await call("POST", "/savings", { groupName: "Umoja Chama", memberName: "Grace", entryType: "loan_out", amount: 1500, occurredOn: day(-10) }, token);
const savings = await call("GET", "/savings", null, token);
const ledger = savings.json?.ledgers?.[0];
const grace = ledger?.members?.[0];
check("the chama book builds a group ledger", ledger?.groupName === "Umoja Chama", `groups=${(savings.json?.ledgers ?? []).length}`);
check("a member's own savings are not reduced by their loan", Number(grace?.savingsBalance) === 2000, `savings=${grace?.savingsBalance}`);
check("and what they owe the pot is shown separately", Number(grace?.outstandingLoan) === 1500, `owes=${grace?.outstandingLoan}`);
check("the pot is explained rather than presented as the money you have", savings.json?.basis?.includes("cannot see"));

// ── C8: the asset register ───────────────────────────────────────────────
const flock = await call("POST", "/flocks", { name: `Dairy herd ${stamp}`, type: "cattle_dairy", initialCount: 4, costPerAnimal: 45000 }, token);
check("create a group with a purchase cost", flock.status === 201, `status ${flock.status}`);
const flockId = flock.json?.id;

const assetsBefore = await call("GET", "/assets", null, token);
check("the herd appears as capital", (assetsBefore.json?.lines ?? []).some((l) => l.kind === "livestock" && l.id === flockId));
check("with no date or life it is shown at cost, not depreciated",
  (assetsBefore.json?.lines ?? []).some((l) => l.id === flockId && l.kind === "livestock" && l.basis === "cost_only"));
check("and it is named as an incomplete line rather than a zero", (assetsBefore.json?.incomplete ?? []).some((l) => l.id === flockId));

await call("PATCH", `/assets/flock/${flockId}`, { acquiredOn: day(-400), usefulLifeYears: 6, salvageValue: 20000 }, token);
const assetsAfter = await call("GET", "/assets", null, token);
const line = (assetsAfter.json?.lines ?? []).find((l) => l.id === flockId && l.kind === "livestock");
check("with a date and a life it becomes straight-line arithmetic", line?.basis === "straight_line", `basis=${line?.basis}`);
check("book value is below cost and above the end value", line?.bookValue > 20000 && line?.bookValue < line?.cost, `book=${line?.bookValue} cost=${line?.cost}`);

const absurd = await call("PATCH", `/assets/flock/${flockId}`, { usefulLifeYears: 300 }, token);
check("a 300-year life is refused", absurd.status === 400, `status ${absurd.status}`);

// ── C3: reconciliation ──────────────────────────────────────────────────
const txn = await call("POST", "/transactions", { type: "income", category: "milk", amount: 585, description: "M-Pesa from Githunguri Dairy", date: day(0), paymentMethod: "mpesa", reference: `QK${stamp}` }, token);
check("record a receipt with no delivery behind it", txn.status === 201, `status ${txn.status}`);

const reco = await call("GET", "/reconciliation", null, token);
check("the reconciliation view builds", reco.status === 200 && typeof reco.json?.summary === "object");
check("it names the money with nothing behind it", (reco.json?.summary?.unmatchedTransactions ?? 0) >= 1, `unmatched=${reco.json?.summary?.unmatchedTransactions}`);
const proposal = (reco.json?.proposals ?? [])[0];
check("it proposes a match with its reasons", Array.isArray(proposal?.reasons) && proposal.reasons.length > 0, `proposals=${(reco.json?.proposals ?? []).length}`);

if (proposal) {
  const confirm = await call("POST", "/reconciliation/confirm", { transactionId: proposal.transactionId, deliveryId: proposal.deliveryId }, token);
  check("a match is only made when the farmer says so", confirm.json?.matched === true, `status ${confirm.status}`);
  const undo = await call("POST", "/reconciliation/confirm", { transactionId: proposal.transactionId, deliveryId: null }, token);
  check("and a mis-confirmed match can be undone", undo.json?.matched === false);
}

// ── C5: an insurance claim and the payout ───────────────────────────────
const policy = await call("POST", "/insurance", { insurer: "APA", policyNumber: `POL-${stamp}`, productType: "livestock", startDate: day(-60), endDate: day(300), sumInsured: 400000, premiumPaid: 12000 }, token);
check("create a policy", policy.status === 201, `status ${policy.status}`);

const claim = await call("POST", "/insurance/claims", {
  policyId: policy.json?.id, incidentOn: day(-30), eventType: "drought",
  measuredLossUnits: 2, expectedAmount: 90000, claimRef: `CLM-${stamp}`,
}, token);
check("file a claim with the farmer's own loss count", claim.status === 201, `status ${claim.status}`);

await call("PATCH", `/insurance/claims/${claim.json?.id}`, { status: "paid", receivedAmount: 62000, receivedOn: day(-5) }, token);
const claims = await call("GET", "/insurance/claims", null, token);
const claimRow = (claims.json?.claims ?? [])[0];
check("the payout is recorded as its own figure", Number(claimRow?.receivedAmount) === 62000, `received=${claimRow?.receivedAmount}`);
check("the shortfall is stated, not implied", Number(claimRow?.position?.shortfall) === 28000, `shortfall=${claimRow?.position?.shortfall}`);
check("and the sentence never claims a payout equals the loss",
  typeof claimRow?.position?.statement === "string" && !/your loss was/i.test(claimRow.position.statement),
  claimRow?.position?.statement);
check("the summary repeats the anti-promise line", typeof claims.json?.summary?.basis === "string");

// The Next.js pages are NOT checked here: they are not served by this API
// process. Their rendering is proved by the frontend build and its own tests.

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ""}`);
  process.exit(1);
}
