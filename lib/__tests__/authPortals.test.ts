import { expect, it } from "vitest";
import { AUTH_PORTALS, authPortal, PORTAL_LABELS } from "../authPortals";

it("offers explicit presentation entries for the four supported roles", () => {
  expect(AUTH_PORTALS).toEqual(["candidate", "recruiter", "reviewer", "admin"]);
  for (const role of AUTH_PORTALS) expect(PORTAL_LABELS[authPortal(role)]).toBeTruthy();
});
it("does not accept arbitrary URL values as a role", () => {
  for (const value of [undefined, null, "owner", "superuser", ["admin"], { role: "admin" }, "<script>"]) expect(authPortal(value)).toBe("candidate");
});
