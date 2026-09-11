import Link from "next/link";

export const metadata = { title: "Privacy Policy | Sponsorprint" };

// Plain-language privacy policy. Google's OAuth verification requires this page
// to describe exactly what the Gmail scope is used for, and it must be public.
export default function Privacy() {
  return (
    <article className="prose-sp mx-auto max-w-2xl">
      <div className="label mb-2">Legal</div>
      <h1 className="h2">Privacy Policy</h1>
      <p className="mt-2 font-mono text-[11px] text-dim">Last updated September 11, 2026</p>

      <h2>What Sponsorprint is</h2>
      <p>Sponsorprint (operated by 10213453 Manitoba Ltd., Winnipeg, Canada) is a research tool for creator managers. It reads a creator's public YouTube or Instagram content through the official APIs, identifies sponsored posts, and helps you write a pitch email that is saved as a draft in your own Gmail account.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Your account.</strong> When you sign in with Google we receive your name, email address and profile picture. We use these to create your account and show who is signed in.</li>
        <li><strong>Public creator data.</strong> Video titles, descriptions, captions, view counts and follower counts that creators have published publicly, retrieved through the YouTube Data API and the Instagram Graph API. We do not access private accounts or private messages.</li>
        <li><strong>What you add.</strong> Your pitch style guide, your email signature, the creators you tell us you represent, and the drafts you generate.</li>
        <li><strong>Usage.</strong> Standard server logs (IP address, browser, pages requested) kept for security and debugging.</li>
      </ul>

      <h2>How we use your Gmail access</h2>
      <p>Sponsorprint requests one Gmail permission, <code>gmail.compose</code>, which allows it to create draft messages in your Gmail account. We use it for exactly one thing: when you click "Draft" on a brand, we write a draft email into your Drafts folder. We do not read your inbox, we do not read existing drafts or sent mail, and we never send email on your behalf. Every draft stays unsent until you open it in Gmail and choose to send it yourself.</p>
      <p>Your Google OAuth token is stored encrypted and is used only to create drafts. You can revoke this access at any time at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>, and drafting stops working immediately when you do.</p>
      <p>Sponsorprint's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

      <h2>How we use Instagram access</h2>
      <p>If you connect an Instagram business account, we use it only to look up public profile and media data through the Instagram Graph API on your behalf. We do not post, comment, message or change anything on your account.</p>

      <h2>Who can see what</h2>
      <p>Scan results (which brands a public creator has worked with) are shared across Sponsorprint users so the same creator is not scanned twice. Your style guide, signature, roster and drafts are private to your account. Brand contact details are visible to signed-in users only.</p>

      <h2>Sharing</h2>
      <p>We do not sell personal information. We use service providers to run the product: Supabase (database and sign-in), Railway (hosting), Anthropic (the model that writes draft text from the facts you and the scan provide), and Google and Meta (the platform APIs above). Each receives only what it needs to perform its service. We disclose information if required by law.</p>

      <h2>Retention and deletion</h2>
      <p>Account data is kept while your account is active. Email <a href="mailto:privacy@sponsorprint.com">privacy@sponsorprint.com</a> from your sign-in address and we will delete your account, your OAuth tokens, your style guide, roster and drafts within 30 days. Public creator scan data is not personal to you and remains in the index.</p>

      <h2>Security</h2>
      <p>Data is encrypted in transit and at rest. Access tokens are stored server-side and never exposed to the browser.</p>

      <h2>Children</h2>
      <p>Sponsorprint is a business tool and is not directed at anyone under 18.</p>

      <h2>Changes and contact</h2>
      <p>We will post any changes on this page and update the date above. Questions: <a href="mailto:privacy@sponsorprint.com">privacy@sponsorprint.com</a>. See also our <Link href="/terms">Terms of Service</Link>.</p>
    </article>
  );
}
