"use client";

/** Tiny ephemeral toast used by client account lists (no host context needed). */
export function toast(title: string, description?: string) {
  const el = document.createElement("div");
  el.textContent = `${title}${description ? ` — ${description}` : ""}`;
  el.style.cssText =
    "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:300;background:#1c1b18;color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.2)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}