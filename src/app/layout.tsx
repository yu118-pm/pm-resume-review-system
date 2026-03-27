import type { Metadata } from "next";
import { APP_STYLES } from "./app-styles";
import "./globals.css";

export const metadata: Metadata = {
  title: "求职顾问工作台",
  description: "简历优化与 PM 简历批阅工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <style dangerouslySetInnerHTML={{ __html: APP_STYLES }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
