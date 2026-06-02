import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CLAR Evaluator — Workday Studio",
  description: "Rule-driven grading tool for Workday Studio CLAR files, with Workday RAAS user-activity verification.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
