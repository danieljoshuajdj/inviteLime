import { describe, expect, it } from "vitest";

import {
  bucketRevenue,
  granularityFor,
  periodToRange,
  sparklineAreaPath,
  sparklinePath,
} from "./revenue-series";

const NOW = new Date("2026-03-15T12:30:00.000Z");

describe("periodToRange", () => {
  it("resolves today to the start of the UTC day through now", () => {
    const { start, end } = periodToRange("today", null, null, NOW);
    expect(start.getUTCDate()).toBe(15);
    expect(start.getUTCHours()).toBe(0);
    expect(end.getTime()).toBe(NOW.getTime());
  });

  it("resolves week to the last seven days including today", () => {
    const { start, end } = periodToRange("week", null, null, NOW);
    expect(end.getTime()).toBe(NOW.getTime());
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("resolves year to January 1st of the current year", () => {
    const { start, end } = periodToRange("year", null, null, NOW);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getTime()).toBe(NOW.getTime());
  });

  it("treats a custom end date as inclusive of that whole day", () => {
    const { start, end } = periodToRange("custom", "2026-01-01", "2026-01-31", NOW);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("falls back to today when the custom range is unusable", () => {
    for (const [from, to] of [
      ["not-a-date", "2026-01-31"],
      ["2026-01-01", "nonsense"],
      ["2026-02-10", "2026-01-01"],
    ] as const) {
      const { start, end } = periodToRange("custom", from, to, NOW);
      expect(end.getTime()).toBe(NOW.getTime());
      expect(start.toISOString()).toBe("2026-03-15T00:00:00.000Z");
    }
  });
});

describe("granularityFor", () => {
  it("uses hours for spans up to two days", () => {
    const start = new Date("2026-03-15T00:00:00Z");
    expect(granularityFor({ start, end: new Date("2026-03-16T00:00:00Z") })).toBe("hour");
  });

  it("uses days for medium spans", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    expect(granularityFor({ start, end: new Date("2026-03-15T00:00:00Z") })).toBe("day");
  });

  it("uses months for spans beyond 120 days", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    expect(granularityFor({ start, end: new Date("2026-12-31T00:00:00Z") })).toBe("month");
  });
});

describe("bucketRevenue", () => {
  const range = {
    start: new Date("2026-03-10T00:00:00Z"),
    end: new Date("2026-03-14T23:59:59Z"),
  };
  const byKey = (points: Array<{ key: string; amount: number }>, key: string) =>
    points.find((p) => p.key === key)?.amount;

  it("emits one point per day with gaps filled as zero", () => {
    const points = bucketRevenue(
      [
        { paid_at: "2026-03-10T05:00:00Z", amount_paise: 100_00 },
        { paid_at: "2026-03-14T05:00:00Z", amount_paise: 250_00 },
      ],
      range
    );

    expect(points.map((p) => p.key)).toEqual([
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
    ]);
    expect(points.map((p) => p.amount)).toEqual([100, 0, 0, 0, 250]);
  });

  it("sums several payments landing in the same bucket", () => {
    const points = bucketRevenue(
      [
        { paid_at: "2026-03-11T01:00:00Z", amount_paise: 100_00 },
        { paid_at: "2026-03-11T23:00:00Z", amount_paise: 50_00 },
      ],
      range
    );
    expect(byKey(points, "2026-03-11")).toBe(150);
  });

  it("ignores payments outside the range", () => {
    const points = bucketRevenue(
      [
        { paid_at: "2026-03-01T00:00:00Z", amount_paise: 999_00 },
        { paid_at: "2026-04-01T00:00:00Z", amount_paise: 999_00 },
      ],
      range
    );
    expect(points.every((p) => p.amount === 0)).toBe(true);
  });

  it("drops rows with a missing or unparseable paid_at instead of throwing", () => {
    const points = bucketRevenue(
      [
        { paid_at: null, amount_paise: 500_00 },
        { paid_at: "garbage", amount_paise: 500_00 },
        { paid_at: "2026-03-12T00:00:00Z", amount_paise: 10_00 },
      ],
      range
    );
    expect(byKey(points, "2026-03-12")).toBe(10);
    expect(points.reduce((n, p) => n + p.amount, 0)).toBe(10);
  });

  it("treats a null amount as zero", () => {
    const points = bucketRevenue([{ paid_at: "2026-03-10T05:00:00Z", amount_paise: null }], range);
    expect(byKey(points, "2026-03-10")).toBe(0);
  });

  it("returns an all-zero series when there are no payments at all", () => {
    const points = bucketRevenue([], range);
    expect(points).toHaveLength(5);
    expect(points.every((p) => p.amount === 0)).toBe(true);
  });

  it("buckets hourly over a sub-two-day span", () => {
    const points = bucketRevenue(
      [{ paid_at: "2026-03-10T04:30:00Z", amount_paise: 42_00 }],
      { start: new Date("2026-03-10T00:00:00Z"), end: new Date("2026-03-10T05:00:00Z") }
    );
    expect(points.map((p) => p.key)).toEqual([
      "2026-03-10T00:00",
      "2026-03-10T01:00",
      "2026-03-10T02:00",
      "2026-03-10T03:00",
      "2026-03-10T04:00",
      "2026-03-10T05:00",
    ]);
    expect(byKey(points, "2026-03-10T04:00")).toBe(42);
  });

  it("excludes a payment that lands after the range end", () => {
    const points = bucketRevenue(
      [{ paid_at: "2026-03-10T05:30:00Z", amount_paise: 42_00 }],
      { start: new Date("2026-03-10T00:00:00Z"), end: new Date("2026-03-10T05:00:00Z") }
    );
    expect(points.reduce((n, p) => n + p.amount, 0)).toBe(0);
  });

  it("switches to monthly buckets past 120 days", () => {
    const points = bucketRevenue(
      [{ paid_at: "2026-02-10T00:00:00Z", amount_paise: 700_00 }],
      { start: new Date("2026-01-01T00:00:00Z"), end: new Date("2026-09-30T00:00:00Z") }
    );
    expect(points.map((p) => p.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(byKey(points, "2026-02")).toBe(700);
  });

  it("keeps the ledger total equal to the sum of the series", () => {
    const payments = [
      { paid_at: "2026-03-10T01:00:00Z", amount_paise: 111_00 },
      { paid_at: "2026-03-11T01:00:00Z", amount_paise: 222_00 },
      { paid_at: "2026-03-14T01:00:00Z", amount_paise: 333_00 },
    ];
    const total = bucketRevenue(payments, range).reduce((n, p) => n + p.amount, 0);
    expect(total).toBe(666);
  });
});

describe("sparklinePath", () => {
  it("returns an empty string when there is nothing to plot", () => {
    expect(sparklinePath([], 240, 32)).toBe("");
    expect(sparklinePath([Number.NaN, Number.NaN], 240, 32)).toBe("");
    expect(sparklineAreaPath([], 240, 32)).toBe("");
  });

  it("spans the full width from the first to the last bucket", () => {
    const d = sparklinePath([0, 5, 10], 240, 32, 2);
    expect(d.startsWith("M0.00,")).toBe(true);
    expect(d).toContain("L240.00,");
  });

  it("puts the largest value at the top and zero at the baseline", () => {
    const d = sparklinePath([0, 10], 240, 32, 2);
    const ys = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));
    // padding 2 => baseline 30, top 2
    expect(Math.max(...ys)).toBeCloseTo(30);
    expect(Math.min(...ys)).toBeCloseTo(2);
  });

  it("is zero-based, so a flat series stays flat instead of exaggerating", () => {
    const flat = sparklinePath([100, 100, 100], 240, 32, 2);
    const rising = sparklinePath([100, 200, 300], 240, 32, 2);
    const ys = [...flat.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));
    expect(new Set(ys).size).toBe(1);
    expect(flat).not.toBe(rising);
  });

  it("draws a level line for an all-zero series rather than dividing by zero", () => {
    const d = sparklinePath([0, 0, 0], 240, 32, 2);
    const ys = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => Number(m[2]));
    expect(d).not.toContain("NaN");
    expect(new Set(ys)).toEqual(new Set([30]));
  });

  it("centres a single bucket instead of dividing by a zero interval", () => {
    const d = sparklinePath([500], 240, 32, 2);
    expect(d).toBe("M120.00,2.00");
    expect(d).not.toContain("NaN");
  });

  it("never emits NaN for negative or infinite values", () => {
    const d = sparklinePath([-50, 10, Number.POSITIVE_INFINITY], 240, 32, 2);
    expect(d).not.toContain("NaN");
  });

  it("closes the area path back to the baseline", () => {
    const area = sparklineAreaPath([0, 10, 5], 240, 32, 2);
    expect(area.endsWith("Z")).toBe(true);
    expect(area).toContain("L240.00,30.00");
    expect(area).toContain("L0.00,30.00");
  });

  it("reacts to the data: a different series yields a different line", () => {
    const a = sparklinePath([1, 2, 3], 240, 32, 2);
    const b = sparklinePath([3, 2, 1], 240, 32, 2);
    expect(a).not.toBe(b);
  });
});
