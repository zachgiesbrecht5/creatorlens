import { creatorContext } from "@/lib/creator-portal";
export default async function Off() {
  const ctx = await creatorContext();
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="label mb-2">Sponsorprint</div>
      <h1 className="h1">Your page is being set up</h1>
      <p className="mt-3 text-[14px] text-muted">{ctx ? `Hi ${ctx.roster.name.split(" ")[0]}. Your manager is finishing your page. Nothing to do on your side; it opens from this same link.` : "This account isn't linked to a creator yet."}</p>
    </div>
  );
}
