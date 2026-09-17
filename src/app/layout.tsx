import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Certificate Generator",
  description: "Bulk certificate generation from SVG templates and Excel rosters",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const userEmail = data.user?.email ?? null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900">
        <AppShell userEmail={userEmail}>{children}</AppShell>
      </body>
    </html>
  );
}
