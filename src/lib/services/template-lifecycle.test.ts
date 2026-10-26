import { describe, expect, it, vi } from "vitest";

import {
  isActiveWedding,
  todayDateString,
  computeTemplateUsage,
  buildTemplateUsageMap,
  fetchTemplateUsage,
  type WeddingTemplateRef,
} from "@/lib/services/template-lifecycle";

function futureDate(): string {
  return `${Number(todayDateString().slice(0, 4)) + 50}-${todayDateString().slice(5)}`;
}

function pastDate(): string {
  return `2000-${todayDateString().slice(5)}`;
}

function wedding(partial: Partial<WeddingTemplateRef> = {}): WeddingTemplateRef {
  return {
    id: "w-1",
    template_id: null,
    template_version_id: null,
    status: "active",
    expiration_date: futureDate(),
    ...partial,
  };
}

describe("isActiveWedding", () => {
  it("is active when status is active and there is no expiration date", () => {
    expect(isActiveWedding({ status: "active", expiration_date: null })).toBe(true);
  });

  it("is active when status is active and expiration is today", () => {
    expect(isActiveWedding({ status: "active", expiration_date: todayDateString() })).toBe(true);
  });

  it("is active when status is active and expiry is in the future", () => {
    expect(isActiveWedding({ status: "active", expiration_date: futureDate() })).toBe(true);
  });

  it("is not active when status is active but the invitation already expired", () => {
    expect(isActiveWedding({ status: "active", expiration_date: pastDate() })).toBe(false);
  });

  it("is not active for draft, expired, or cancelled statuses even with a future expiry", () => {
    for (const status of ["draft", "expired", "cancelled"]) {
      expect(isActiveWedding({ status, expiration_date: futureDate() })).toBe(false);
    }
  });

  it("is not active when status is missing", () => {
    expect(isActiveWedding({ status: null, expiration_date: null })).toBe(false);
  });
});

describe("computeTemplateUsage (Active = live + unexpired; Total = all references)", () => {
  const templateId = "tpl-1";
  const versionId = "ver-1";

  it("counts weddings that pin the template directly", () => {
    const weddings = [
      wedding({ id: "a", template_id: templateId }),
      wedding({ id: "b", template_id: templateId, status: "draft" }),
    ];
    const { activeInvitations, totalInvitations } = computeTemplateUsage(weddings, templateId, []);
    expect(totalInvitations).toBe(2);
    expect(activeInvitations).toBe(1);
  });

  it("counts weddings that pin the template through a version id", () => {
    const weddings = [wedding({ id: "a", template_version_id: versionId })];
    const { activeInvitations, totalInvitations } = computeTemplateUsage(weddings, templateId, [versionId]);
    expect(totalInvitations).toBe(1);
    expect(activeInvitations).toBe(1);
  });

  it("ignores weddings referencing a different template or version", () => {
    const weddings = [
      wedding({ id: "a", template_id: "other" }),
      wedding({ id: "b", template_version_id: "other-ver" }),
    ];
    const { activeInvitations, totalInvitations } = computeTemplateUsage(weddings, templateId, [versionId]);
    expect(totalInvitations).toBe(0);
    expect(activeInvitations).toBe(0);
  });

  it("does not double-count a wedding that matches by both template and version", () => {
    const weddings = [wedding({ id: "a", template_id: templateId, template_version_id: versionId })];
    const { totalInvitations } = computeTemplateUsage(weddings, templateId, [versionId]);
    expect(totalInvitations).toBe(1);
  });

  it("excludes expired invitations from the active count but keeps them in the total", () => {
    const weddings = [
      wedding({ id: "a", template_id: templateId }),
      wedding({ id: "b", template_id: templateId, expiration_date: pastDate(), status: "active" }),
      wedding({ id: "c", template_id: templateId, status: "cancelled" }),
    ];
    const { activeInvitations, totalInvitations } = computeTemplateUsage(weddings, templateId, []);
    expect(totalInvitations).toBe(3);
    expect(activeInvitations).toBe(1);
  });
});

describe("buildTemplateUsageMap", () => {
  it("returns a zero entry for templates with no references and real counts otherwise", () => {
    const weddings = [
      wedding({ id: "a", template_id: "tpl-a", expiration_date: null }),
      wedding({ id: "b", template_id: "tpl-a", status: "draft" }),
      wedding({ id: "c", template_version_id: "ver-b", expiration_date: null }),
    ];
    const versionsByTemplate = new Map<string, string[]>([
      ["tpl-a", ["ver-a1", "ver-a2"]],
      ["tpl-b", ["ver-b"]],
      ["tpl-c", []],
    ]);
    const map = buildTemplateUsageMap(weddings, versionsByTemplate);

    expect(map.get("tpl-a")).toEqual({ activeInvitations: 1, totalInvitations: 2 });
    expect(map.get("tpl-b")).toEqual({ activeInvitations: 1, totalInvitations: 1 });
    expect(map.get("tpl-c")).toEqual({ activeInvitations: 0, totalInvitations: 0 });
  });
});

describe("fetchTemplateUsage (server-side derivation)", () => {
  const TPL = "11111111-1111-4111-8111-111111111111";
  const TPL2 = "22222222-2222-4222-8222-222222222222";
  const VER = "33333333-3333-4333-8333-333333333333";
  const VER2 = "44444444-4444-4444-8444-444444444444";

  function queryReturning(result: unknown) {
    return {
      select: () => queryReturning(result),
      in: () => queryReturning(result),
      then: (cb: (v: unknown) => unknown) => cb(result),
    };
  }

  it("derives counts from template_versions + weddings, never from the caller", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "template_versions") {
          return queryReturning({
            data: [
              { id: VER, template_id: TPL },
              { id: VER2, template_id: TPL2 },
            ],
            error: null,
          });
        }
        if (table === "weddings") {
          // First call: weddings filtered by template_id. Second: by version_id.
          return queryReturning({
            data: [
              { id: "w1", template_id: TPL, template_version_id: VER, status: "active", expiration_date: futureDate() },
              { id: "w2", template_id: TPL, template_version_id: VER, status: "draft", expiration_date: null },
              { id: "w3", template_id: TPL2, template_version_id: VER2, status: "active", expiration_date: null },
            ],
            error: null,
          });
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    const usage = await fetchTemplateUsage(supabase, [TPL]);
    expect(usage.get(TPL)).toEqual({ activeInvitations: 1, totalInvitations: 2 });
    expect(usage.get(TPL2)).toBeUndefined();
  });
});