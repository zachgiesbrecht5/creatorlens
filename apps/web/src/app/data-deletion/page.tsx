export const metadata = { title: "Data deletion | Sponsorprint" };

// User-facing data deletion instructions (required by Meta) plus a status view
// for a confirmation code returned by the deletion callback.
export default async function DataDeletion({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <article className="prose-sp mx-auto max-w-2xl">
      <div className="label mb-2">Privacy</div>
      <h1 className="h2">Delete your data</h1>
      {code && <p className="mt-3 rounded-md border border-ok/30 bg-okSoft px-3 py-2 text-[13px]">Request <code>{code}</code> received. Your Instagram connection was removed immediately; account data is deleted within 30 days.</p>}
      <h2>Instagram or Facebook</h2>
      <p>If you connected an Instagram account through Facebook Login, you can remove Sponsorprint at any time from your Facebook settings under <strong>Settings &amp; privacy → Settings → Apps and websites</strong>. Removing the app deletes the connection and access token on our side automatically. You can also request deletion of any data we hold about that account from the same screen; Meta forwards the request to us and you will receive a confirmation code you can check on this page.</p>
      <h2>Google</h2>
      <p>Remove Sponsorprint at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>. Any Gmail draft access stops immediately.</p>
      <h2>Your whole account</h2>
      <p>Email <a href="mailto:privacy@sponsorprint.com">privacy@sponsorprint.com</a> from your sign-in address. We delete your profile, roster, drafts, connections and tokens within 30 days. Public creator scan data is not personal to you and stays in the index.</p>
    </article>
  );
}
