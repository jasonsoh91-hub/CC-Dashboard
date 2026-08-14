import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OnboardingGate } from "@/components/onboarding-gate";
import { LowBalanceNotice } from "@/components/low-balance-notice";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Credit Card Agent Dashboard",
  description: "AI-powered credit card application processing dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Both render nothing unless they apply to the signed-in user. */}
        <OnboardingGate />
        <LowBalanceNotice />
      </body>
    </html>
  );
}
