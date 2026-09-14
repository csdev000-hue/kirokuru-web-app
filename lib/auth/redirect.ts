/** Auth redirects are deliberately limited to the two Phase 2 destinations. */
export function safeAuthRedirect(url: string, baseUrl: string) {
  try {
    const base = new URL(baseUrl);
    const target = new URL(url, base);
    if (target.origin === base.origin && !target.username && !target.password && ["/dashboard", "/login"].includes(target.pathname)) {
      return new URL(target.pathname, base.origin).href;
    }
    return new URL("/dashboard", base.origin).href;
  } catch {
    return "/login";
  }
}
