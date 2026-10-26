import { describe, expect, it } from "vitest";

import {
  escapeLikeTerm,
  hasActiveFilters,
  offsetFor,
  parseInvitationFilters,
  toQueryString,
  PER_PAGE,
} from "./admin-invitations";

describe("parseInvitationFilters", () => {
  it("defaults to the unfiltered first page", () => {
    const f = parseInvitationFilters({});
    expect(f).toEqual({ q: "", status: "all", from: null, to: null, page: 1 });
    expect(hasActiveFilters(f)).toBe(false);
  });

  it("reads the supported params", () => {
    const f = parseInvitationFilters({ q: " meera ", status: "active", from: "2026-01-01", to: "2026-12-31" });
    expect(f.q).toBe("meera");
    expect(f.status).toBe("active");
    expect(f.from).toBe("2026-01-01");
    expect(f.to).toBe("2026-12-31");
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("ignores an unknown status rather than failing", () => {
    expect(parseInvitationFilters({ status: "deleted" }).status).toBe("all");
  });

  it("ignores malformed dates", () => {
    const f = parseInvitationFilters({ from: "01-01-2026", to: "yesterday" });
    expect(f.from).toBeNull();
    expect(f.to).toBeNull();
  });

  it("clamps nonsense page numbers", () => {
    expect(parseInvitationFilters({ page: "0" }).page).toBe(1);
    expect(parseInvitationFilters({ page: "-3" }).page).toBe(1);
    expect(parseInvitationFilters({ page: "abc" }).page).toBe(1);
    expect(parseInvitationFilters({ page: "2" }).page).toBe(2);
  });

  it("takes the first value when a param repeats", () => {
    expect(parseInvitationFilters({ q: ["first", "second"] }).q).toBe("first");
  });

  it("bounds the search term length", () => {
    expect(parseInvitationFilters({ q: "x".repeat(500) }).q).toHaveLength(120);
  });
});

describe("escapeLikeTerm", () => {
  it("escapes PostgREST filter metacharacters", () => {
    expect(escapeLikeTerm("100%_off")).toBe("100\\%\\_off");
    expect(escapeLikeTerm("a,b(c)")).toBe("a\\,b\\(c\\)");
    expect(escapeLikeTerm("back\\slash")).toBe("back\\\\slash");
  });

  it("escapes the dot in an email, since PostgREST reads it as a column separator", () => {
    expect(escapeLikeTerm("meera@example.com")).toBe("meera@example\\.com");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLikeTerm("Meera Aarav")).toBe("Meera Aarav");
    expect(escapeLikeTerm("aarav-weds-meera-2027")).toBe("aarav-weds-meera-2027");
  });
});

describe("offsetFor", () => {
  it("pages by PER_PAGE", () => {
    expect(offsetFor(parseInvitationFilters({}))).toBe(0);
    expect(offsetFor(parseInvitationFilters({ page: "2" }))).toBe(PER_PAGE);
    expect(offsetFor(parseInvitationFilters({ page: "3" }))).toBe(PER_PAGE * 2);
  });
});

describe("toQueryString", () => {
  it("is empty when nothing is set", () => {
    expect(toQueryString(parseInvitationFilters({}))).toBe("");
  });

  it("round-trips active filters", () => {
    const f = parseInvitationFilters({ q: "a@b.com", status: "expired", from: "2026-02-01", page: "3" });
    expect(toQueryString(f)).toContain("q=a%40b.com");
    expect(toQueryString(f)).toContain("status=expired");
    expect(toQueryString(f)).toContain("from=2026-02-01");
    expect(toQueryString(f)).toContain("page=3");
  });

  it("survives a parse round trip", () => {
    const original = parseInvitationFilters({ q: "meera", status: "draft", from: "2026-03-01" });
    const reparsed = parseInvitationFilters(Object.fromEntries(new URLSearchParams(toQueryString(original).slice(1))));
    expect(reparsed).toEqual(original);
  });
});