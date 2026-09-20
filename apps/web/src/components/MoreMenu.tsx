"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function MoreMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="nav-more" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`nav-more-btn ${open ? "is-open" : ""}`}>More ▾</button>
      {open && (
        <div className="nav-menu" role="menu">
          {items.map((it) => <Link key={it.href} href={it.href} role="menuitem" onClick={() => setOpen(false)}>{it.label}</Link>)}
        </div>
      )}
    </div>
  );
}
