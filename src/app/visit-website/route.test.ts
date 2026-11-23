import { beforeEach, describe, expect, it, vi } from "vitest";

const getWebsiteRedirectDestination = vi.fn();

vi.mock("@/lib/services/website-redirect", () => ({
  getWebsiteRedirectDestination: (...args: unknown[]) =>
    getWebsiteRedirectDestination(...args),
}));

const { GET } = await import("./route");

beforeEach(() => {
  getWebsiteRedirectDestination.mockReset();
});

describe("GET /visit-website", () => {
  it("temporarily redirects to the configured destination", async () => {
    getWebsiteRedirectDestination.mockResolvedValue("https://mywebsite.com/");

    const res = await GET();

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://mywebsite.com/");
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(res.headers.get("Pragma")).toBe("no-cache");
    expect(res.headers.get("X-Robots-Tag")).toMatch(/noindex/);
    // The destination is read fresh so an admin change applies on the next click.
    expect(getWebsiteRedirectDestination).toHaveBeenCalledWith({ fresh: true });
  });

  it("follows a changed destination immediately", async () => {
    getWebsiteRedirectDestination
      .mockResolvedValueOnce("https://old.example/")
      .mockResolvedValueOnce("https://new.example/");

    const first = await GET();
    const second = await GET();

    expect(first.headers.get("Location")).toBe("https://old.example/");
    expect(second.headers.get("Location")).toBe("https://new.example/");
    expect(getWebsiteRedirectDestination).toHaveBeenCalledTimes(2);
  });

  it("shows a safe page instead of redirecting when nothing is configured", async () => {
    getWebsiteRedirectDestination.mockResolvedValue(null);

    const res = await GET();
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(body).toContain("available yet");
    expect(body).toContain("hasn&rsquo;t configured");
    expect(body).not.toContain("http://");
    expect(body).not.toContain("https://");
  });
});
