import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { currentProfile } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "CreatorLens by Rootfor",
  description: "Scan any creator. See every brand they've worked with. Pitch in one click.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await currentProfile();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&family=Azeret+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <Link href="/" className="font-mono text-[12px] tracking-wide">
              Rootfor <span className="text-muted">/</span> CreatorLens
            </Link>
            <nav className="flex items-center gap-6 font-mono text-[12px]">
              {profile ? (
                <>
                  <Link href="/brands" className="text-muted hover:text-fg">Brands</Link>
                  <Link href="/queue" className="text-muted hover:text-fg">Queue</Link>
                  <Link href="/settings" className="text-muted hover:text-fg">Settings</Link>
                  <span className="pill" title="Scan credits / draft credits">
                    {profile.plan === "trial" ? `${profile.scan_credits} scans · ${profile.draft_credits} drafts` : profile.plan}
                  </span>
                  <form action="/auth/signout" method="post"><button className="text-dim hover:text-fg">Sign out</button></form>
                </>
              ) : (
                <Link href="/login" className="btn-primary">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-10 font-mono text-[11px] text-dim">
          Rootfor Group · rooting for you
        </footer>
      </body>
    </html>
  );
}
