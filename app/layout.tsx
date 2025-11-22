import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "جولة عالمية",
  description:
    "استوديو تفاعلي لصناعة فيديو ملهم يستعرض جمال كوكب الأرض وثقافاته المختلفة.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${notoSansArabic.variable}`}>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
