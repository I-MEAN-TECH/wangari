/**
 * Google ID-token verification.
 *
 * Extracted from routes/auth.ts, and it deliberately does NOT use Google's
 * tokeninfo endpoint. tokeninfo is an unauthenticated debugging helper: it
 * answers HTTP 400 "Invalid Value" for reasons that have nothing to do with
 * whether the token is good (it is rate limited, it is stricter than the spec,
 * and it gives us one opaque 401 for "expired", "wrong audience", "not a JWT"
 * and "Google is having a bad day" alike). Every one of those looked identical
 * to the farmer: a bare 401 on the Google button with nothing to act on.
 *
 * Instead we verify what the token actually asserts, locally, against Google's
 * published signing keys:
 *   1. RS256 signature, using the JWKS key named by the token's own `kid`
 *   2. `iss` is a Google issuer
 *   3. `aud` is OUR client id (an ID token is only for the app it was issued to)
 *   4. `exp` has not passed (jsonwebtoken does this for us)
 * and each failure carries its own machine-readable reason so the server can
 * log exactly what went wrong and the client can show something actionable.
 */

import jwt, { type JwtHeader, type JwtPayload, type Secret } from "jsonwebtoken";
import crypto from "crypto";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Both spellings Google uses for the issuer of a web sign-in ID token. */
const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

export type GoogleVerifyFailure =
  | "malformed"
  | "unsupported_alg"
  | "unknown_kid"
  | "bad_signature"
  | "bad_issuer"
  | "audience_mismatch"
  | "expired";

export interface GoogleTokenFailure {
  ok: false;
  reason: GoogleVerifyFailure;
  /** Safe to log: never includes the token itself. */
  detail?: string;
}

export interface GoogleTokenSuccess {
  ok: true;
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  aud: string;
}

export type GoogleTokenResult = GoogleTokenSuccess | GoogleTokenFailure;

export interface GoogleJwks {
  keys: Array<{
    kid?: string;
    kty?: string;
    alg?: string;
    use?: string;
    n?: string;
    e?: string;
  }>;
}

/** Google's JWKS rotates rarely; cache it briefly so every sign-in is offline. */
const JWKS_TTL_MS = 60 * 60_000;
let cached: { keys: GoogleJwks["keys"]; fetchedAt: number } | null = null;
let inflight: Promise<GoogleJwks["keys"]> | null = null;

/**
 * Fetch (and cache) Google's public signing keys. `now` is injectable so tests
 * can drive the cache-expiry path without waiting an hour.
 */
export async function getGoogleJwks(
  now: number = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<GoogleJwks["keys"]> {
  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  // Collapse a stampede of concurrent sign-ins into a single upstream request.
  if (!inflight) {
    const requestedAt = now;
    inflight = (async () => {
      const res = await fetchImpl(GOOGLE_JWKS_URL, {
        headers: { Accept: "application/json" },
        // Google rotates keys; never let a proxy hand us a stale copy forever.
        cache: "no-store",
      } as RequestInit);
      if (!res.ok) throw new Error(`Google JWKS fetch failed (HTTP ${res.status})`);
      const body = (await res.json()) as GoogleJwks;
      if (!Array.isArray(body?.keys) || body.keys.length === 0) {
        throw new Error("Google JWKS response contained no keys");
      }
      // Stamp with the caller's clock so an injected `now` drives cache expiry.
      cached = { keys: body.keys, fetchedAt: requestedAt };
      return body.keys;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Drop the cached keys. Exported for tests and for an operator force-refresh. */
export function resetGoogleJwksCache(): void {
  cached = null;
}

/**
 * The subset of a JWK Node's createPublicKey needs. Declared locally because
 * the global `JsonWebKey` type is not available without the DOM lib, and
 * @types/node's `crypto.JsonWebKey` is not exported from this version.
 */
interface NodeJwk {
  kty: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

/**
 * Turn a JWK into something jsonwebtoken can verify with. Node's crypto can
 * consume a JWK directly, but jsonwebtoken wants a PEM, so convert.
 */
export function jwkToPublicKey(jwk: GoogleJwks["keys"][number]): Secret {
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error(`Unsupported JWK kty=${jwk.kty}`);
  }
  const key = crypto.createPublicKey({ key: jwk as unknown as NodeJwk, format: "jwk" });
  return key.export({ type: "spki", format: "pem" }) as string;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Read the header and payload WITHOUT verifying anything, so we know which
 * key to verify with. Nothing read here is trusted: the only thing that makes a
 * caller proceed is a successful signature check further down.
 */
export function decodeUnverified(
  token: string
): { header: JwtHeader; payload: JwtPayload } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return null;
  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);
  if (!header || !payload) return null;
  return { header: header as unknown as JwtHeader, payload: payload as JwtPayload };
}

/**
 * Verify a Google ID token and return the identity it asserts.
 *
 * `expectedClientId` is the aud we require. Pass the server's
 * GOOGLE_CLIENT_ID so a token minted for a different app (a dev client left in
 * a stale bundle, say) is rejected loudly instead of silently.
 */
export async function verifyGoogleIdToken(
  token: unknown,
  expectedClientId: string | undefined,
  deps: {
    now?: number;
    getKeys?: (now: number) => Promise<GoogleJwks["keys"]>;
  } = {}
): Promise<GoogleTokenResult> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed", detail: "credential was not a non-empty string" };
  }

  const decoded = decodeUnverified(token);
  if (!decoded) return { ok: false, reason: "malformed", detail: "not a three-part JWS" };
  const { header, payload } = decoded;

  // "none" and HMAC-signed tokens must never be honoured: the classic JWT
  // confusion attack. Only RS256, which is all Google issues.
  if (header.alg !== "RS256") {
    return { ok: false, reason: "unsupported_alg", detail: `alg=${String(header.alg)}` };
  }
  if (!header.kid) return { ok: false, reason: "malformed", detail: "header had no kid" };

  const nowMs = deps.now ?? Date.now();
  let keys: GoogleJwks["keys"];
  try {
    keys = await (deps.getKeys ?? getGoogleJwks)(nowMs);
  } catch (err) {
    // Cannot verify => cannot trust. Never fail open.
    return {
      ok: false,
      reason: "unknown_kid",
      detail: `could not load Google signing keys: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    return { ok: false, reason: "unknown_kid", detail: `kid=${header.kid}` };
  }

  let publicKey: Secret;
  try {
    publicKey = jwkToPublicKey(jwk);
  } catch (err) {
    return {
      ok: false,
      reason: "unknown_kid",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let verified: JwtPayload;
  try {
    verified = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      // jsonwebtoken checks exp/nbf for us; give it no clock slack beyond the
      // small window Google itself allows for drift.
      clockTolerance: 5,
      clockTimestamp: Math.floor(nowMs / 1000),
    }) as JwtPayload;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TokenExpiredError") return { ok: false, reason: "expired" };
    return {
      ok: false,
      reason: "bad_signature",
      detail: name || "signature verification failed",
    };
  }

  if (!GOOGLE_ISSUERS.has(String(verified.iss))) {
    return { ok: false, reason: "bad_issuer", detail: `iss=${String(verified.iss)}` };
  }

  const aud = String(verified.aud ?? "");
  // When an ID token lists several audiences, `azp` names the one it was
  // actually minted for. Accept either signal, reject when neither matches.
  const authorizedParty = typeof verified.azp === "string" ? verified.azp : undefined;
  if (expectedClientId && aud !== expectedClientId && authorizedParty !== expectedClientId) {
    return {
      ok: false,
      reason: "audience_mismatch",
      detail: `token aud=${aud || "(none)"} expected=${expectedClientId}`,
    };
  }

  if (!verified.sub || !verified.email) {
    return { ok: false, reason: "malformed", detail: "verified token had no sub or email" };
  }

  return {
    ok: true,
    sub: String(verified.sub),
    email: String(verified.email),
    // Google sends `email_verified` as a boolean in ID tokens; tokeninfo sends
    // the string "true". Accept both, treat anything else as unverified.
    emailVerified: verified.email_verified === true || verified.email_verified === "true",
    name: typeof verified.name === "string" ? verified.name : undefined,
    picture: typeof verified.picture === "string" ? verified.picture : undefined,
    aud,
  };
}

