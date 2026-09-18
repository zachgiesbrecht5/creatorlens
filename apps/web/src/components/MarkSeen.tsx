"use client";
import { useRouter } from "next/navigation";
export function MarkSeen() {
  const router = useRouter();
  return <button onClick={async () => { await fetch("/api/watch", { method: "PATCH" }); router.refresh(); }} className="btn-ghost !py-1.5 !text-[12px]">mark all seen</button>;
}
