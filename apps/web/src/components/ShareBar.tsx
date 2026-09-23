"use client";
import { useState } from "react";
export function ShareBar({ url, name, og }: { url: string; name: string; og: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${name}'s sponsor print: every brand that has paid them, on one receipt.`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn-dark !py-1.5 !text-[12px]">{copied ? "copied ✓" : "copy link"}</button>
      <a href={og} target="_blank" rel="noreferrer" download={`${name.replace(/[^A-Za-z0-9]+/g, "-")}-sponsorprint.png`} className="btn-ghost !py-1.5 !text-[12px]">open as image</a>
      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 !text-[12px]">post on X</a>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 !text-[12px]">share on LinkedIn</a>
      <span className="num text-[10.5px] text-dim">public data only · no contacts on the public print</span>
    </div>
  );
}
