/** Used by Proxy and offline checks. Only explicit server-configured origins. */
export function securityHeaders(nonce: string, path: string, env: Record<string, string | undefined> = process.env) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error("Invalid nonce");
  const connections = new Set<string>(["'self'"]);
  const media = new Set<string>(["'self'", "blob:"]);
  const origin = (value: string) => {
    const url = new URL(value);
    if (!['https:', 'wss:', 'http:', 'ws:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid provider origin");
    if (['http:', 'ws:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error("Insecure provider origin");
    return url.origin;
  };
  if (env.LIVEKIT_URL) {
    const url = new URL(origin(env.LIVEKIT_URL));
    url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:'; connections.add(url.origin);
    url.protocol = url.protocol === 'ws:' ? 'http:' : 'https:'; connections.add(url.origin);
  }
  if (env.AWS_ENDPOINT_URL_S3) { const s3 = origin(env.AWS_ENDPOINT_URL_S3); connections.add(s3); media.add(s3); }
  else if (env.S3_BUCKET_NAME && env.AWS_REGION) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.S3_BUCKET_NAME) || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(env.AWS_REGION)) throw new Error("Invalid storage origin");
    const s3 = `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com`; connections.add(s3); media.add(s3);
  }
  const development = env.NODE_ENV === "development";
  const csp = ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'", `connect-src ${[...connections].join(' ')}`, `media-src ${[...media].join(' ')}`, "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'self' https://accounts.google.com", "frame-ancestors 'none'"];
  const live = /^\/meetings\/[^/]+\/live\/?$/.test(path);
  return {
    "Content-Security-Policy": csp.join('; '),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": `camera=${live ? '(self)' : '()'}, microphone=${live ? '(self)' : '()'}, display-capture=${live ? '(self)' : '()'}, geolocation=(), payment=(), usb=()`,
    ...(env.NODE_ENV === 'production' && env.AUTH_URL?.startsWith('https://') ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}
