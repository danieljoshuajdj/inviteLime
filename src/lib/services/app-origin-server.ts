import "server-only";

import { headers } from "next/headers";

import { resolvePublicAppOrigin, resolveRuntimeAppOrigin } from "./app-origin";

/**
 * Request-scoped origin helpers for Server Components and `generateMetadata`.
 *
 * Route handlers already have a `Request` and should call the pure resolvers
 * with `req.headers` directly, avoiding an extra request-store dependency.
 */
export async function getRuntimeAppOrigin(): Promise<string> {
  return resolveRuntimeAppOrigin(await headers());
}

export async function getPublicAppOrigin(): Promise<string> {
  return resolvePublicAppOrigin(await headers());
}
