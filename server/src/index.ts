import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { initSentry, flushTelemetry, captureError } from "./lib/sentry.js";

// Routes
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import actionEngineRoutes from "./routes/action-engine.js";
import flocksRoutes from "./routes/flocks.js";
import customersRoutes from "./routes/customers.js";
import transactionsRoutes from "./routes/transactions.js";
import salesRoutes from "./routes/sales.js";
import workersRoutes from "./routes/workers.js";
import inventoryRoutes from "./routes/inventory.js";
import productionRoutes from "./routes/production.js";
import vaccinationsRoutes from "./routes/vaccinations.js";
import attendanceRoutes from "./routes/attendance.js";
import weatherRoutes from "./routes/weather.js";
import aiRoutes from "./routes/ai.js";
import breedingRoutes from "./routes/breeding.js";
import cropsRoutes from "./routes/crops.js";
import invoicesRoutes from "./routes/invoices.js";
import farmsRoutes from "./routes/farms.js";
import auditRoutes from "./routes/audit.js";
import exportRoutes from "./routes/export.js";
import importRoutes from "./routes/import.js";
import settingsRoutes from "./routes/settings.js";
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
import adminCrmRoutes from "./routes/admin-crm.js";
import contactRoutes from "./routes/contact.js";
import siteContentRoutes from "./routes/site-content.js";
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

// ─── Performance & Compression ──────────────────────────────
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
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", actionEngineRoutes); // /actions first, then falls through to the main dashboard router
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/flocks", flocksRoutes);
app.use("/api/flocks", flocksUploadRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/promos", promoRedeemRoutes);
app.use("/api/transactions", idempotencyGuard, transactionsRoutes);
app.use("/api/sales", idempotencyGuard, salesRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/inventory", idempotencyGuard, inventoryRoutes);
app.use("/api/production", idempotencyGuard, productionRoutes);
app.use("/api/vaccinations", idempotencyGuard, vaccinationsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/breeding", breedingRoutes);
app.use("/api/crops", idempotencyGuard, cropsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/quotes", quotesRoutes);
// Public customer-facing quote responses — token-gated, mounted before nothing special:
app.use("/api/quotes-public", quotesPublic);
// Public email click tracking (no auth — it's hit from emails)
app.use("/api/track", trackRoutes);
app.use("/api/farms", farmsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/import", importRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/zkteco", zktecoRoutes);
app.use("/api/worker", workerApiRoutes);
app.use("/api/paystack", paystackRoutes);
app.use("/api/trial", trialRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/deliveries", deliveriesRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/cron", cronAdvisoryRoutes);
app.use("/api/cron", cronLifecycleRoutes);

// ─── Super-Admin API ──────────────────────────────────────
// Stricter limiter: admin login is a high-value brute-force target.
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/admin/login", adminLimiter);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminModulesRoutes);
app.use("/api", supportRoutes);
app.use("/api/admin", adminCrmRoutes);
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
app.listen(PORT, () => {
  // Seed pricing plans once at boot (create-if-missing; DB rows win afterwards)
  seedPlans();
  console.log(`🌱 Wangari API server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || "https://wangari.imeantech.com"}`);
});

export default app;
