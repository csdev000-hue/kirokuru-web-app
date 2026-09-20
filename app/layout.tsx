import { connection } from "next/server";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIプロジェクトマネージャー",
  description: "会議から議事録、チケット候補、人による確認を経てプロジェクト管理へ。",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection(); // Fresh CSP nonce requires request-time rendering.
  return <html lang="ja"><body>{children}</body></html>;
}
