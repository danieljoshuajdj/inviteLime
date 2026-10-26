// Promotes an existing user (by email) to admin.
// Usage: node scripts/promote-admin.mjs <email>
// Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || key.startsWith("placeholder")) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: user, error: userError } = await admin.auth.admin.getUserByEmail(email);
if (userError || !user) {
  console.error("User not found:", email);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { role: "admin" },
  user_metadata: { role: "admin" },
});
if (error) {
  console.error("Failed to update auth metadata:", error.message);
  process.exit(1);
}

const { error: profileError } = await admin
  .from("profiles")
  .update({ role: "admin", status: "active" })
  .eq("id", user.id);

if (profileError) {
  console.error("Failed to update profile:", profileError.message);
  process.exit(1);
}

console.log(`Promoted ${email} (${user.id}) to admin.`);