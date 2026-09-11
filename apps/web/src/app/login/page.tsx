import { GoogleButton } from "@/components/GoogleButton";
import { Logo } from "@/components/Logo";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; ref?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-10 text-center">
        <div className="mb-6 flex justify-center"><Logo size={28} wordmark={false} /></div>
        <h1 className="h2">Sign in to Sponsorprint</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          One Google sign-in does everything: your account, and permission to place pitch drafts in your own Gmail. Nothing is ever sent for you.
        </p>
        <div className="mt-8">
          <GoogleButton next={sp.next || "/"} refCode={sp.ref} />
        </div>
        {sp.error && <p className="mt-4 text-sm text-bad">{sp.error}</p>}
        <p className="mt-8 font-mono text-[11px] text-dim">Free while in beta: 5 creator scans and 3 drafts to start, more on request. No card, no API keys.</p>
      </div>
    </div>
  );
}
