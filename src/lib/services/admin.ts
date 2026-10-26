import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/services/helpers";

const ALLOWED_ROLES = ["customer", "planner", "admin"] as const;
const ALLOWED_STATUSES = ["active", "inactive", "pending"] as const;

export type Role = (typeof ALLOWED_ROLES)[number];
export type AccountStatus = (typeof ALLOWED_STATUSES)[number];

export interface AdminUserRow {
  id: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  profile: {
    full_name: string | null;
    role: Role;
    status: AccountStatus;
    avatar_url: string | null;
  } | null;
  plannerPlan: {
    subscriptionId: string;
    planId: string;
    planName: string;
    billingCycle: "monthly" | "yearly";
    status: string;
    currentPeriodEnd: string;
    invitationsUsed: number;
    invitationLimitOverride: number | null;
    source: string;
  } | null;
}

export async function listUsers(opts: { page?: number; perPage?: number } = {}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: opts.page ?? 1,
    perPage: opts.perPage ?? 100,
  });
  if (error) throw new Error(error.message);
  const authUsers = data.users;
  const count = data.total;
  const ids = authUsers.map((u) => u.id);

  const { data: profiles } = await supabase.from("profiles").select("*").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: subscriptions } = await supabase
    .from("planner_subscriptions")
    .select("id, profile_id, plan_id, billing_cycle, status, current_period_end, created_at, invitations_used, invitation_limit_override, source, planner_plans(name)")
    .in("profile_id", ids);

  // Match the entitlement resolver: a live (or past-due) row is the current
  // plan even if a newer cancelled row ends later. Only when nothing is live
  // should the most recently created historical row be shown.
  const statusRank = (status: string) =>
    status === "active" || status === "past_due" ? 2 : status === "pending" ? 1 : 0;
  const rankedSubscriptions = [...(subscriptions ?? [])].sort((a, b) => {
    const rank = statusRank(b.status) - statusRank(a.status);
    if (rank !== 0) return rank;
    const end = String(b.current_period_end).localeCompare(String(a.current_period_end));
    if (end !== 0) return end;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  const planByProfile = new Map<string, NonNullable<AdminUserRow["plannerPlan"]>>();
  for (const sub of rankedSubscriptions) {
    if (planByProfile.has(sub.profile_id)) continue;
    const joined = sub.planner_plans as unknown as { name: string } | { name: string }[] | null;
    const planName = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    planByProfile.set(sub.profile_id, {
      subscriptionId: sub.id,
      planId: sub.plan_id,
      planName: planName ?? "Planner plan",
      billingCycle: sub.billing_cycle as "monthly" | "yearly",
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      invitationsUsed: sub.invitations_used,
      invitationLimitOverride: sub.invitation_limit_override,
      source: sub.source,
    });
  }

  const users: AdminUserRow[] = authUsers.map((u) => {
    const p = byId.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      phone: u.phone ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      profile: p
        ? {
            full_name: p.full_name,
            role: p.role as Role,
            status: p.status as AccountStatus,
            avatar_url: p.avatar_url,
          }
        : null,
      plannerPlan: planByProfile.get(u.id) ?? null,
    };
  });

  return { users, count };
}

export async function updateUserRole(userId: string, role: string) {
  if (!ALLOWED_ROLES.includes(role as Role)) throw new Error("Invalid role");
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ role: role as Role }).eq("id", userId);
  if (error) throw new Error(error.message);
  await supabase.auth.admin.updateUserById(userId, { user_metadata: { role } });
}

export async function updateUserStatus(userId: string, status: string) {
  if (!ALLOWED_STATUSES.includes(status as AccountStatus)) throw new Error("Invalid status");
  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ status: status as AccountStatus }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export function isAllowedRole(role: string): role is Role {
  return (ALLOWED_ROLES as readonly string[]).includes(role);
}

export function isAllowedStatus(status: string): status is AccountStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(status);
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown>
) {
  try {
    const supabase = createAdminClient();
    await supabase.from("audit_logs").insert({
      admin_id: adminId,
      action,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
      metadata: (metadata as never) ?? {},
    });
  } catch {
    // auditing must not block the action itself.
  }
}

export function adminApiError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    if (error.message === "ADMIN_REQUIRED") return jsonError(403, "Admins only");
    return jsonError(400, error.message);
  }
  return jsonError(500, "Unknown error");
}