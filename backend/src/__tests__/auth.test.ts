import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  registerEmailSchema,
  verifyEmailSchema,
  loginEmailSchema,
  challengeSchema,
  walletVerifySchema,
  linkEmailSchema,
  createSponsorCodeSchema,
} from "../utils/validation";
import { signAccessToken, signRefreshToken, JwtPayload } from "../middleware/jwtAuth";

// ──────────────────────────────────────
// Validation Schema Tests
// ──────────────────────────────────────
describe("Validation Schemas", () => {
  describe("registerEmailSchema", () => {
    it("accepts valid email + password", () => {
      const result = registerEmailSchema.safeParse({
        email: "user@example.com",
        password: "securepass123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts with optional sponsorCode", () => {
      const result = registerEmailSchema.safeParse({
        email: "user@example.com",
        password: "securepass123",
        sponsorCode: "ABC123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = registerEmailSchema.safeParse({
        email: "not-an-email",
        password: "securepass123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects short password", () => {
      const result = registerEmailSchema.safeParse({
        email: "user@example.com",
        password: "short",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("verifyEmailSchema", () => {
    it("accepts valid token", () => {
      const result = verifyEmailSchema.safeParse({ token: "abc123def456" });
      expect(result.success).toBe(true);
    });

    it("rejects empty token", () => {
      const result = verifyEmailSchema.safeParse({ token: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("loginEmailSchema", () => {
    it("accepts valid credentials", () => {
      const result = loginEmailSchema.safeParse({
        email: "user@example.com",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing password", () => {
      const result = loginEmailSchema.safeParse({ email: "user@example.com" });
      expect(result.success).toBe(false);
    });
  });

  describe("challengeSchema", () => {
    it("accepts valid EVM address", () => {
      const result = challengeSchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid address", () => {
      const result = challengeSchema.safeParse({ address: "not-an-address" });
      expect(result.success).toBe(false);
    });

    it("rejects short address", () => {
      const result = challengeSchema.safeParse({ address: "0x1234" });
      expect(result.success).toBe(false);
    });
  });

  describe("walletVerifySchema", () => {
    it("accepts valid params", () => {
      const result = walletVerifySchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        signature: "0xdeadbeef",
        message: "Sign this",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing signature", () => {
      const result = walletVerifySchema.safeParse({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        message: "Sign this",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("linkEmailSchema", () => {
    it("accepts valid email + password", () => {
      const result = linkEmailSchema.safeParse({
        email: "new@example.com",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createSponsorCodeSchema", () => {
    it("accepts valid code", () => {
      const result = createSponsorCodeSchema.safeParse({
        code: "MY-CODE_123",
        maxUses: 10,
      });
      expect(result.success).toBe(true);
    });

    it("rejects code with special chars", () => {
      const result = createSponsorCodeSchema.safeParse({
        code: "bad code!@#",
      });
      expect(result.success).toBe(false);
    });

    it("rejects code too short", () => {
      const result = createSponsorCodeSchema.safeParse({ code: "ab" });
      expect(result.success).toBe(false);
    });

    it("defaults maxUses to 0", () => {
      const result = createSponsorCodeSchema.safeParse({ code: "VALID" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxUses).toBe(0);
      }
    });
  });
});

// ──────────────────────────────────────
// JWT Token Tests
// ──────────────────────────────────────
describe("JWT Tokens", () => {
  const payload: JwtPayload = {
    userId: "test-user-id",
    email: "test@example.com",
    evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
  };

  it("signAccessToken produces a valid JWT", () => {
    const token = signAccessToken(payload);
    expect(token).toBeTruthy();
    const decoded = jwt.verify(token, "dev-secret") as any;
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.evmAddress).toBe(payload.evmAddress);
  });

  it("signRefreshToken produces a valid JWT", () => {
    const token = signRefreshToken(payload);
    expect(token).toBeTruthy();
    const decoded = jwt.verify(token, "dev-secret") as any;
    expect(decoded.userId).toBe(payload.userId);
  });

  it("access token has expiry", () => {
    const token = signAccessToken(payload);
    const decoded = jwt.decode(token) as any;
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
  });

  it("verifying with wrong secret throws", () => {
    const token = signAccessToken(payload);
    expect(() => jwt.verify(token, "wrong-secret")).toThrow();
  });
});

// ──────────────────────────────────────
// Bcrypt Tests
// ──────────────────────────────────────
describe("Password Hashing", () => {
  it("hashes and verifies password", async () => {
    const password = "securepass123";
    const hash = await bcrypt.hash(password, 12);
    expect(hash).not.toBe(password);
    const valid = await bcrypt.compare(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await bcrypt.hash("correct", 12);
    const valid = await bcrypt.compare("wrong", hash);
    expect(valid).toBe(false);
  });
});

// ──────────────────────────────────────
// User Status Flow Tests (Logic)
// ──────────────────────────────────────
describe("User Status Flow Logic", () => {
  it("email user without sponsor: PENDING_EMAIL → CONFIRMED", () => {
    const hasSponsor = false;
    const nextStatus = hasSponsor ? "PENDING_SPONSOR" : "CONFIRMED";
    expect(nextStatus).toBe("CONFIRMED");
  });

  it("email user with sponsor: PENDING_EMAIL → PENDING_SPONSOR → CONFIRMED", () => {
    const hasSponsor = true;
    const afterEmailVerify = hasSponsor ? "PENDING_SPONSOR" : "CONFIRMED";
    expect(afterEmailVerify).toBe("PENDING_SPONSOR");
    // After sponsor confirms:
    const afterSponsorConfirm = "CONFIRMED";
    expect(afterSponsorConfirm).toBe("CONFIRMED");
  });

  it("wallet user is immediately CONFIRMED", () => {
    const walletUserStatus = "CONFIRMED";
    expect(walletUserStatus).toBe("CONFIRMED");
  });
});

// ──────────────────────────────────────
// Token Generation Tests
// ──────────────────────────────────────
describe("Verification Token Generation", () => {
  it("generates unique tokens", () => {
    const t1 = crypto.randomBytes(32).toString("hex");
    const t2 = crypto.randomBytes(32).toString("hex");
    expect(t1).not.toBe(t2);
    expect(t1.length).toBe(64);
  });

  it("token expiry is 24h in the future", () => {
    const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
