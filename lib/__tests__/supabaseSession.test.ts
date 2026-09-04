import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.lookup } } }));
vi.mock("@/lib/supabase/authServer", () => ({ getSupabaseAuth: async () => ({ auth: { getClaims: mocks.claims } }) }));
import { getCurrentUser, requireRole } from "../auth";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("AUTH_PROVIDER", "supabase"); });
afterEach(() => vi.unstubAllEnvs());

it("uses the verified identity and database role, never editable token metadata", async () => {
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "auth-1", user_metadata: { role: "admin" } } }, error: null });
  mocks.lookup.mockResolvedValue({ id: "portal-1", role: "candidate" });
  expect(await getCurrentUser()).toMatchObject({ role: "candidate" });
  expect(mocks.lookup).toHaveBeenCalledWith({ where: { authId: "auth-1" }, select: { id: true, email: true, name: true, role: true } });
  await expect(requireRole("admin")).rejects.toThrow("FORBIDDEN");
});
it("does not authorize an unlinked Supabase identity with a matching email", async () => {
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "unlinked" } }, error: null });
  mocks.lookup.mockResolvedValue(null);
  expect(await getCurrentUser()).toBeNull();
  expect(mocks.lookup.mock.calls[0][0].where).toEqual({ authId: "unlinked" });
});
it("fails closed on expired or invalid auth", async () => {
  mocks.claims.mockResolvedValue({ data: { claims: null }, error: { message: "invalid" } });
  expect(await getCurrentUser()).toBeNull();
  expect(mocks.lookup).not.toHaveBeenCalled();
});

it("requires MFA before returning staff data or authorizing actions", async () => {
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "auth-staff", aal: "aal1" } }, error: null });
  mocks.lookup.mockResolvedValue({ id: "staff", role: "admin" });
  await expect(getCurrentUser()).rejects.toThrow("NEXT_REDIRECT");
  await expect(requireRole("admin")).rejects.toThrow("NEXT_REDIRECT");
});
it("allows the limited setup context, then accepts verified AAL2 staff", async () => {
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "auth-staff", aal: "aal1" } }, error: null });
  mocks.lookup.mockResolvedValue({ id: "staff", role: "reviewer" });
  expect(await getCurrentUser({ allowMfaSetup: true })).toMatchObject({ role: "reviewer" });
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "auth-staff", aal: "aal2" } }, error: null });
  expect(await requireRole("reviewer")).toMatchObject({ role: "reviewer" });
});
it("fails closed when verified claims are unavailable", async () => {
  vi.stubEnv("STAFF_MFA_REQUIRED", "true");
  mocks.claims.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  mocks.lookup.mockResolvedValue({ id: "staff", role: "recruiter" });
  expect(await getCurrentUser()).toBeNull();
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("does not allow disabling production staff MFA with an environment flag", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STAFF_MFA_REQUIRED", "false");
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "auth-staff", aal: "aal1" } }, error: null });
  mocks.lookup.mockResolvedValue({ id: "staff", role: "admin" });
  await expect(getCurrentUser()).rejects.toThrow("NEXT_REDIRECT");
});
