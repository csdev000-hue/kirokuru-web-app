import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() { return [{ source: "/meetings/:id/live", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self)" }, { key: "Referrer-Policy", value: "no-referrer" }] }]; },
};

export default nextConfig;
