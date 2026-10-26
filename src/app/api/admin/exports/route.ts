/**
 * Admin CSV export endpoint.
 *
 * GET /api/admin/exports?type=orders|users|weddings|rsvps&from=ISO&to=ISO
 *
 * Returns a streaming CSV download. All exports require admin role.
 * Never exports data beyond the admin's authorization scope.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportType = "orders" | "users" | "weddings" | "rsvps";

export async function GET(req: Request) {
  const supabase = await createServerClient();
  try {
    await requireAdmin(supabase);

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "") as ExportType;
    const from = searchParams.get("from") ?? null;
    const to = searchParams.get("to") ?? null;

    if (!["orders", "users", "weddings", "rsvps"].includes(type)) {
      return Response.json({ error: "Invalid export type. Use: orders, users, weddings, rsvps" }, { status: 400 });
    }

    const csv = await generateCsv(type, from, to);
    const filename = `invite-lime-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return adminApiError(e);
  }
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

async function generateCsv(type: ExportType, from: string | null, to: string | null): Promise<string> {
  const adminClient = createAdminClient();
  const rows: string[] = [];

  switch (type) {
    case "orders": {
      rows.push(csvRow(["Order ID", "Customer", "Email", "Wedding", "Product", "Amount (paise)", "Currency", "Payment Status", "Payment Provider", "Created At", "Paid At"]));
      let q = adminClient
        .from("orders")
        .select("id, user_id, wedding_id, product_id, amount_paise, currency, status, provider, created_at, paid_at, provider_order_id")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data } = await q;
      for (const row of data ?? []) {
        rows.push(csvRow([row.id, row.user_id ?? "", "", row.wedding_id ?? "", row.product_id ?? "", row.amount_paise, row.currency, row.status, row.provider, row.created_at, row.paid_at ?? ""]));
      }
      break;
    }

    case "users": {
      rows.push(csvRow(["User ID", "Name", "Email", "Role", "Status", "Created At"]));
      const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 10000 });
      const ids = (authData?.users ?? []).map((u) => u.id);
      const { data: profiles } = ids.length
        ? await adminClient.from("profiles").select("id, full_name, role, status, created_at").in("id", ids)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      for (const u of authData?.users ?? []) {
        const p = profileMap.get(u.id);
        rows.push(csvRow([u.id, p?.full_name ?? "", u.email ?? "", p?.role ?? "customer", p?.status ?? "active", u.created_at]));
      }
      break;
    }

    case "weddings": {
      rows.push(csvRow(["Wedding ID", "Bride", "Groom", "Customer (User ID)", "Template", "Status", "Wedding Date", "Published At", "Created At"]));
      let q = adminClient
        .from("weddings")
        .select("id, bride_name, groom_name, user_id, template_id, status, wedding_date, published_at, created_at")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data } = await q;
      for (const row of data ?? []) {
        rows.push(csvRow([row.id, row.bride_name ?? "", row.groom_name ?? "", row.user_id ?? "", row.template_id, row.status, row.wedding_date ?? "", row.published_at ?? "", row.created_at]));
      }
      break;
    }

    case "rsvps": {
      rows.push(csvRow(["Wedding", "Guest Name", "Guest Email", "Guest Phone", "Attendance", "Guests Count", "Dietary", "Message", "Created At"]));
      let q = adminClient
        .from("rsvp_responses")
        .select("wedding_id, name, email, phone, attendance, guests, dietary, message, created_at")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data } = await q;
      for (const row of data ?? []) {
        rows.push(csvRow([row.wedding_id, row.name, row.email ?? "", row.phone ?? "", row.attendance, row.guests, row.dietary ?? "", row.message ?? "", row.created_at]));
      }
      break;
    }
  }

  return rows.join("\n");
}
