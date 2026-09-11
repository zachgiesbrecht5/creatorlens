import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { currentProfile } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Sponsorprint",
  description: "Scan any creator. See every brand they've worked with. Pitch in one click.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await currentProfile();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%230b0d12'/%3E%3Cpath d='M6.5 15.5c0-3.6 2.4-6.5 5.5-6.5s5.5 2.9 5.5 6.5' stroke='%23fff' stroke-width='1.7' stroke-linecap='round' fill='none'/%3E%3Cpath d='M9.2 16.5c0-2 1.3-3.6 2.8-3.6s2.8 1.6 2.8 3.6' stroke='%23fff' stroke-width='1.7' stroke-linecap='round' fill='none'/%3E%3Cpath d='M12 17.5v-1.2' stroke='%232f5bff' stroke-width='1.9' stroke-linecap='round'/%3E%3C/svg%3E" />
      </head>
      <body>
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center"><Logo /></Link>
            <nav className="flex items-center gap-1 text-[13px]">
              {profile ? (
                <>
                  <NavLink href="/">Search</NavLink>
                  <NavLink href="/brands">Brands</NavLink>
                  <NavLink href="/scans">My scans</NavLink>
                  {profile.plan === "admin" && <NavLink href="/queue">Queue</NavLink>}
                  <NavLink href="/settings">Settings</NavLink>
                  <span className="pill ml-3" title="Scan credits / draft credits">
                    {profile.plan === "trial" ? `${profile.scan_credits} scans · ${profile.draft_credits} drafts` : profile.plan}
                  </span>
                  <form action="/auth/signout" method="post" className="ml-2"><button className="rounded-md px-2.5 py-1.5 text-dim hover:bg-surface2 hover:text-fg">Sign out</button></form>
                </>
              ) : (
                <Link href="/login" className="btn-dark !py-1.5">Sign in</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-10 font-mono text-[11px] text-dim">
          <span>© {new Date().getFullYear()} Sponsorprint</span>
          <span className="flex gap-4"><span>Public data only · Drafts, never sends</span><a href="/privacy" className="hover:text-fg">Privacy</a><a href="/terms" className="hover:text-fg">Terms</a></span>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="rounded-md px-2.5 py-1.5 text-muted transition hover:bg-surface2 hover:text-fg">{children}</Link>;
}
