import { createGuestSession } from "@/lib/services/guest";
import { jsonError } from "@/lib/services/helpers";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await createGuestSession();
    const maxAge = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return Response.json(
      { session },
      {
        headers: {
          "Set-Cookie": [
            `vc_guest_token=${session.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
            `vc_guest_session=${session.id}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
          ].join(", "),
        },
      }
    );
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not create guest session");
  }
}