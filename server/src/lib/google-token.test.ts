import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  verifyGoogleIdToken,
  decodeUnverified,
  jwkToPublicKey,
  getGoogleJwks,
  resetGoogleJwksCache,
  type GoogleJwks,
} from "./google-token.js";

/**
 * These tests sign real RS256 tokens with a real RSA key and verify them against
 * a matching JWK. Nothing is stubbed: if the verifier stopped checking
 * signatures, every "rejects" case below would start passing a forged token
 * and these tests would fail.
 */

const KID = "test-key-1";
const CLIENT_ID = "130893240175-test.apps.googleusercontent.com";
const OTHER_CLIENT_ID = "999999999999-dev.apps.googleusercontent.com";

const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk: GoogleJwks["keys"][number] = {
  ...(keyPair.publicKey.export({ format: "jwk" }) as Record<string, string>),
  kid: KID,
  alg: "RS256",
  use: "sig",
};

const KEYS: GoogleJwks["keys"] = [publicJwk];
const getKeys = async () => KEYS;

// Fixed instant so `exp` maths is deterministic.
const NOW = Date.parse("2026-10-04T12:00:00.000Z");

interface Claims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  azp?: string;
  exp?: number;
  iat?: number;
}

function sign(claims: Claims = {}, header: Record<string, unknown> = {}) {
  const payload: Claims = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "100000000000000000001",
    email: "farmer@gmail.com",
    email_verified: true,
    name: "A Farmer",
    picture: "https://lh3.googleusercontent.com/a/photo",
    iat: Math.floor(NOW / 1000) - 60,
    ...claims,
  };
  const iatSec = Math.floor(NOW / 1000) - 60;
  // jsonwebtoken derives `exp` from expiresIn relative to iat; set it absolutely.
  (payload as Record<string, unknown>).exp = claims.exp ?? iatSec + 3600;
  return jwt.sign(payload, keyPair.privateKey, {
    algorithm: "RS256",
    keyid: KID,
    header,
  });
}

const verify = (token: unknown, expected: string | undefined = CLIENT_ID) =>
  verifyGoogleIdToken(token, expected, { now: NOW, getKeys });

beforeEach(() => {
  resetGoogleJwksCache();
});

describe("decodeUnverified", () => {
  it("reads the header of a well-formed JWS", () => {
    const decoded = decodeUnverified(sign());
    expect(decoded?.header.alg).toBe("RS256");
    expect(decoded?.header.kid).toBe(KID);
    expect(decoded?.payload.email).toBe("farmer@gmail.com");
  });

  it("returns null for things that are not a three-part JWS", () => {
    expect(decodeUnverified("")).toBeNull();
    expect(decodeUnverified("not-a-token")).toBeNull();
    expect(decodeUnverified("a.b")).toBeNull();
    expect(decodeUnverified("a.b.c.d")).toBeNull();
    expect(decodeUnverified("a..c")).toBeNull();
    expect(decodeUnverified("!!!.###.$$$")).toBeNull();
  });
});

describe("jwkToPublicKey", () => {
  it("produces a usable SPKI PEM for an RSA JWK", () => {
    const pem = jwkToPublicKey(publicJwk) as string;
    expect(pem).toContain("BEGIN PUBLIC KEY");
    // Round-trips: the PEM verifies something the JWK signed.
    //
    // `clockTimestamp` is required, not decorative. `sign()` derives `exp`
    // from the FIXED `NOW` above so the rest of the suite is
    // deterministic, but a bare `jwt.verify` checks expiry against the
    // real wall clock — so this assertion silently started failing once
    // NOW fell into the past, which is a test bug about time, not a bug
    // in jwkToPublicKey. Verifying at NOW keeps the assertion about the
    // PEM being usable.
    const token = sign();
    expect(() =>
      jwt.verify(token, pem, { algorithms: ["RS256"], clockTimestamp: Math.floor(NOW / 1000) })
    ).not.toThrow();
  });

  it("refuses a non-RSA JWK rather than guessing", () => {
    expect(() => jwkToPublicKey({ kty: "oct", k: "AAAA" })).toThrow(/Unsupported JWK/);
  });
});

describe("verifyGoogleIdToken — accepts a genuine token", () => {
  it("returns the identity from a correctly signed, unexpired token", async () => {
    const result = await verify(sign());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sub).toBe("100000000000000000001");
    expect(result.email).toBe("farmer@gmail.com");
    expect(result.emailVerified).toBe(true);
    expect(result.name).toBe("A Farmer");
    expect(result.aud).toBe(CLIENT_ID);
  });

  it("accepts the bare accounts.google.com issuer spelling", async () => {
    const result = await verify(sign({ iss: "accounts.google.com" }));
    expect(result.ok).toBe(true);
  });

  it("accepts email_verified sent as the string \"true\"", async () => {
    const result = await verify(sign({ email_verified: "true" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailVerified).toBe(true);
  });

  it("accepts a multi-audience token whose azp names our client", async () => {
    const result = await verify(sign({ aud: [CLIENT_ID, OTHER_CLIENT_ID], azp: CLIENT_ID }));
    expect(result.ok).toBe(true);
  });

  it("skips the audience check when no client id is configured", async () => {
    // Called directly, because `verify`'s default parameter would silently
    // substitute CLIENT_ID for an explicit undefined.
    const result = await verifyGoogleIdToken(sign({ aud: OTHER_CLIENT_ID }), undefined, {
      now: NOW,
      getKeys,
    });
    expect(result.ok).toBe(true);
  });

  it("tolerates a token that expired moments ago (clock drift)", async () => {
    const justExpired = Math.floor(NOW / 1000) - 2;
    const result = await verify(sign({ exp: justExpired }));
    expect(result.ok).toBe(true);
  });
});

describe("verifyGoogleIdToken — rejects", () => {
  it("rejects a non-string credential", async () => {
    for (const bad of [undefined, null, "", 42, {}, []]) {
      const result = await verify(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("malformed");
    }
  });

  it("rejects garbage that is not a JWS", async () => {
    const result = await verify("not-a-token");
    expect(result).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("rejects an unsigned (\"none\") token — the JWT confusion attack", async () => {
    // Hand-built so jsonwebtoken refuses to sign it, mimicking an attacker.
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged =
      enc({ alg: "none", typ: "JWT", kid: KID }) +
      "." +
      enc({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "attacker",
        email: "attacker@gmail.com",
        email_verified: true,
        exp: Math.floor(NOW / 1000) + 3600,
      }) +
      "." +
      // A junk signature segment, so the token survives structural parsing and
      // reaches the algorithm check — the check that must reject it.
      "AAAA";
    const result = await verify(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported_alg");
  });

  it("rejects an HS256 token signed with the public key as the secret", async () => {
    // The other half of the confusion attack.
    const pem = jwkToPublicKey(publicJwk) as string;
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "attacker",
        email: "attacker@gmail.com",
        email_verified: true,
        exp: Math.floor(NOW / 1000) + 3600,
      },
      pem,
      { algorithm: "HS256", keyid: KID }
    );
    const result = await verify(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported_alg");
  });

  it("rejects a token signed by a different RSA key that claims our kid", async () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "attacker",
        email: "attacker@gmail.com",
        email_verified: true,
        exp: Math.floor(NOW / 1000) + 3600,
      },
      other.privateKey,
      { algorithm: "RS256", keyid: KID }
    );
    const result = await verify(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects an expired token", async () => {
    const result = await verify(sign({ exp: Math.floor(NOW / 1000) - 120 }));
    expect(result).toMatchObject({ ok: false, reason: "expired" });
  });

  it("rejects a token for a different client id", async () => {
    // This is the failure that was previously undiagnosable.
    const result = await verify(sign({ aud: OTHER_CLIENT_ID }));
    expect(result).toMatchObject({ ok: false, reason: "audience_mismatch" });
    if (!result.ok) expect(result.detail).toContain(OTHER_CLIENT_ID);
    if (!result.ok) expect(result.detail).toContain(CLIENT_ID);
  });

  it("rejects an issuer that is not Google", async () => {
    const result = await verify(sign({ iss: "https://evil.example" }));
    expect(result).toMatchObject({ ok: false, reason: "bad_issuer" });
  });

  it("rejects a Google-issued token with no subject or email", async () => {
    const result = await verify(sign({ email: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects a token whose kid Google never published", async () => {
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "x",
        email: "x@gmail.com",
        exp: Math.floor(NOW / 1000) + 3600,
      },
      keyPair.privateKey,
      { algorithm: "RS256", keyid: "rotated-away" }
    );
    const result = await verify(token);
    expect(result).toMatchObject({ ok: false, reason: "unknown_kid" });
  });

  it("fails closed when the signing keys cannot be fetched", async () => {
    const result = await verifyGoogleIdToken(sign(), CLIENT_ID, {
      now: NOW,
      getKeys: async () => {
        throw new Error("network down");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain("network down");
  });

  it("never leaks the raw token in its failure detail", async () => {
    const token = sign({ aud: OTHER_CLIENT_ID });
    const result = await verify(token);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(token.split(".")[1]);
  });
});

describe("getGoogleJwks", () => {
  it("fetches once and serves later calls from cache", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ keys: KEYS }), { status: 200 });
    }) as unknown as typeof fetch;

    await getGoogleJwks(NOW, fetchImpl);
    await getGoogleJwks(NOW + 60_000, fetchImpl);
    expect(calls).toBe(1);

    // Past the TTL it refetches, so Google's key rotation is picked up.
    await getGoogleJwks(NOW + 60 * 60_000 + 1, fetchImpl);
    expect(calls).toBe(2);
  });

  it("collapses concurrent callers into one upstream request", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ keys: KEYS }), { status: 200 });
    }) as unknown as typeof fetch;

    await Promise.all([
      getGoogleJwks(NOW, fetchImpl),
      getGoogleJwks(NOW, fetchImpl),
      getGoogleJwks(NOW, fetchImpl),
    ]);
    expect(calls).toBe(1);
  });

  it("throws on an upstream error so the caller can fail closed", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(getGoogleJwks(NOW, fetchImpl)).rejects.toThrow(/JWKS fetch failed/);
  });

  it("throws when Google returns an empty key set", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ keys: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(getGoogleJwks(NOW, fetchImpl)).rejects.toThrow(/no keys/);
  });
});

describe("non-vacuity", () => {
  it("would fail if verification were stubbed to always succeed", async () => {
    // Proves the suite is not passing because every case is a no-op: a fake
    // "verify everything" implementation is caught by these same assertions.
    const forged = await verify("total-nonsense");
    expect(forged.ok).toBe(false);
    const good = await verify(sign());
    expect(good.ok).toBe(true);
  });
});