/**
 * Period resolution and revenue series shaping for the admin dashboard.
 *
 * The dashboard's revenue sparkline used to be a literal SVG path copied from
 * the design mockup, so it showed the same rising line whatever the ledger
 * said. These helpers turn real captured payments into a continuous,
 * zero-filled series and then into an SVG path, so the line can only ever move
 * in response to stored data.
 *
 * Everything here is pure and unit tested; the query lives in the page.
 */

export type PeriodKey =
  | "today"
  | "yesterday"
  | "week"
  | "7d"
  | "30d"
  | "month"
  | "prev_month"
  | "year"
  | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface RevenuePoint {
  /** Bucket key, already formatted for display. */
  label: string;
  /** Bucket start, YYYY-MM-DD for day/hour buckets or YYYY-MM for months. */
  key: string;
  amount: number;
}

/**
 * Bucketing is done entirely in UTC.
 *
 * Truncating on the local day but keying by the UTC date shifted every bucket
 * by the server's offset, so a payment could land in the bucket before the one
 * its label named. The series is also rendered on the client from data the
 * server produced, so a single fixed zone keeps the two in step.
 */
function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolves a period key to a concrete range.
 *
 * Shared with /api/admin/analytics so the dashboard and the analytics API can
 * never disagree about what "last month" means. `now` is injectable for tests.
 */
export function periodToRange(
  period: PeriodKey,
  from?: string | null,
  to?: string | null,
  now: Date = new Date()
): DateRange {
  const todayStart = startOfDayUtc(now);

  switch (period) {
    case "today":
      return { start: todayStart, end: now };

    case "yesterday": {
      const s = new Date(todayStart);
      s.setUTCDate(s.getUTCDate() - 1);
      return { start: s, end: todayStart };
    }

    case "week": {
      const s = new Date(todayStart);
      s.setUTCDate(s.getUTCDate() - 6);
      return { start: s, end: now };
    }

    case "7d": {
      const s = new Date(now);
      s.setUTCDate(s.getUTCDate() - 7);
      return { start: s, end: now };
    }

    case "30d": {
      const s = new Date(now);
      s.setUTCDate(s.getUTCDate() - 30);
      return { start: s, end: now };
    }

    case "month":
      return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: now };

    case "prev_month": {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { start: s, end: e };
    }

    case "year":
      return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: now };

    case "custom": {
      const s = from ? new Date(`${from}T00:00:00Z`) : todayStart;
      // A bare YYYY-MM-DD parses as UTC midnight; an end date is inclusive, so
      // push it to the last instant of that day rather than starting it.
      const e = to ? new Date(`${to}T23:59:59.999Z`) : now;
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        return { start: todayStart, end: now };
      }
      if (e.getTime() < s.getTime()) return { start: todayStart, end: now };
      return { start: s, end: e };
    }
  }
}

type Granularity = "hour" | "day" | "month";

/** Picks a bucket size that keeps a sparkline readable for the given span. */
export function granularityFor(range: DateRange): Granularity {
  const days = (range.end.getTime() - range.start.getTime()) / 86_400_000;
  if (days <= 2) return "hour";
  if (days <= 120) return "day";
  return "month";
}

function bucketKeys(range: DateRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  if (granularity === "hour") {
    // Anchor on the UTC hour so buckets line up with stored timestamps.
    const cursor = new Date(range.start);
    cursor.setUTCMinutes(0, 0, 0);
    while (cursor.getTime() <= range.end.getTime()) {
      keys.push(cursor.toISOString().slice(0, 13) + ":00");
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
    return keys;
  }
  if (granularity === "day") {
    const cursor = startOfDayUtc(range.start);
    while (cursor.getTime() <= range.end.getTime()) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }
  const cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  while (cursor.getTime() <= range.end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function bucketOf(iso: string, granularity: Granularity): string {
  if (granularity === "hour") return `${iso.slice(0, 13)}:00`;
  if (granularity === "day") return iso.slice(0, 10);
  return iso.slice(0, 7);
}

function labelFor(key: string, granularity: Granularity): string {
  if (granularity === "hour") {
    const hour = Number(key.slice(11, 13));
    const suffix = hour < 12 ? "am" : "pm";
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}${suffix}`;
  }
  // Pinned to UTC so the label matches the bucket it was derived from.
  if (granularity === "day") {
    return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Buckets captured payments into a gap-free series over the range.
 *
 * Missing buckets are emitted as zero rather than skipped: a sparkline that
 * silently compresses out a day with no sales misrepresents the trend.
 * Payments outside the range are ignored, and an unparseable `paid_at` is
 * dropped rather than throwing on a ledger row.
 */
export function bucketRevenue(
  payments: Array<{ paid_at: string | null; amount_paise: number | null }>,
  range: DateRange
): RevenuePoint[] {
  const granularity = granularityFor(range);
  const keys = bucketKeys(range, granularity);
  const totals = new Map<string, number>(keys.map((k) => [k, 0]));

  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  for (const payment of payments) {
    if (!payment.paid_at) continue;
    const ms = new Date(payment.paid_at).getTime();
    if (Number.isNaN(ms) || ms < startMs || ms > endMs) continue;
    const key = bucketOf(new Date(ms).toISOString(), granularity);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(payment.amount_paise ?? 0));
  }

  return keys.map((key) => ({
    key,
    label: labelFor(key, granularity),
    // Stored in paise throughout; the card renders rupees.
    amount: (totals.get(key) ?? 0) / 100,
  }));
}

/**
 * Builds an SVG polyline for a sparkline, scaled from zero to the series max.
 *
 * Zero-based rather than min/max-based: a flat week of similar revenue should
 * read as flat, not as dramatic movement. Returns an empty string when there is
 * nothing to draw, so the caller can render an explicit empty state instead of
 * a decorative line implying data.
 */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
  padding = 2
): string {
  const points = plotPoints(values, width, height, padding);
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/** The same series closed to the baseline, for the area fill under the line. */
export function sparklineAreaPath(
  values: number[],
  width: number,
  height: number,
  padding = 2
): string {
  const points = plotPoints(values, width, height, padding);
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  const base = height - padding;
  return `${sparklinePath(values, width, height, padding)} L${last.x.toFixed(2)},${base.toFixed(2)} L${first.x.toFixed(2)},${base.toFixed(2)} Z`;
}

function plotPoints(
  values: number[],
  width: number,
  height: number,
  padding: number
): Array<{ x: number; y: number }> {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];

  const max = Math.max(...finite, 0);
  const usable = Math.max(height - padding * 2, 0);
  const baseline = height - padding;

  return finite.map((value, index) => {
    // A single bucket spans the full width; otherwise distribute evenly.
    const x = finite.length === 1 ? width / 2 : (index / (finite.length - 1)) * width;
    const ratio = max > 0 ? Math.max(value, 0) / max : 0;
    return { x, y: baseline - ratio * usable };
  });
}
