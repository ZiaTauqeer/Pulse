import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "PULSE — Predictive Customer Experience Intelligence",
  description:
    "PULSE identifies which customers are likely to churn, explains why, and grounds every recommendation in real behavioral, support, and sentiment data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
