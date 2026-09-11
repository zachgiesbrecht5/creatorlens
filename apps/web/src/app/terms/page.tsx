import Link from "next/link";

export const metadata = { title: "Terms of Service | Sponsorprint" };

export default function Terms() {
  return (
    <article className="prose-sp mx-auto max-w-2xl">
      <div className="label mb-2">Legal</div>
      <h1 className="h2">Terms of Service</h1>
      <p className="mt-2 font-mono text-[11px] text-dim">Last updated September 11, 2026</p>

      <p>Sponsorprint is provided by 10213453 Manitoba Ltd. ("we"). By using it you agree to these terms.</p>

      <h2>What you can do</h2>
      <p>Use Sponsorprint to research public creator sponsorships and to prepare outreach emails for creators you represent or work with. You are responsible for every email you send; Sponsorprint only creates drafts.</p>

      <h2>What you can't do</h2>
      <ul>
        <li>Send unsolicited bulk email, or email that violates anti-spam laws (CASL, CAN-SPAM, GDPR and similar) using drafts we prepare.</li>
        <li>Scrape, resell or redistribute the index, contact data or scan results.</li>
        <li>Use the service to harass anyone, impersonate a creator or brand, or misrepresent who you represent.</li>
        <li>Attempt to access another user's private data or interfere with the service.</li>
      </ul>

      <h2>Accuracy</h2>
      <p>Sponsorship detection is automated from public content and can be wrong. Evidence links are provided so you can verify before you pitch. We make no guarantee that a brand contact is current or that a brand will respond.</p>

      <h2>Beta</h2>
      <p>Sponsorprint is in beta and provided free. Limits (scans, drafts) may change. We may suspend accounts that misuse the service. We may introduce paid plans with notice.</p>

      <h2>Liability</h2>
      <p>The service is provided as is. To the extent permitted by law we are not liable for indirect or consequential damages arising from its use. Our total liability is limited to the amount you paid us in the prior 12 months, which during beta is zero.</p>

      <h2>Privacy</h2>
      <p>Our <Link href="/privacy">Privacy Policy</Link> explains what we collect and how Gmail and Instagram access are used.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Manitoba, Canada.</p>

      <p>Contact: <a href="mailto:privacy@sponsorprint.com">privacy@sponsorprint.com</a></p>
    </article>
  );
}
