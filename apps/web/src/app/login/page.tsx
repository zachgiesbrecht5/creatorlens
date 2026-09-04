import { GoogleButton } from "@/components/GoogleButton";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; ref?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-10 text-center">
        <div className="label mb-4">Rootfor / CreatorLens</div>
        <h1 className="h2">Sign in</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          One Google sign-in does everything: your account, and permission to place pitch drafts in your own Gmail. We never send anything.
        </p>
        <div className="mt-8">
          <GoogleButton next={sp.next || "/"} refCode={sp.ref} />
        </div>
        {sp.error && <p className="mt-4 text-sm text-bad">{sp.error}</p>}
        <p className="mt-8 font-mono text-[11px] text-dim">Free trial: 5 creator scans and 3 drafts. No card, no API keys.</p>
      </div>
    </div>
  );
}
