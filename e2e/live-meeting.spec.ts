import { expect, test } from "@playwright/test";
test("LiveKit Provider Mock: two users, start/preview/token/join/leave/end and connection failure", async ({ page, context, browser }) => {
 const ownerToken = process.env.E2E_SESSION_TOKEN; const viewerToken = process.env.E2E_VIEWER_SESSION_TOKEN; const endpoint = process.env.E2E_LIVEKIT_ENDPOINT; const projectId = process.env.E2E_LIVE_PROJECT_ID;
 if (!ownerToken || !viewerToken || !endpoint || !projectId) throw new Error("Missing local fixtures");
 const cookie = (value: string) => ({ name: "authjs.session-token", value, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" as const });
 await context.addCookies([cookie(ownerToken)]); const viewer = await browser.newContext({ baseURL: "http://127.0.0.1:3100" }); await viewer.addCookies([cookie(viewerToken)]);
 try {
  const headers = { origin: "http://127.0.0.1:3100" }; const meeting = (await (await context.request.post(`/api/projects/${projectId}/meetings`, { headers, data: { title: "オンライン会議テスト", meetingDate: "2026-09-20T01:00:00Z" } })).json()).data;
  await page.goto(`/meetings/${meeting.id}`); await page.getByRole("button", { name: "オンライン会議を開始", exact: true }).click(); await page.getByRole("link", { name: "オンライン会議に参加", exact: true }).click();
  await expect(page.getByRole("heading", { name: "参加前のデバイス確認" })).toBeVisible();
  expect((await viewer.request.post(`/api/meetings/${meeting.id}/start`, { headers, data: {} })).status()).toBe(403);
  const viewerPage = await viewer.newPage(); await viewerPage.goto(`/meetings/${meeting.id}/live`); await expect(viewerPage.getByRole("button", { name: "視聴のみで参加" })).toBeVisible(); await expect(viewerPage.getByRole("button", { name: "会議に参加", exact: true })).toHaveCount(0);
  // Provider double simulates established participants; this does not claim WebRTC/media coverage.
  for (const client of [context, viewer]) {
   const issued = await client.request.post(`/api/meetings/${meeting.id}/token`, { headers, data: {} }); expect(issued.status()).toBe(200); const data = (await issued.json()).data; expect(data.canPublish).toBe(client === context);
   expect((await client.request.post(`${endpoint}/test/join`, { headers: { authorization: `Bearer ${data.token}` }, data: {} })).status()).toBe(200);
   expect((await client.request.post(`/api/meetings/${meeting.id}/join`, { headers, data: {} })).status()).toBe(200);
  }
  const details = (await (await context.request.get(`/api/meetings/${meeting.id}`)).json()).data; expect(details.participants.filter((p: { joinedAt: string | null }) => p.joinedAt)).toHaveLength(2);
  expect((await viewer.request.post(`/api/meetings/${meeting.id}/leave`, { headers, data: {} })).status()).toBe(200);
  await page.getByRole("button", { name: "視聴のみで参加", exact: true }).click(); await expect(page.getByRole("region", { name: "オンライン会議", exact: true }).getByRole("alert")).toContainText(/接続|切断/, { timeout: 20000 });
  await page.goto(`/meetings/${meeting.id}`); page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "オンライン会議を終了", exact: true }).click(); await expect(page.getByText(/状態: completed/)).toBeVisible();
  expect((await viewer.request.post(`/api/meetings/${meeting.id}/token`, { headers, data: {} })).status()).toBe(409);
  expect((await context.request.post(`/api/meetings/${meeting.id}/end`, { headers, data: {} })).status()).toBe(200);
 } finally { await viewer.close(); }
});
