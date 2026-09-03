import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ lookup: vi.fn(), limit: vi.fn(), bot: vi.fn(), send: vi.fn(), verify: vi.fn(), update: vi.fn(), signOut: vi.fn(), factors: vi.fn(), challenge: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: m.lookup } } }));
vi.mock("@/lib/authRateLimit", () => ({ allowAuthRequest: m.limit }));
vi.mock("@/lib/botProtection", () => ({ verifyBotCheck: m.bot }));
vi.mock("@/lib/supabase/authServer", () => ({ getSupabaseAuth: async () => ({ auth: { resetPasswordForEmail: m.send, verifyOtp: m.verify, updateUser: m.update, signOut: m.signOut, mfa: { listFactors: m.factors, challengeAndVerify: m.challenge } } }) }));
import { requestRecovery, resetPassword } from "@/app/forgot-password/actions";
function form(overrides: Record<string,string> = {}) {
  const data = new FormData();
  for (const [key,value] of Object.entries({ email: "person@example.test", code: "123456", password: "long-secret-password", confirmPassword: "long-secret-password", ...overrides })) data.set(key,value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTH_PROVIDER", "supabase");
  m.limit.mockResolvedValue(true); m.bot.mockResolvedValue(true);
  m.lookup.mockResolvedValue({ id: "portal-id", authId: "auth-id" });
  m.send.mockResolvedValue({ error: null }); m.update.mockResolvedValue({ error: null }); m.signOut.mockResolvedValue({ error: null });
  m.verify.mockResolvedValue({ data: { user: { id: "auth-id" } }, error: null });
  m.factors.mockResolvedValue({ data: { totp: [] }, error: null });
  m.challenge.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("sends recovery only for linked portal accounts without disclosing existence", async () => {
  const linked = await requestRecovery(form());
  expect(m.send).toHaveBeenCalledWith("person@example.test");
  m.lookup.mockResolvedValue(null); m.send.mockClear();
  expect(await requestRecovery(form())).toEqual(linked);
  expect(m.send).not.toHaveBeenCalled();
});
it("does not expose provider email delivery errors", async () => {
  m.send.mockResolvedValue({ error: { code: "rate_limit" } });
  expect(await requestRecovery(form())).toMatchObject({ error: "", sent: true });
});
it("checks rate limiting and bot protection before sending or verifying", async () => {
  m.limit.mockResolvedValue(false);
  expect((await requestRecovery(form())).error).toContain("Too many");
  expect((await resetPassword(form())).error).toContain("Too many");
  expect(m.send).not.toHaveBeenCalled(); expect(m.verify).not.toHaveBeenCalled();
  m.limit.mockResolvedValue(true); m.bot.mockResolvedValue(false);
  expect((await resetPassword(form())).error).toContain("security check");
  expect(m.verify).not.toHaveBeenCalled();
});
it("rejects mismatched and weak passwords before consuming the OTP", async () => {
  expect((await resetPassword(form({ confirmPassword: "wrong" }))).error).toContain("do not match");
  expect((await resetPassword(form({ password: "short" }))).error).toContain("12 characters");
  expect(m.verify).not.toHaveBeenCalled();
});
it("never changes passwords for invalid/expired/replayed recovery codes", async () => {
  m.verify.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired" } });
  expect((await resetPassword(form())).error).toContain("invalid, expired or already used");
  expect(m.update).not.toHaveBeenCalled();
});
it("resolves the verified auth ID, never links by email, then revokes refresh sessions", async () => {
  expect(await resetPassword(form())).toMatchObject({ completed: true, error: "" });
  expect(m.verify).toHaveBeenCalledWith({ email: "person@example.test", token: "123456", type: "recovery" });
  expect(m.lookup).toHaveBeenCalledWith({ where: { authId: "auth-id" }, select: { id: true } });
  expect(m.update).toHaveBeenCalledWith({ password: "long-secret-password" });
  expect(m.signOut).toHaveBeenCalledWith({ scope: "global" });
});
it("refuses unlinked identities even with a valid OTP", async () => {
  m.lookup.mockResolvedValue(null);
  expect((await resetPassword(form())).error).toContain("Contact the recruitment team");
  expect(m.update).not.toHaveBeenCalled();
  expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it("reports partial success if session revocation fails", async () => {
  m.signOut.mockResolvedValue({ error: { code: "unavailable" } });
  expect(await resetPassword(form())).toMatchObject({ completed: true, error: expect.stringContaining("other sessions") });
});
it("requires the existing authenticator during recovery, never replaces MFA", async () => {
  m.factors.mockResolvedValue({ data: { totp: [{ id: "own-factor", status: "verified" }] }, error: null });
  expect((await resetPassword(form())).error).toContain("requires an authenticator");
  expect(m.update).not.toHaveBeenCalled();
  expect(await resetPassword(form({ mfaCode: "654321" }))).toMatchObject({ completed: true });
  expect(m.challenge).toHaveBeenCalledWith({ factorId: "own-factor", code: "654321" });
});
it("does not update the password when MFA verification fails", async () => {
  m.factors.mockResolvedValue({ data: { totp: [{ id: "own-factor", status: "verified" }] }, error: null });
  m.challenge.mockResolvedValue({ error: { code: "invalid" } });
  expect((await resetPassword(form({ mfaCode: "000000" }))).error).toContain("invalid");
  expect(m.update).not.toHaveBeenCalled();
});
