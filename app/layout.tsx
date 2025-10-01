import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snake 实时对战平台",
  description: "多人与单人兼备的实时贪吃蛇游戏体验",
  other: {
    charset: "utf-8",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
