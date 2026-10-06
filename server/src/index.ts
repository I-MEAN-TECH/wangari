import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { initSentry, flushTelemetry, captureError } from "./lib/sentry.js";
import { ipGuard } from "./middleware/ipGuard.js";

// Routes
import authRoutes from "./routes/auth.js";
import authPhoneRoutes from "./routes/auth-phone.js";
import dashboardRoutes from "./routes/dashboard.js";
import actionEngineRoutes from "./routes/action-engine.js";
import cronWeeklyRoutes from "./routes/cron-weekly.js";
import flocksRoutes from "./routes/flocks.js";
import animalsRoutes from "./routes/animals.js";
import hivesRoutes from "./routes/hives.js";
import customersRoutes from "./routes/customers.js";
import transactionsRoutes from "./routes/transactions.js";
import salesRoutes from "./routes/sales.js";
import workersRoutes from "./routes/workers.js";
import inventoryRoutes from "./routes/inventory.js";
import productionRoutes from "./routes/production.js";
import vaccinationsRoutes from "./routes/vaccinations.js";
import healthRoutes from "./routes/health.js";
import insuranceRoutes from "./routes/insurance.js";
import marketPriceRoutes from "./routes/market-price.js";
import coldChainRoutes from "./routes/cold-chain.js";
import coopRoutes from "./routes/coop.js";
import attendanceRoutes from "./routes/attendance.js";
import weatherRoutes from "./routes/weather.js";
import aiRoutes from "./routes/ai.js";
import aiIntakeRoutes from "./routes/ai-intake.js";
import breedingRoutes from "./routes/breeding.js";
import cropsRoutes from "./routes/crops.js";
import cropPlannerRoutes from "./routes/crop-planner.js";
import profitabilityRoutes from "./routes/profitability.js";
import invoicesRoutes from "./routes/invoices.js";
import farmsRoutes from "./routes/farms.js";
import auditRoutes from "./routes/audit.js";
import exportRoutes from "./routes/export.js";
import farmRecordRoutes from "./routes/farm-record.js";
import importRoutes from "./routes/import.js";
import settingsRoutes from "./routes/settings.js";
import kiamisRoutes from "./routes/kiamis.js";
import zktecoRoutes from "./routes/zkteco.js";
import workerApiRoutes from "./routes/worker.js";
import flocksUploadRoutes from "./routes/flocks-upload.js";
import uploadRoutes from "./routes/upload.js";
import paystackRoutes from "./routes/paystack.js";
import trialRoutes from "./routes/trial.js";
import cronRoutes from "./routes/cron.js";
import plansRoutes from "./routes/plans.js";
import deliveriesRoutes from "./routes/deliveries.js";import documentsRoutes from "./routes/documents.js";
import quotesRoutes from "./routes/quotes.js";
import { quotesPublic } from "./routes/quotes.js";
import trackRoutes from "./routes/track.js";
import adminRoutes from "./routes/admin.js";
import cronAdvisoryRoutes from "./routes/cron-advisory.js";
import cronLifecycleRoutes from "./routes/cron-lifecycle.js";
import adminModulesRoutes from "./routes/admin-modules.js";
import supportRoutes from "./routes/support.js";
import promoRedeemRoutes from "./routes/promo-redeem.js";
import { idempotencyGuard } from "./middleware/idempotency.js";
import { planGate } from "./middleware/plan-gate.js";
import feedbackRoutes from "./routes/feedback.js";
import adminFeedbackRoutes from "./routes/admin-feedback.js";
import adminCrmRoutes from "./routes/admin-crm.js";
import adminAiRoutes from "./routes/admin-ai.js";
import adminIpRoutes from "./routes/admin-ip.js";
import contactRoutes from "./routes/contact.js";
import siteContentRoutes from "./routes/site-content.js";
import activationRoutes from "./routes/activation.js";
import { seedPlans } from "./lib/seed-plans.js";

// ─── Process-Level Crash Safety ────────────────────────────
// One bad async call must not kill the PM2 process silently.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  captureError(reason, { kind: "unhandledRejection" });
  // Log and keep serving — rejections are recoverable.
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  captureError(err, { kind: "uncaughtException" });
  // Unknown state — exit and let PM2 restart us cleanly.
  flushTelemetry().finally(() => process.exit(1));
});

const app = express();
initSentry(); // no-op unless SENTRY_DSN is set

// Behind nginx on the VPS — required for express-rate-limit to identify
// clients correctly from X-Forwarded-For (silences ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
// Bind address. Production sits behind nginx on the shared VPS, where the
// tenancy contract requires the app port to be reachable ONLY from
// localhost — nginx must stay the single public listener, so an app that
// binds 0.0.0.0 would expose the API directly and bypass TLS, the security
// headers and the rate limiting nginx provides. Defaults to loopback.
// Local dev overrides with HOST=0.0.0.0 when it needs LAN access.
const HOST = process.env.HOST || "127.0.0.1";

// ─── Performance & Compression ──────────────────────────────
// ─── IP access control ───────────────────────────────────
// Ahead of the rate limiter and every router on purpose. A block is only worth
// having if a hostile request never reaches bcrypt or Prisma — and it must not
// be able to consume a rate-limit token either, or a scan could exhaust the
// quota of the address it is pretending to be.
//
// Fails open if the rule table is unreachable; see lib/ip-rules.ts.
app.use(ipGuard);

app.use(compression());

// ─── Security ─────────────────────────────────────────────
app.use(helmet({ crossOriginOpenerPolicy: false }));
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://wangari.imeantech.com",
  // Local development (any port) — matches only pages actually served from
  // localhost/127.0.0.1, so it cannot be abused by third-party sites.
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = non-browser client (curl, device, server-to-server).
      if (!origin || allowedOrigins.some((o) => (typeof o === "string" ? o === origin : o.test(origin)))) {
        return cb(null, true);
      }
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Rate Limiting ────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/", limiter);

// ─── Stricter Brute-Force Limiter for Auth ─────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/worker/login", authLimiter);
// OTP endpoints: tighter than authLimiter — 10 guesses / 15 min per IP on top
// of the per-code 5-attempt burn. (Pentest hardening.)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});
app.use("/api/auth/verify-email", otpLimiter);
// Phone + PIN (gap-analysis row 0). Mounted HERE rather than beside the other
// auth limiters because otpLimiter is a const declared above this line: an
// earlier version referenced it 10 lines earlier and the process died on boot
// with a temporal-dead-zone ReferenceError.
//
// The tighter otpLimiter is deliberate. A 4-digit PIN has 10,000 combinations,
// so IP-level throttling alone is not enough — it would lock out a whole
// village behind one NAT address while doing nothing about a targeted sweep at
// one account. The per-phone counter in auth-phone.ts does the real work.
app.use("/api/auth/login-phone", otpLimiter);
app.use("/api/auth/register-phone", authLimiter);
app.use("/api/auth/pin", otpLimiter);
// Promo redemption: prevent code-guessing/enumeration via rapid attempts.
app.use("/api/promos", otpLimiter);

// ─── Body Parsing ─────────────────────────────────────────
// Paystack webhook needs the RAW body to verify the HMAC signature — mount before express.json.
app.use("/api/paystack/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static("uploads"));

// ─── Health Check ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────
// Plan-tier gate: enforces Starter vs Growth module limits on the server
// (the sidebar padlocks from /api/trial/status are only cosmetic). Mounted
// before every module router; skips routes it doesn't gate.
app.use("/api", planGate);
app.use("/api/auth", authRoutes);
// Phone + PIN, on its own mount BEFORE /api/auth so its /register-phone,
// /login-phone and /pin/change paths win over anything in authRoutes that
// might otherwise swallow them.
app.use("/api/auth", authPhoneRoutes);
app.use("/api/dashboard", actionEngineRoutes); // /actions first, then falls through to the main dashboard router
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/flocks", flocksRoutes);
app.use("/api/flocks", flocksUploadRoutes);
// ANITRAC animal identity.
//
// Mounted on its OWN path, not under /api/flocks: flocksRoutes defines
// GET /:id, so a nested mount would let "animals" be parsed as a flock id and
// silently 404. /api/animals keeps the routes unambiguous.
app.use("/api/animals", animalsRoutes);
// Beekeeping: the hive is the unit, never the bee.
app.use("/api/hives", hivesRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/promos", promoRedeemRoutes);
app.use("/api/transactions", idempotencyGuard, transactionsRoutes);
app.use("/api/sales", idempotencyGuard, salesRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/inventory", idempotencyGuard, inventoryRoutes);
app.use("/api/production", idempotencyGuard, productionRoutes);
app.use("/api/vaccinations", idempotencyGuard, vaccinationsRoutes);
// ─── Gap closures, October 2026 ──────────────────────────────────────────
// Per-animal health and disease log (row 5). Own path for the same reason
// /api/animals has its own: vaccinationsRoutes has no GET /:id, but keeping
// health beside vaccinations in one namespace invites a future collision.
app.use("/api/health-records", idempotencyGuard, healthRoutes);
// Index-insurance policy register (row 13).
app.use("/api/insurance", insuranceRoutes);
// Market price benchmark (row 14).
app.use("/api/market-prices", idempotencyGuard, marketPriceRoutes);
// Cold chain readings (row 15).
app.use("/api/cold-chain", idempotencyGuard, coldChainRoutes);
// Co-op / group mode + bulk onboarding (rows 11, 17). Must be mounted BEFORE
// any /api/:something that could parse "coop" as an id, and it defines
// GET /invites/:code which must precede GET /:id.
app.use("/api/coop", coopRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/ai/intake", aiIntakeRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/breeding", breedingRoutes);
app.use("/api/crops", idempotencyGuard, cropPlannerRoutes);
app.use("/api/profitability", profitabilityRoutes); // /planner routes before the main crops router
app.use("/api/crops", idempotencyGuard, cropsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/quotes", quotesRoutes);
// Public customer-facing quote responses — token-gated, mounted before nothing special:
app.use("/api/quotes-public", quotesPublic);
// Public email click tracking (no auth — it's hit from emails)
app.use("/api/track", trackRoutes);
app.use("/api/farms", farmsRoutes);
app.use("/api/audit", auditRoutes);
// The bankable-farm proof layer: farmer-initiated, read-only, never auto-shared.
app.use("/api/farm-record", farmRecordRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/import", importRoutes);
app.use("/api/settings", settingsRoutes);
// M2 groundwork — KIAMIS-shaped registration export, owner-only.
app.use("/api/kiamis", kiamisRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/zkteco", zktecoRoutes);
app.use("/api/worker", workerApiRoutes);
app.use("/api/paystack", paystackRoutes);
app.use("/api/trial", trialRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/deliveries", idempotencyGuard, deliveriesRoutes);
// Activation heartbeat. planGate only gates the prefixes in its ROUTE_MODULE
// map, and /api/activation is not one of them — so this keeps working for a
// farmer whose trial has lapsed. That matters: silently dropping the return
// signal for exactly the people who stopped paying is how a funnel starts
// reporting an improvement that is really a measurement gap.
app.use("/api/activation", activationRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/cron", cronAdvisoryRoutes);
app.use("/api/cron", cronLifecycleRoutes);
app.use("/api/cron", cronWeeklyRoutes);

// ─── Super-Admin API ──────────────────────────────────────
// Stricter limiter: admin login is a high-value brute-force target.
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/admin/login", adminLimiter);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminModulesRoutes);
app.use("/api", supportRoutes);
app.use("/api/admin", adminCrmRoutes);
// AI model registry. Mounted AFTER the other admin routers so a future
// /api/admin/ai/:id route here cannot shadow a same-named path elsewhere.
app.use("/api/admin/ai", adminAiRoutes);
// A sibling prefix, so neither router can shadow the other: /api/admin/ai
// matches /api/admin/ai/** only, and never /api/admin/ip.
app.use("/api/admin/ip", adminIpRoutes);
// What farmers told us. Read-only, so support roles may read it.
app.use("/api/admin/feedback", adminFeedbackRoutes);

// ─── Feedback (public) ────────────────────────────────────
// Unauthenticated on purpose: the shareable link is filled in mostly by people
// who are not users yet, and at an expo booth that is almost everyone. It gets
// its own tighter limiter because the global /api/ limiter (100/15min) is far
// too generous for an anonymous write endpoint — one phone on a loop could fill
// the table and, worse, skew the very numbers we opened the form to measure.
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});
app.use("/api/feedback", feedbackLimiter, feedbackRoutes);

app.use("/api", contactRoutes);
app.use("/api", siteContentRoutes);

// ─── 404 Handler ──────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error Handler ────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  captureError(err, { path: req.path, method: req.method });
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

// ─── Graceful shutdown — flush telemetry ──────────────────
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    flushTelemetry().finally(() => process.exit(0));
  });
}

// ─── Start Server ─────────────────────────────────────────
app.listen(Number(PORT), HOST, () => {
  // Seed pricing plans once at boot (create-if-missing; DB rows win afterwards)
  seedPlans();
  console.log(`🌱 Wangari API server running on ${HOST}:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}`);
});

export default app;
