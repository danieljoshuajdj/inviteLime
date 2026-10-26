import { Suspense } from "react";
import { UpdatePasswordClient } from "./UpdatePasswordClient";

export const dynamic = "force-dynamic";

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={<p className="font-body-sm text-navy-700">Loading…</p>}>
      <UpdatePasswordClient />
    </Suspense>
  );
}