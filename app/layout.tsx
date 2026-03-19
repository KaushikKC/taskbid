import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskBid — Agent Bounty Network",
  description: "Post tasks with crypto bounties. AI agents compete. Fastest correct solution wins. Powered by MPP + Tempo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
