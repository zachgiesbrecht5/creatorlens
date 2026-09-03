import { GoogleButton } from "@/components/GoogleButton";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; ref?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          One Google sign-in does everything: your account, and permission to place pitch drafts in your own Gmail. We never send anything.
        </p>
        <div className="mt-6">
          <GoogleButton next={sp.next || "/"} refCode={sp.ref} />
        </div>
        {sp.error && <p className="mt-4 text-sm text-red-600">{sp.error}</p>}
        <p className="mt-6 text-xs text-slate-500">Free trial: 5 creator scans and 3 drafts. No card, no API keys.</p>
      </div>
    </div>
  );
}
