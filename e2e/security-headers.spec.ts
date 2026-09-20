import { expect, test } from "@playwright/test";
test("CSP nonce is fresh, applied to Next scripts and blocks injected inline JS", async ({ page, request }) => {
  await page.route("http://127.0.0.1:3100/", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace("</body>", "<script>window.__xssExecuted = true</script><img src='/missing-xss-image' onerror=\"window.__xssExecuted = true\"></body>") });
  });
  const first = await page.goto("/");
  const policy = first!.headers()["content-security-policy"];
  expect(policy).toContain("'strict-dynamic'"); expect(policy).not.toContain("unsafe-eval");
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1]; expect(nonce).toBeTruthy();
  expect(await page.locator("script[nonce]").first().evaluate((element) => (element as HTMLScriptElement).nonce)).toBe(nonce);
  expect(await page.evaluate(() => Reflect.get(window, "__xssExecuted"))).toBeUndefined();
  const second = await request.get("/"); expect(second.headers()["content-security-policy"]).not.toBe(policy);
  expect(second.headers()["x-content-type-options"]).toBe("nosniff"); expect(second.headers()["referrer-policy"]).toBe("no-referrer");
  expect(second.headers()["permissions-policy"]).toContain("camera=()");
  expect(second.headers()["strict-transport-security"]).toBeUndefined(); // Local HTTP build must not set HSTS.
});
