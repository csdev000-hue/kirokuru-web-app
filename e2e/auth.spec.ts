import { expect, test } from "@playwright/test";

for (const path of ["dashboard", "organizations", "projects", "tickets", "meetings"]) {
  test(`AUTH-T01: 未認証の/${path}はログインへ`, async ({ page }) => {
    await page.goto(`/${path}`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  });
}
test("AUTH-T03: 保護APIは未認証時401、role/userIdの自己申告を無視", async ({ request }) => {
  const response = await request.get("/api/me?role=owner&userId=forged", { headers: { "x-user-id": "forged", "x-role": "owner" } });
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
});
test("AUTH-T02/04: Session Mockでログイン→Dashboard→標準Logout", async ({ page, context }) => {
  await page.goto("/login");
  const token = process.env.E2E_SESSION_TOKEN;
  expect(token).toBeTruthy();
  await context.addCookies([{ name: "authjs.session-token", value: token!, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Owner A", { exact: true })).toBeVisible();
  await expect(page.getByText("owner-a@example.invalid", { exact: true })).toBeVisible();
  const response = await context.request.get("/api/me?role=owner");
  expect(response.status()).toBe(200);
  expect(Object.keys((await response.json()).data).sort()).toEqual(["email", "id", "name"]);
  const sessionResponse = await context.request.get("/api/auth/session");
  expect(Object.keys(await sessionResponse.json()).sort()).toEqual(["appUserId", "expires"]);
  const cookieHeaders = sessionResponse.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie");
  const sessionCookie = cookieHeaders.find((header) => header.value.startsWith("authjs.session-token="));
  expect(Boolean(sessionCookie?.value.includes("HttpOnly"))).toBe(true);
  expect(Boolean(sessionCookie?.value.includes("SameSite=Lax"))).toBe(true);
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).filter((cookie) => cookie.name.includes("session-token"))).toHaveLength(0);
  expect((await context.request.get("/api/me")).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
test("偽造Session Cookieは認証されない", async ({ page, context }) => {
  await context.addCookies([{ name: "authjs.session-token", value: "forged", domain: "127.0.0.1", path: "/" }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
test("CSRFなしのLogout POSTと外部callbackを拒否", async ({ request }) => {
  const response = await request.post("/api/auth/signout", { form: { callbackUrl: "https://evil.example" }, maxRedirects: 0 });
  expect(response.headers().location ?? "").not.toContain("evil.example");
  expect(response.headers().location).toContain("MissingCSRF");
});
