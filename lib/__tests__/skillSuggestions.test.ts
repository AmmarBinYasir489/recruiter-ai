import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ai: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({ generateAiText: mocks.ai }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.auth }));
import { suggestDriveSkillsAction } from "@/app/recruiter/skillActions";

describe("editable AI drive skills", () => {
  it("normalizes suggestions and removes duplicates across groups", async () => {
    mocks.auth.mockResolvedValue({ id: "skills-rec1" });
    mocks.ai.mockResolvedValue('{"required":["React","react","JavaScript"],"preferred":["React","TypeScript"]}');
    expect(await suggestDriveSkillsAction("Web developer")).toEqual({ required: ["react", "javascript"], preferred: ["typescript"] });
    expect(mocks.auth).toHaveBeenCalledWith("recruiter", "admin");
    expect(await suggestDriveSkillsAction("Web developer")).toHaveProperty("error");
  });
  it("fails safely without pretending suggestions worked", async () => {
    mocks.auth.mockResolvedValue({ id: "skills-rec2" });
    mocks.ai.mockRejectedValue(new Error("Provider credentials are unavailable"));
    expect(await suggestDriveSkillsAction("AI engineer")).toEqual({ error: expect.stringContaining("unavailable") });
  });
  it("rejects blank titles and malformed model output", async () => {
    mocks.auth.mockResolvedValue({ id: "skills-rec3" });
    expect(await suggestDriveSkillsAction("")).toHaveProperty("error");
    mocks.ai.mockResolvedValue("{}");
    expect(await suggestDriveSkillsAction("Accountant")).toHaveProperty("error");
  });
});
