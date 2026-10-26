/**
 * Maps raw Supabase Auth errors to messages we are willing to show a person.
 *
 * Supabase errors leak provider internals (rate-limit windows, GoTrue codes,
 * "User already registered") straight into the UI. Nothing is passed through
 * verbatim: callers should log the original for debugging and display only
 * what this returns.
 */
export type AuthMode = "login" | "register" | "reset" | "password";

const GENERIC: Record<AuthMode, string> = {
  login: "We couldn't sign you in right now. Please try again.",
  register: "We couldn't create your account right now. Please try again.",
  reset: "We couldn't send the reset link right now. Please try again.",
  password: "We couldn't update your password. Please try again.",
};

const EMAIL_LIMIT: Record<AuthMode, string> = {
  login: "Too many emails have been sent for this address. Please wait a few minutes and try again.",
  register:
    "Too many sign-up emails have been sent for this address. Please wait a few minutes and try again.",
  reset: "Too many reset emails have been sent for this address. Please wait a few minutes and try again.",
  password: "Too many emails have been sent for this address. Please wait a few minutes and try again.",
};

const TOO_MANY_ATTEMPTS =
  "Too many attempts from this device. Please wait a minute and try again.";

interface RawError {
  code?: string;
  message?: string;
}

function read(error: unknown): RawError {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    };
  }
  return { message: typeof error === "string" ? error : undefined };
}

export function friendlyAuthError(error: unknown, mode: AuthMode): string {
  const { code, message } = read(error);
  // Codes and messages are compared together so a stripped-down AuthError
  // (no code) still matches on wording alone.
  const text = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  const has = (c: string) => code === c;
  const says = (re: RegExp) => re.test(text);

  if (has("over_request_rate_limit") || says(/request rate limit reached|too many requests/)) {
    return TOO_MANY_ATTEMPTS;
  }
  // Same code covers both the project-wide hourly cap and the per-recipient
  // resend cooldown ("Email rate limit exceeded").
  if (has("over_email_send_rate_limit") || says(/email (send )?rate limit|emails? (have|has) been sent/)) {
    return EMAIL_LIMIT[mode];
  }
  if (says(/rate limit/)) return TOO_MANY_ATTEMPTS;

  if (
    has("user_already_exists") ||
    says(/already (been )?registered|user already exists|email address already exists/)
  ) {
    if (mode === "register") {
      return "An account with this email already exists. Try signing in instead.";
    }
  }

  if (has("invalid_credentials") || says(/invalid login credentials/)) {
    if (mode === "login") return "Incorrect email or password.";
  }

  if (has("email_not_confirmed") || says(/email not confirmed/)) {
    return "This email address hasn't been confirmed yet. Check your inbox for the confirmation link.";
  }

  // GoTrue: "New password should be different from the old password."
  if (says(/different from the (old|previous|current)/)) {
    return "Please choose a password you haven't used before.";
  }

  if (has("weak_password") || says(/password (should be|must be|is too)/)) {
    return "Your password must be at least 8 characters.";
  }

  if (has("email_address_invalid") || says(/invalid email address|invalid .*email/)) {
    return "That email address doesn't look valid. Please check it and try again.";
  }

  if (
    has("email_address_not_authorized") ||
    says(/email address not authorized|email sending is not allowed/)
  ) {
    return "We can't send email to this address yet. Please use a different one.";
  }

  if (has("signup_disabled") || says(/signups? (is |are )?(not allowed|disabled)/)) {
    return "Registration is currently closed. Please contact us for an invite.";
  }

  // Recovery for an unknown address: answer with the same copy the success
  // path uses so the form cannot be used to probe which emails exist.
  if (has("user_not_found") || says(/user not found/)) {
    if (mode === "reset") return "If an account exists for that email, a reset link is on its way.";
  }

  if (
    has("session_not_found") ||
    has("refresh_token_not_found") ||
    says(/jwt expired|session not found|refresh token not found/)
  ) {
    return "Your session has expired. Please sign in again.";
  }

  if (says(/failed to fetch|networkerror|network request failed|load failed/)) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }

  return GENERIC[mode];
}

/**
 * Errors that arrive as a `?error=` key from the auth callback. Only known
 * keys are honoured, so a crafted URL cannot put arbitrary text on the login
 * page — anything unexpected falls back to generic copy.
 */
export function friendlyAuthParam(key: string | null): string | null {
  if (!key) return null;
  const known: Record<string, string> = {
    missing_code: "That sign-in link looks incomplete. Please open the link from your email again.",
    session_expired: "That sign-in link has expired. Please open the most recent email or request a new one.",
    exchange_failed: "We couldn't complete sign-in. Please try again.",
  };
  return known[key] ?? "We couldn't complete sign-in. Please try again.";
}
