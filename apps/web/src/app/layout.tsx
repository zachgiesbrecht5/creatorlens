import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { currentProfile } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "CreatorLens",
  description: "Scan any creator. See every brand they've worked with. Pitch in one click.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await currentProfile();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Creator<span className="text-brand">Lens</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {profile ? (
                <>
                  <Link href="/brands" className="hover:text-brand">Brands</Link>
                  <Link href="/queue" className="hover:text-brand">Queue</Link>
                  <Link href="/settings" className="hover:text-brand">Settings</Link>
                  <span className="pill bg-brand-soft text-brand" title="Scan credits / draft credits">
                    {profile.plan === "trial" ? `${profile.scan_credits} scans · ${profile.draft_credits} drafts` : profile.plan}
                  </span>
                  <form action="/auth/signout" method="post"><button className="text-slate-500 hover:text-ink">Sign out</button></form>
                </>
              ) : (
                <Link href="/login" className="btn-primary">Sign in with Google</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
