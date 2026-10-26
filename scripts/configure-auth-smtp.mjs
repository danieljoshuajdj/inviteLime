#!/usr/bin/env node
/**
 * Points Supabase Auth at Resend's SMTP relay so signup confirmation and
 * password-reset emails are delivered through Resend instead of Supabase's
 * 2-email/hour built-in sender.
 *
 *   npm run auth:smtp -- --dry-run      # show what would be PATCHed
 *   npm run auth:smtp
 *
 * Options:
 *   --from=<address>    Sender address (must be on a Resend-verified domain)
 *   --sandbox           No verified domain yet: send from Resend's test address
 *                       onboarding@resend.dev (delivers ONLY to your own Resend
 *                       account email — dev/testing until you buy a domain)
 *   --token=<pat>       Supabase personal access token (else SUPABASE_ACCESS_TOKEN)
 *   --max-emails=<n>    Project-wide auth emails per hour (default 60)
 *   --cooldown=<secs>   Seconds between emails to the same address (default 60)
 *   --dry-run           Resolve everything and print the request, PATCH nothing
 *
 * Environment (read from .env.local when not already set):
 *   SUPABASE_ACCESS_TOKEN  Personal access token with auth config write access
 *                          (Owner/Developer role) — supabase.com/dashboard/account/tokens
 *   EMAIL_API_KEY          Resend API key (re_...). Doubles as the SMTP password.
 *   EMAIL_FROM / EMAIL_FROM_NAME  Preferred sender, used when its domain is
 *                          verified in Resend.
 *
 * Credentials only ever go to api.supabase.com (as Supabase's platform config)
 * and api.resend.com. Nothing here is read by the app, and no secret is written
 * to disk or printed in full.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Expected failure: message already printed, no stack trace wanted. */
class Abort extends Error {
  constructor(message) {
    super(message);
    this.expected = true;
  }
}

function fail(message) {
  throw new Abort(message);
}

const args = parseArgs(process.argv.slice(2));

loadEnvFile(".env.local");
loadEnvFile(".env");

if (args.help) {
  console.log(
    [
      "Usage: npm run auth:smtp -- [options]",
      "",
      "  --from=<address>    Sender address (must be on a Resend-verified domain)",
      "  --sandbox           Use Resend's test sender when no domain is verified",
      "                      (mail goes only to your own Resend account email)",
      "  --token=<pat>       Supabase access token (else SUPABASE_ACCESS_TOKEN)",
      "  --max-emails=<n>    Project-wide auth emails per hour (default 60)",
      "  --cooldown=<secs>   Seconds between emails to the same address (default 60)",
      "  --dry-run           Print the request without changing anything",
    ].join("\n")
  );
  process.exit(0);
}

main().catch((err) => {
  if (err instanceof Abort) console.error(`\n${err.message}\n`);
  else console.error(err);
  process.exitCode = 1;
});

async function main() {
  const maxEmails = args["max-emails"] ?? 60;
  const cooldown = args.cooldown ?? 60;

  const projectRef = projectRefFrom(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!projectRef) fail("NEXT_PUBLIC_SUPABASE_URL is not set (or is still a placeholder).");

  const resendKey = process.env.EMAIL_API_KEY;
  if (!resendKey || resendKey === "placeholder" || resendKey.startsWith("re_xxx")) {
    fail(
      [
        "EMAIL_API_KEY is not set to a real Resend API key.",
        "  1. Create a key at https://resend.com/api-keys",
        "  2. Put it in .env.local as EMAIL_API_KEY=re_...",
        "It is also the password Supabase uses for SMTP, so it must be real.",
      ].join("\n")
    );
  }

  const token = args.token || process.env.SUPABASE_ACCESS_TOKEN;
  if (!token && !args["dry-run"]) {
    fail(
      [
        "SUPABASE_ACCESS_TOKEN is not set.",
        "  Create a personal access token at https://supabase.com/dashboard/account/tokens",
        "  (Owner or Developer — Developer may be refused on some plans),",
        "  then add SUPABASE_ACCESS_TOKEN=... to .env.local or export it.",
        "  Re-run with --dry-run to preview without a token.",
      ].join("\n")
    );
  }

  const senderName =
    process.env.EMAIL_FROM_NAME || parseAddress(process.env.EMAIL_FROM).name || "Invite Lime";

  console.log(`Supabase Auth -> Resend SMTP  (project ${projectRef})\n`);

  // ── 1. Which domain may we send from? ───────────────────────────
  const domains = await listResendDomains(resendKey);
  const verified = domains.filter(
    (d) => statusOf(d) === "verified" && String(d.capabilities?.sending ?? "enabled") === "enabled"
  );

  let senderAddress;
  if (verified.length === 0) {
    const known = domains.map((d) => `${domainOf(d)} (${statusOf(d)}, sending ${d.capabilities?.sending ?? "?"})`);
    if (!args.sandbox) {
      fail(
        [
          "No domain in Resend is verified with sending enabled, so SMTP would be rejected.",
          `Known domains: ${known.length ? known.join(", ") : "none"}`,
          "Finish the DNS verification at https://resend.com/domains, then re-run.",
          "No domain yet? Preview/test with --sandbox: it sends from Resend's",
          "test address onboarding@resend.dev, which only reaches the email",
          "address attached to your Resend account.",
        ].join("\n")
      );
    }
    if (args.from) console.log("  note: --from is ignored in sandbox mode (fixed test sender)");
    senderAddress = "onboarding@resend.dev";
    console.log(`  Sender        ${senderName} <${senderAddress}>   [SANDBOX]`);
    console.log("                Resend's test domain — mail is delivered ONLY to the");
    console.log("                address of your Resend account, and only until you");
    console.log("                verify a real domain (re-run this script then).");
  } else {
    senderAddress = resolveSender(parseAddress(process.env.EMAIL_FROM).address, args.from, verified);
    const senderDomain = senderAddress.split("@")[1].toLowerCase();
    if (!verified.some((d) => domainOf(d) === senderDomain)) {
      fail(`Sender ${senderAddress} is not on a verified Resend domain.`);
    }
    console.log(`  Sender        ${senderName} <${senderAddress}>`);
    console.log(`                domain ${senderDomain} is verified in Resend`);
  }
  console.log(`  SMTP          smtp.resend.com:587  user=resend  pass=${mask(resendKey)}`);

  // ── 2. Current auth config (also proves the token works) ────────
  let current = {};
  if (token) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) fail(`Reading auth config failed: HTTP ${res.status} ${await authHint(res)}`);
    current = await res.json();
  } else {
    console.log("  (dry run — auth config not read)");
  }

  // The Management API documents smtp_port as a string while GoTrue parses an
  // int; match whatever type the project already stores and flip on a 400.
  const port = typeof current.smtp_port === "number" ? 587 : "587";

  const payload = {
    smtp_host: "smtp.resend.com",
    smtp_port: port,
    smtp_user: "resend",
    smtp_pass: resendKey,
    smtp_admin_email: senderAddress,
    smtp_sender_name: senderName,
    smtp_max_frequency: cooldown, // seconds between emails to one address (GoTrue default 900)
    rate_limit_email_sent: maxEmails, // auth emails per hour, project-wide (was 2/hour built-in)
    mailer_autoconfirm: false, // confirmation stays ON — never turned off here
    disable_signup: false,
  };

  console.log(
    `  Signup confirmation  ${current.mailer_autoconfirm === true ? "was OFF — switching back ON" : "enabled (mailer_autoconfirm=false)"}`
  );
  console.log(`  Email cap            ${maxEmails} per hour, project-wide`);
  console.log(`  Per-address cooldown ${cooldown}s between emails to the same address`);

  if (args["dry-run"]) {
    console.log(`\nDry run — nothing changed. Would PATCH:\n${maskJson(payload)}`);
    return;
  }

  // ── 3. Apply ────────────────────────────────────────────────────
  console.log("\n  PATCH /v1/projects/{ref}/config/auth ...");
  let res = await patchAuth(token, projectRef, payload);
  if (res.status === 400 && typeof payload.smtp_port === "string") {
    console.log("  rejected with a string port; retrying with a number...");
    res = await patchAuth(token, projectRef, { ...payload, smtp_port: Number(payload.smtp_port) });
  } else if (res.status === 400 && typeof payload.smtp_port === "number") {
    console.log("  rejected with a numeric port; retrying with a string...");
    res = await patchAuth(token, projectRef, { ...payload, smtp_port: String(payload.smtp_port) });
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 600);
    fail(`PATCH failed: HTTP ${res.status} ${body}\n${await authHint(res)}`);
  }

  // ── 4. Confirm what actually landed ─────────────────────────────
  const check = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const after = check.ok ? await check.json() : {};

  const sandbox = senderAddress.endsWith("@resend.dev");

  console.log(
    [
      "",
      "Configured:",
      `  ${after.smtp_host ?? payload.smtp_host}:${after.smtp_port ?? payload.smtp_port} as ${after.smtp_user ?? payload.smtp_user} (pass ${mask(resendKey)})`,
      `  from ${after.smtp_admin_email ?? senderAddress} / "${after.smtp_sender_name ?? senderName}"`,
      `  confirmation emails: ${after.mailer_autoconfirm === false ? "ON" : "OFF — check the dashboard!"}`,
      `  caps: ${after.rate_limit_email_sent ?? maxEmails}/hour total, ${after.smtp_max_frequency ?? cooldown}s per address`,
      "",
      sandbox
        ? [
            "SANDBOX: confirmation/reset mail is only delivered to the email address",
            "of your Resend account — other signups will bounce (Resend 403).",
            "When you have a domain: verify it at https://resend.com/domains and",
            "re-run this script WITHOUT --sandbox to switch to a real sender.",
          ].join("\n")
        : [
            "Verify: register a fresh address at /register — the confirmation mail",
            "should arrive within seconds and show up under Resend -> Logs.",
            "Password resets (forgot-password) use this same path.",
          ].join("\n"),
    ].join("\n")
  );
}

// ── helpers ───────────────────────────────────────────────────────

async function listResendDomains(key) {
  // Resend's API is unversioned: /domains, not /v1/domains.
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 400) {
    const body = (await res.text()).toLowerCase();
    if (body.includes("api key is invalid") || res.status === 401) {
      fail("Resend rejected EMAIL_API_KEY. Create a fresh key at https://resend.com/api-keys.");
    }
    fail(`Resend GET /v1/domains failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  if (!res.ok) fail(`Resend GET /v1/domains failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

function resolveSender(preferred, explicit, verified) {
  const onVerifiedDomain = (addr) => {
    const domain = addr?.split("@")[1]?.toLowerCase();
    return domain && verified.some((d) => domainOf(d) === domain) ? addr : null;
  };

  if (explicit) {
    const chosen = onVerifiedDomain(explicit);
    if (!chosen) {
      fail(
        `--from=${explicit} is not on a verified Resend domain. Verified: ${verified.map(domainOf).join(", ")}`
      );
    }
    return chosen;
  }

  // Use the configured sender when its domain is verified; otherwise keep the
  // local part and move it onto the first verified domain.
  const local = (preferred || "no-reply").split("@")[0];
  return onVerifiedDomain(preferred) ?? `${local}@${domainOf(verified[0])}`;
}

function patchAuth(token, projectRef, body) {
  return fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function authHint(res) {
  if (res.status === 401) return "The access token was rejected — check SUPABASE_ACCESS_TOKEN.";
  if (res.status === 403) {
    return "This token may not change auth config — use an Owner/Developer personal access token.";
  }
  if (res.status === 429) return "Management API rate limit hit — wait a minute and re-run.";
  return "";
}

function parseAddress(value) {
  const raw = (value ?? "").trim();
  const angled = /^(.*)<([^>]+)>\s*$/.exec(raw);
  if (angled) {
    return { name: angled[1].trim().replace(/^"|"$/g, "") || undefined, address: angled[2].trim() };
  }
  return { name: undefined, address: raw || undefined };
}

function statusOf(d) {
  return String(d.status ?? "").toLowerCase();
}

function domainOf(d) {
  return String(d.domain ?? d.name ?? "").toLowerCase();
}

function projectRefFrom(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\./i.exec(url ?? "");
  return m ? m[1] : null;
}

function mask(value) {
  const s = String(value ?? "");
  return s.length > 10 ? `${s.slice(0, 5)}…${s.slice(-4)}` : "••••";
}

function maskJson(payload) {
  return JSON.stringify({ ...payload, smtp_pass: mask(payload.smtp_pass) }, null, 2);
}

function loadEnvFile(file) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) return;
  const readHere = new Set();
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, ""); // inline comment
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Real environment wins; within a file the last occurrence wins, matching
    // dotenv — otherwise the app and this script could read different values
    // from a file with a duplicate key.
    if (!(m[1] in process.env) || readHere.has(m[1])) {
      process.env[m[1]] = value;
      readHere.add(m[1]);
    }
  }
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out["dry-run"] = true;
    else if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      out[k] = v === undefined ? true : /^-?\d+$/.test(v) ? Number(v) : v;
    }
  }
  return out;
}
