/**
 * Auth Integration Tests
 *
 * Tests the actual auth API endpoints against the real database.
 * Requires DATABASE_URL to be set (uses test/dev database).
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { ethers } from "ethers";
import { PrismaClient } from "@prisma/client";

const API_BASE = `http://localhost:${process.env.PORT || 3001}`;
const prisma = new PrismaClient();

// Test wallets (deterministic from known private keys)
const wallet1 = new ethers.Wallet("0x0000000000000000000000000000000000000000000000000000000000000001");
const wallet2 = new ethers.Wallet("0x0000000000000000000000000000000000000000000000000000000000000002");
const wallet3 = new ethers.Wallet("0x0000000000000000000000000000000000000000000000000000000000000003");

// Helper to call API
async function api(path: string, body?: any, headers?: Record<string, string>): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE}/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function apiGet(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

describe("Auth Integration Tests", () => {
  let bootstrapSponsorCode: string;

  beforeAll(async () => {
    // Ensure bootstrap sponsor exists
    const sponsor = await prisma.sponsorCode.findFirst({ where: { active: true } });
    if (!sponsor) {
      const user = await prisma.user.create({
        data: { evmAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", status: "CONFIRMED", authMethod: "WALLET" },
      });
      const sc = await prisma.sponsorCode.create({
        data: { userId: user.id, code: "TEST-SPONSOR", maxUses: 0 },
      });
      bootstrapSponsorCode = sc.code;
    } else {
      bootstrapSponsorCode = sponsor.code;
    }

    // Clean up test wallets from prior runs
    const testAddrs = [wallet1.address, wallet2.address, wallet3.address].map((a) => a.toLowerCase());
    await prisma.loginSession.deleteMany({ where: { user: { evmAddress: { in: testAddrs } } } });
    await prisma.sponsorCode.deleteMany({ where: { user: { evmAddress: { in: testAddrs } } } });
    await prisma.user.deleteMany({ where: { evmAddress: { in: testAddrs } } });
    await prisma.user.deleteMany({ where: { email: { in: ["test-int@example.com", "test-dup@example.com"] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════
  // WALLET REGISTRATION
  // ═══════════════════════════
  describe("Wallet Registration", () => {
    it("should register a new user via wallet", async () => {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${wallet1.address}\nTimestamp: ${timestamp}`;
      const signature = await wallet1.signMessage(message);

      const { status, data } = await api("/register/wallet", {
        address: wallet1.address,
        signature,
        message,
        sponsorCode: bootstrapSponsorCode,
      });

      expect(status).toBe(201);
      expect(data.accessToken).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();
      expect(data.user.evmAddress).toBe(wallet1.address.toLowerCase());
      expect(data.user.status).toBe("CONFIRMED");
    });

    it("should reject duplicate wallet registration", async () => {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${wallet1.address}\nTimestamp: ${timestamp}`;
      const signature = await wallet1.signMessage(message);

      const { status } = await api("/register/wallet", {
        address: wallet1.address,
        signature,
        message,
        sponsorCode: bootstrapSponsorCode,
      });

      expect(status).toBe(409);
    });

    it("should reject invalid signature", async () => {
      const message = `Sign this message\n\nAddress: ${wallet2.address}`;
      // Sign with wallet1 but claim wallet2
      const signature = await wallet1.signMessage(message);

      const { status } = await api("/register/wallet", {
        address: wallet2.address,
        signature,
        message,
        sponsorCode: bootstrapSponsorCode,
      });

      expect(status).toBe(401);
    });

    it("should reject invalid sponsor code", async () => {
      const message = `Sign this message\n\nAddress: ${wallet2.address}`;
      const signature = await wallet2.signMessage(message);

      const { status, data } = await api("/register/wallet", {
        address: wallet2.address,
        signature,
        message,
        sponsorCode: "NONEXISTENT-CODE",
      });

      expect(status).toBe(400);
      expect(data.error).toContain("Invalid");
    });

    it("should auto-create sponsor code for new user", async () => {
      const user = await prisma.user.findFirst({
        where: { evmAddress: wallet1.address.toLowerCase() },
        include: { sponsorCodes: true },
      });
      expect(user).toBeTruthy();
      expect(user!.sponsorCodes.length).toBeGreaterThan(0);
    });

    it("should accept wallet address as sponsor reference", async () => {
      const sponsorAddr = wallet1.address; // registered above
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${wallet2.address}`;
      const signature = await wallet2.signMessage(message);

      const { status, data } = await api("/register/wallet", {
        address: wallet2.address,
        signature,
        message,
        sponsorCode: sponsorAddr,
      });

      expect(status).toBe(201);
      expect(data.user.evmAddress).toBe(wallet2.address.toLowerCase());
    });
  });

  // ═══════════════════════════
  // WALLET LOGIN
  // ═══════════════════════════
  describe("Wallet Login", () => {
    it("should issue challenge and verify login", async () => {
      // Step 1: Get challenge
      const { status: cs, data: challenge } = await api("/login/wallet/challenge", {
        address: wallet1.address,
      });
      expect(cs).toBe(200);
      expect(challenge.message).toContain("BitTON.AI");
      expect(challenge.nonce).toBeTruthy();

      // Step 2: Sign and verify
      const signature = await wallet1.signMessage(challenge.message);
      const { status: vs, data: verify } = await api("/login/wallet/verify", {
        address: wallet1.address,
        signature,
        message: challenge.message,
      });
      expect(vs).toBe(200);
      expect(verify.accessToken).toBeTruthy();
      expect(verify.refreshToken).toBeTruthy();
      expect(verify.user.evmAddress).toBe(wallet1.address.toLowerCase());
    });

    it("should reject wrong message (not matching challenge)", async () => {
      const { data: challenge } = await api("/login/wallet/challenge", {
        address: wallet1.address,
      });

      const wrongMessage = "I am signing a totally different message";
      const signature = await wallet1.signMessage(wrongMessage);

      const { status } = await api("/login/wallet/verify", {
        address: wallet1.address,
        signature,
        message: wrongMessage,
      });
      expect(status).toBe(401);
    });

    it("should reject unregistered wallet login", async () => {
      const { data: challenge } = await api("/login/wallet/challenge", {
        address: wallet3.address,
      });

      const signature = await wallet3.signMessage(challenge.message);
      const { status } = await api("/login/wallet/verify", {
        address: wallet3.address,
        signature,
        message: challenge.message,
      });
      expect(status).toBe(404);
    });
  });

  // ═══════════════════════════
  // TOKEN REFRESH & LOGOUT
  // ═══════════════════════════
  describe("Token Refresh & Logout", () => {
    let refreshToken: string;
    let accessToken: string;

    beforeAll(async () => {
      const { data: challenge } = await api("/login/wallet/challenge", {
        address: wallet1.address,
      });
      const signature = await wallet1.signMessage(challenge.message);
      const { data } = await api("/login/wallet/verify", {
        address: wallet1.address,
        signature,
        message: challenge.message,
      });
      refreshToken = data.refreshToken;
      accessToken = data.accessToken;
    });

    it("should refresh access token and rotate refresh token", async () => {
      const { status, data } = await api("/refresh", { refreshToken });
      expect(status).toBe(200);
      expect(data.accessToken).toBeTruthy();
      expect(data.refreshToken).toBeTruthy();
      expect(data.refreshToken).not.toBe(refreshToken); // rotated

      // Old refresh token should now be revoked
      const { status: s2 } = await api("/refresh", { refreshToken });
      expect(s2).toBe(401);

      // New refresh token should work
      refreshToken = data.refreshToken;
    });

    it("should logout and revoke refresh token", async () => {
      const { status } = await api("/logout", { refreshToken });
      expect(status).toBe(200);

      // Refresh should now fail
      const { status: s2 } = await api("/refresh", { refreshToken });
      expect(s2).toBe(401);
    });
  });

  // ═══════════════════════════
  // SPONSOR VALIDATION
  // ═══════════════════════════
  describe("Sponsor Validation", () => {
    it("should validate existing sponsor code", async () => {
      const { status, data } = await apiGet(`/sponsor/validate/${bootstrapSponsorCode}`);
      expect(status).toBe(200);
      expect(data.valid).toBe(true);
    });

    it("should validate wallet address as sponsor", async () => {
      const { status, data } = await apiGet(`/sponsor/validate/${wallet1.address}`);
      expect(status).toBe(200);
      expect(data.valid).toBe(true);
      expect(data.type).toBe("wallet");
    });

    it("should reject non-existent sponsor code", async () => {
      const { status, data } = await apiGet("/sponsor/validate/FAKE-CODE-999");
      expect(status).toBe(404);
      expect(data.valid).toBe(false);
    });

    it("should reject non-existent wallet address", async () => {
      const { status, data } = await apiGet("/sponsor/validate/0x0000000000000000000000000000000000000099");
      expect(status).toBe(404);
      expect(data.valid).toBe(false);
    });
  });

  // ═══════════════════════════
  // EMAIL REGISTRATION (OTP flow)
  // ═══════════════════════════
  describe("Email Registration", () => {
    let sessionId: string;

    it("should init email registration and get session", async () => {
      const { status, data } = await api("/register/email/init", {
        email: "test-int@example.com",
      });
      expect(status).toBe(200);
      expect(data.sessionId).toBeTruthy();
      sessionId = data.sessionId;
    });

    it("should verify OTP from database", async () => {
      // Get the OTP from the database directly (simulating dev mode)
      const otp = await prisma.otpCode.findFirst({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
      });
      expect(otp).toBeTruthy();

      const { status, data } = await api("/verify-otp", {
        sessionId,
        otp: otp!.code,
      });
      expect(status).toBe(200);
      expect(data.verified).toBe(true);
    });

    it("should complete email registration with wallet", async () => {
      const message = `Sign this message to register with BitTON.AI\n\nEmail: test-int@example.com\nAddress: ${wallet3.address}`;
      const signature = await wallet3.signMessage(message);

      const { status, data } = await api("/register/email/complete", {
        sessionId,
        sponsorCode: bootstrapSponsorCode,
        address: wallet3.address,
        signature,
        message,
      });

      expect(status).toBe(201);
      expect(data.accessToken).toBeTruthy();
      expect(data.user.email).toBe("test-int@example.com");
      expect(data.user.evmAddress).toBe(wallet3.address.toLowerCase());
    });

    it("should reject duplicate email registration", async () => {
      const { status } = await api("/register/email/init", {
        email: "test-int@example.com",
      });
      expect(status).toBe(409);
    });
  });

  // ═══════════════════════════
  // DATA PERSISTENCE CHECK
  // ═══════════════════════════
  describe("Data Persistence", () => {
    it("should persist users in database", async () => {
      const users = await prisma.user.findMany({
        where: {
          evmAddress: { in: [wallet1.address.toLowerCase(), wallet2.address.toLowerCase(), wallet3.address.toLowerCase()] },
        },
      });
      expect(users.length).toBe(3);
    });

    it("should persist sponsor relationships", async () => {
      const user2 = await prisma.user.findFirst({
        where: { evmAddress: wallet2.address.toLowerCase() },
      });
      expect(user2).toBeTruthy();
      expect(user2!.sponsorId).toBeTruthy();
    });

    it("should have audit logs for all auth events", async () => {
      const logs = await prisma.auditLog.findMany({
        where: {
          action: { startsWith: "auth." },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should track lastLoginAt", async () => {
      const user = await prisma.user.findFirst({
        where: { evmAddress: wallet1.address.toLowerCase() },
      });
      expect(user!.lastLoginAt).toBeTruthy();
    });
  });
});
