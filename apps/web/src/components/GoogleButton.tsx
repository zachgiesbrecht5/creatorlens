"use client";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Default sign-in asks only for identity (email/profile). The Gmail draft
// permission is a restricted Google scope that needs app verification, so it is
// opt-in from Settings (`gmail`), for test users while the app is unverified.
// Everyone else gets drafts through a prefilled Gmail compose window instead.
export function GoogleButton({ next, refCode, gmail, label, className }: { next: string; refCode?: string; gmail?: boolean; label?: string; className?: string }) {
  async function go() {
    if (refCode) document.cookie = `cl_ref=${encodeURIComponent(refCode)}; path=/; max-age=86400; samesite=lax`;
    const sb = supabaseBrowser();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${gmail ? "&gmail=1" : ""}`,
        ...(gmail ? { scopes: "https://www.googleapis.com/auth/gmail.compose", queryParams: { access_type: "offline", prompt: "consent" } } : {}),
      },
    });
  }
  return (
    <button onClick={go} className={className || "btn-dark w-full justify-center !py-2.5"}>
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="currentColor" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
      {label || "Continue with Google"}
    </button>
  );
}
