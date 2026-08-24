import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recruitment Portal",
  description: "Clean recruitment portal — drives, funnels, CV scoring and candidate search.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
