import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  current: vi.fn(), session: vi.fn(), account: vi.fn(), limit: vi.fn(), bot: vi.fn(),
  signIn: vi.fn(), getUser: vi.fn(), findUser: vi.fn(), upsert: vi.fn(), cleanup: vi.fn(), headers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUser }, drive: { findUnique: async () => ({ id: "drive1" }) }, application: { findFirst: async () => null }, authRateLimit: { upsert: mocks.upsert, deleteMany: mocks.cleanup } } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.current, createSession: mocks.session }));
vi.mock("@/lib/accounts", () => ({ createPortalAccount: mocks.account }));
vi.mock("@/lib/supabase/authServer", () => ({ getSupabaseAuth: async () => ({ auth: { signInWithPassword: mocks.signIn, getUser: mocks.getUser } }) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

import { signupAction } from "@/app/signup/actions";
import { consumeAuthLimit } from "@/lib/authRateLimit";
import { verifyBotCheck } from "@/lib/botProtection";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";

function registration(extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ email: "new@example.test", password: "Long-test-password", returnTo: "/apply/drive1", ...extra })) form.set(key, value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("AUTH_PROVIDER", "local"); vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  mocks.current.mockResolvedValue(null); mocks.account.mockResolvedValue({ id: "candidate1" });
  mocks.upsert.mockResolvedValue({ attempts: 1 }); mocks.cleanup.mockResolvedValue({ count: 0 });
  mocks.headers.mockResolvedValue(new Headers()); mocks.signIn.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("public signup server boundary", () => {
  it("ignores tampered roles and funnel fields, creates candidate only", async () => {
    await expect(signupAction({ error: "" }, registration({ role: "admin", funnelId: "stolen", verified: "true" }))).rejects.toThrow("REDIRECT:/candidate/apply/drive1");
    expect(mocks.account).toHaveBeenCalledWith({ email: "new@example.test", password: "Long-test-password", name: "new", role: "candidate" });
    expect(mocks.session).toHaveBeenCalledWith("candidate1");
  });
  it("rejects invalid credentials before account creation", async () => {
    expect(await signupAction({ error: "" }, registration({ password: "short" }))).toMatchObject({ field: "password" });
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("blocks throttled signup without creating an identity", async () => {
    mocks.upsert.mockResolvedValue({ attempts: 21 });
    expect((await signupAction({ error: "" }, registration())).error).toContain("Too many");
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("handles duplicate account errors without signing in", async () => {
    mocks.account.mockRejectedValue({ code: "P2002" });
    expect((await signupAction({ error: "" }, registration())).error).toContain("sign in");
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("uses Supabase sign-in, not a local cookie, when enabled", async () => {
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    await expect(signupAction({ error: "" }, registration())).rejects.toThrow("REDIRECT:/candidate/apply/drive1");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "new@example.test", password: "Long-test-password" });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not redirect to arbitrary external URLs", async () => {
    await expect(signupAction({ error: "" }, registration({ returnTo: "https://evil.test" }))).rejects.toThrow("REDIRECT:/candidate");
  });
  it("never enables the local auth adapter in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(useSupabaseAuth()).toBe(true);
  });
});

describe("bot and shared rate protection", () => {
  it("increments shared counters atomically and stores only a digest", async () => {
    mocks.upsert.mockResolvedValueOnce({ attempts: 5 }).mockResolvedValueOnce({ attempts: 6 });
    expect(await consumeAuthLimit("candidate@example.test", 5, 1000)).toBe(true);
    expect(await consumeAuthLimit("candidate@example.test", 5, 1000)).toBe(false);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ where: { key: expect.stringMatching(/^[a-f0-9]{64}$/) }, update: { attempts: { increment: 1 } } });
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("candidate@example.test");
  });
  it("fails closed in production if bot protection is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await verifyBotCheck("token", "signup")).toBe(false);
  });
  it("requires verified action and hostname and rejects replay/failure", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TURNSTILE_SECRET_KEY", "unit-secret"); vi.stubEnv("APP_URL", "https://portal.example.test");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const result of [{ success: false }, { success: true, action: "login", hostname: "portal.example.test" }, { success: true, action: "signup", hostname: "evil.test" }]) {
      fetcher.mockResolvedValueOnce({ ok: true, json: async () => result });
      expect(await verifyBotCheck("token", "signup")).toBe(false);
    }
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, action: "signup", hostname: "portal.example.test" }) });
    expect(await verifyBotCheck("token", "signup")).toBe(true);
  });
});
