import { describe, expect, it } from "vitest";

import {
  summarizeTemplateVersions,
  versionState,
  type TemplateVersionHistoryRow,
} from "@/lib/services/template-version-history";

const NOW = Date.parse("2026-11-24T12:00:00.000Z");

function row(
  overrides: Partial<TemplateVersionHistoryRow> & Pick<TemplateVersionHistoryRow, "id">
): TemplateVersionHistoryRow {
  return {
    version: "1.0.0",
    status: "draft",
    is_current: false,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function summarize(rows: TemplateVersionHistoryRow[], retentionHours = 72) {
  return summarizeTemplateVersions({
    versions: rows,
    templateSlug: "granule glitz",
    now: NOW,
    retentionHours,
  });
}

describe("versionState", () => {
  it("maps each lifecycle state", () => {
    expect(versionState({ status: "published", is_current: true })).toBe("current");
    expect(versionState({ status: "previous", is_current: false })).toBe("previous");
    expect(versionState({ status: "published", is_current: false })).toBe("previous");
    expect(versionState({ status: "draft", is_current: false })).toBe("draft");
    expect(versionState({ status: "uploading", is_current: false })).toBe("uploading");
    expect(versionState({ status: "retired", is_current: false })).toBe("retired");
  });
});

describe("summarizeTemplateVersions", () => {
  it("sorts current first, then newest retained release", () => {
    const rows = [
      row({
        id: "old",
        version: "1.0.0",
        status: "previous",
        replaced_at: "2026-11-20T00:00:00.000Z",
        delete_after: "2026-11-23T00:00:00.000Z",
      }),
      row({
        id: "current",
        version: "1.0.2",
        status: "published",
        is_current: true,
        published_at: "2026-11-22T00:00:00.000Z",
      }),
      row({
        id: "newer",
        version: "1.0.1",
        status: "previous",
        replaced_at: "2026-11-21T00:00:00.000Z",
        delete_after: "2026-11-25T00:00:00.000Z",
      }),
    ];

    const result = summarize(rows);
    expect(result.map((entry) => entry.id)).toEqual(["current", "newer", "old"]);
  });

  it("computes the remaining rollback window and restore eligibility", () => {
    const result = summarize([
      row({
        id: "retained",
        status: "previous",
        replaced_at: "2026-11-24T00:00:00.000Z",
        delete_after: "2026-11-27T00:00:00.000Z",
      }),
      row({
        id: "expired",
        status: "previous",
        replaced_at: "2026-11-20T00:00:00.000Z",
        delete_after: "2026-11-23T00:00:00.000Z",
      }),
    ]);

    const retained = result.find((entry) => entry.id === "retained")!;
    expect(retained.state).toBe("previous");
    expect(retained.remainingMs).toBe(60 * 60 * 1000 * 60);
    expect(retained.canRestore).toBe(true);

    const expired = result.find((entry) => entry.id === "expired")!;
    expect(expired.remainingMs).toBe(0);
    expect(expired.canRestore).toBe(false);
  });

  it("allows a legacy previous row without a delete_after value", () => {
    const result = summarize([
      row({ id: "legacy", status: "previous", delete_after: null }),
    ]);
    expect(result[0]?.remainingMs).toBeNull();
    expect(result[0]?.canRestore).toBe(true);
  });

  it("never offers restore for current, draft or retired rows", () => {
    const result = summarize([
      row({ id: "current", status: "published", is_current: true }),
      row({ id: "draft", status: "draft" }),
      row({
        id: "retired",
        status: "retired",
        retired_at: "2026-11-23T00:00:00.000Z",
        retirement_reason: "rollback",
      }),
    ]);
    expect(result.map((entry) => [entry.id, entry.canRestore])).toEqual([
      ["current", false],
      ["draft", false],
      ["retired", false],
    ]);
  });

  it("builds an encoded preview URL scoped to the version", () => {
    const result = summarize([row({ id: "version-id", status: "draft" })]);
    expect(result[0]?.previewUrl).toBe(
      "/templates/granule%20glitz/demo?version=version-id"
    );
  });

  it("uses created_at as the publish time for legacy rows", () => {
    const result = summarize([
      row({
        id: "legacy",
        status: "published",
        is_current: true,
        created_at: "2026-11-02T03:04:05.000Z",
      }),
    ]);
    expect(result[0]?.publishedAt).toBe("2026-11-02T03:04:05.000Z");
  });
});
