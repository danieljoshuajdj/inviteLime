import { getWebsiteRedirectDestination } from "@/lib/services/website-redirect";

export const dynamic = "force-dynamic";

/**
 * Public permanent link templates bind to.
 *
 * The destination is read fresh on every request (never cached with the page),
 * so an admin can change it once and every existing invitation follows on the
 * very next click. A 302 is deliberate: browsers and intermediaries must not
 * remember the old destination.
 *
 * When nothing is configured — or the stored value is invalid — this returns a
 * small, safe page instead of guessing a website.
 */
export async function GET() {
  const destination = await getWebsiteRedirectDestination({ fresh: true });

  if (!destination) {
    return new Response(UNAVAILABLE_HTML, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const UNAVAILABLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Website link unavailable</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #f7f3ec;
    color: #1c1b18;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { width: 100%; max-width: 34rem; text-align: center; }
  .kicker {
    margin: 0 0 12px;
    color: #7a5a1e;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .18em;
    text-transform: uppercase;
  }
  h1 { margin: 0; font: 600 clamp(1.6rem, 4vw, 2.2rem)/1.2 ui-serif, Georgia, serif; }
  p { margin: 14px 0 0; color: #5b574f; }
</style>
</head>
<body>
<main>
  <p class="kicker">Invite Lime</p>
  <h1>This invitation&rsquo;s website link isn&rsquo;t available yet.</h1>
  <p>The host hasn&rsquo;t configured a website destination. Please check back later or contact the host directly.</p>
</main>
</body>
</html>`;
