import { expect, it } from "vitest";
import { bulkRegisterSchema, registerCandidateSchema } from "@/lib/validators/ticket-registration";
it("bulk accepts 1–50 unique IDs", () => { expect(bulkRegisterSchema.safeParse({ candidateIds: Array.from({ length: 50 }, () => crypto.randomUUID()) }).success).toBe(true); });
it.each([0, 51])("bulk rejects %s IDs", (count) => { expect(bulkRegisterSchema.safeParse({ candidateIds: Array.from({ length: count }, () => crypto.randomUUID()) }).success).toBe(false); });
it("duplicate and invalid IDs rejected", () => { const id = crypto.randomUUID(); expect(bulkRegisterSchema.safeParse({ candidateIds: [id, id] }).success).toBe(false); expect(bulkRegisterSchema.safeParse({ candidateIds: ['bad'] }).success).toBe(false); });
it.each(["projectId", "title", "status", "createdBy", "sourceCandidateId", "sourceMeetingId"])("registration rejects %s override", (key) => { expect(registerCandidateSchema.safeParse({ [key]: "tampered" }).success).toBe(false); expect(bulkRegisterSchema.safeParse({ candidateIds: [crypto.randomUUID()], [key]: "tampered" }).success).toBe(false); });
