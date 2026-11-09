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
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="w-full shrink-0 border-t border-[var(--line-subtle)] bg-[var(--surface-page)] px-4 py-2 text-center text-xs leading-5 text-[var(--ink-subtle)]">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            辽ICP备2026024184号-1
          </a>
        </footer>
      </body>
    </html>
  );
}
