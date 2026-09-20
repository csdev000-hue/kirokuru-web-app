import { expect, test } from "@playwright/test";

test("トップページにサービス名と処理の流れを表示する", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "AIプロジェクトマネージャー", level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText([
    "Meeting", "↓AI Minutes", "↓AI Ticket Candidates", "↓Human Review", "↓Ticket",
  ]);
});

test("Health Checkは外部接続なしで正常応答する", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ data: { status: "ok" }, requestId: response.headers()["x-request-id"] });
});
