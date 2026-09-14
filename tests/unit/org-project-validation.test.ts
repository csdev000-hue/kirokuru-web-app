import { expect, it } from "vitest";
import { createOrganizationSchema } from "@/lib/validators/organization";
import { createProjectSchema, updateProjectSchema } from "@/lib/validators/project";
it("名称の前後空白を除去", () => { expect(createOrganizationSchema.parse({ name: " 組織 " }).name).toBe("組織"); });
it.each(["", "  ", "a".repeat(201), null, 123])("不正な名称を拒否 %#", (name) => { expect(createOrganizationSchema.safeParse({ name }).success).toBe(false); });
it("descriptionの上限・nullable・statusを検証", () => { expect(updateProjectSchema.safeParse({ description: "a".repeat(5001) }).success).toBe(false); expect(updateProjectSchema.safeParse({ description: null }).success).toBe(true); expect(updateProjectSchema.safeParse({ status: "archived" }).success).toBe(true); });
it("作成者・roleは入力対象外", () => { expect(createProjectSchema.safeParse({ organizationId: crypto.randomUUID(), name: "Project", role: "owner" }).success).toBe(false); });
