import { beforeEach, describe, expect, it, vi } from "vitest";

const getWebsiteRedirectDestination = vi.fn();

vi.mock("@/lib/services/website-redirect", () => ({
  getWebsiteRedirectDestination: (...args: unknown[]) =>
    getWebsiteRedirectDestination(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  getWebsiteRedirectDestination.mockReset();
});

describe("GET /visit-website", () => {
  it("temporarily redirects to the saved destination without caching", async () => {
    getWebsiteRedirectDestination.mockResolvedValue("https://myoldwebsite.com/");

    const res = await GET();

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://myoldwebsite.com/");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(getWebsiteRedirectDestination).toHaveBeenCalledWith({ fresh: true });
  });

  it("reads the destination fresh so a change applies on the next click", async () => {
    getWebsiteRedirectDestination
      .mockResolvedValueOnce("https://myoldwebsite.com/")
      .mockResolvedValueOnce("https://mynewwebsite.com/");

    const first = await GET();
    const second = await GET();

    expect(first.headers.get("location")).toBe("https://myoldwebsite.com/");
    expect(second.headers.get("location")).toBe("https://mynewwebsite.com/");
    expect(getWebsiteRedirectDestination).toHaveBeenCalledTimes(2);
  });

  it("shows a safe page instead of guessing when no destination is configured", async () => {
    getWebsiteRedirectDestination.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("isn&rsquo;t available yet");
    expect(html).not.toContain("http-equiv=\"refresh\"");
  });
});
