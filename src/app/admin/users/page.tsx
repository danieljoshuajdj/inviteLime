import { listUsers, type AdminUserRow } from "@/lib/services/admin";
import { UsersManager } from "@/components/admin/UsersManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { createServerClient } from "@/lib/supabase/server";
import { listPlannerPlans } from "@/lib/services/planner-plans";

export const dynamic = "force-dynamic";

// Mock users for local development when Supabase isn't configured
const mockUsers = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "admin@invite-lime.example",
    phone: null,
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    lastSignInAt: new Date().toISOString(),
    profile: { full_name: "Admin User", role: "admin" as const, status: "active" as const, avatar_url: null },
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "priya.sharma@invite-lime.example",
    phone: "+91 98765 43210",
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    lastSignInAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    profile: { full_name: "Priya Sharma", role: "customer" as const, status: "active" as const, avatar_url: null },
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "rajesh.kumar@invite-lime.example",
    phone: "+91 98765 43211",
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    lastSignInAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    profile: { full_name: "Rajesh Kumar", role: "planner" as const, status: "active" as const, avatar_url: null },
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "anita.desai@invite-lime.example",
    phone: "+91 98765 43212",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    lastSignInAt: null,
    profile: { full_name: "Anita Desai", role: "customer" as const, status: "pending" as const, avatar_url: null },
  },
];

export default async function AdminUsersPage() {
  let users: AdminUserRow[] = [];
  let count = 0;
  let plans: Awaited<ReturnType<typeof listPlannerPlans>> = [];

  // The signed-in admin's own id, so the UI can badge it and refuse self-delete.
  // Preview mode has no session; the zero id then matches no row.
  let currentUserId = "00000000-0000-0000-0000-000000000000";
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) currentUserId = user.id;
  } catch {
    // No session (e.g. preview) — keep the inert zero id.
  }

  try {
    const result = await listUsers({ page: 1, perPage: 200 });
    users = result.users;
    count = result.count;
    plans = await listPlannerPlans({ includeInactive: false }).catch(() => []);
  } catch {
    // Sample rows are for local UI review only. Outside preview mode a
    // failure must render as an empty list, never as invented accounts.
    if (isAdminPreviewMode()) {
      users = mockUsers as AdminUserRow[];
      count = mockUsers.length;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">People</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Users</h1>
        </div>
        <p className="font-body-xs text-on-surface-variant">{count ?? users.length} accounts</p>
      </div>

      <div className="mt-6">
        <UsersManager
          currentUserId={currentUserId}
          users={users.map((u) => ({
            id: u.id,
            email: u.email,
            phone: u.phone,
            createdAt: u.createdAt,
            lastSignInAt: u.lastSignInAt,
            fullName: u.profile?.full_name ?? null,
            role: u.profile?.role ?? "customer",
            status: u.profile?.status ?? "pending",
            plannerPlan: u.plannerPlan,
          }))}
          plans={plans.map((p) => ({
            id: p.id,
            name: p.name,
            monthlyPricePaise: p.monthly_price_paise,
            yearlyPricePaise: p.yearly_price_paise,
            currency: p.currency,
            monthlyInvitationLimit: p.monthly_invitation_limit,
            yearlyInvitationLimit: p.yearly_invitation_limit,
          }))}
        />
      </div>
    </div>
  );
}