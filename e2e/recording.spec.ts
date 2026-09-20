import { expect, test } from "@playwright/test";
test("録音の直接Upload・完了・一覧・署名付き取得・削除", async ({ page, context }) => {
 const token = process.env.E2E_SESSION_TOKEN; if (!token) throw new Error("Missing test session");
 await context.addCookies([{ name: "authjs.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
 const headers = { origin: "http://127.0.0.1:3100" }; const organizations = (await (await context.request.get("/api/organizations")).json()).data; const organizationId = organizations.find((o: { name: string }) => o.name === "Organization A").id;
 const project = (await (await context.request.post("/api/projects", { headers, data: { name: "Recording E2E", organizationId } })).json()).data;
 const meeting = (await (await context.request.post(`/api/projects/${project.id}/meetings`, { headers, data: { title: "録音会議", meetingDate: "2026-09-20T01:00:00Z" } })).json()).data;
 await page.goto(`/meetings/${meeting.id}`); const section = page.getByRole("region", { name: "録音", exact: true });
 // Valid PCM WAV, generated in memory (no confidential media).
 const wav = Buffer.alloc(44 + 1600); wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);
 await expect(page.getByLabel("録音ファイル", { exact: true })).toBeEnabled();
 await page.getByLabel("録音ファイル", { exact: true }).setInputFiles({ name: "meeting.wav", mimeType: "audio/wav", buffer: wav });
 await section.getByRole("button", { name: "録音ファイルをアップロード", exact: true }).click(); await expect(section.getByText(/状態: uploaded/)).toBeVisible(); await expect(section.getByText("100%", { exact: true })).toBeVisible();
 await section.getByRole("button", { name: "録音を再生・取得" }).click(); const link = section.getByRole("link", { name: "録音をダウンロード" }); await expect(link).toBeVisible();
 const url = await link.getAttribute("href"); const response = await context.request.get(url!); expect(response.status()).toBe(200); expect(await response.body()).toEqual(wav);
 const unsigned = new URL(url!); unsigned.search = ""; expect((await context.request.get(unsigned.toString())).status()).toBe(403);
 page.once("dialog", (dialog) => dialog.accept()); await section.getByRole("button", { name: "録音を削除", exact: true }).click(); await expect(section.getByText("録音はまだありません")).toBeVisible();
});
