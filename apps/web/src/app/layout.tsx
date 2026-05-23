import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "认知康复服务平台",
  description: "认知评估、个性化康复方案、体感训练采集和安全审计闭环",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
