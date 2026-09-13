import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIプロジェクトマネージャー",
  description: "会議から議事録、チケット候補、人による確認を経てプロジェクト管理へ。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
