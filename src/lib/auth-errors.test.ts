import { describe, expect, it } from "vitest";

import { friendlyAuthError, friendlyAuthParam, type AuthMode } from "./auth-errors";

function err(message: string, code?: string) {
  const e = new Error(message) as Error & { code?: string };
  if (code) e.code = code;
  return e;
}

const MODES: AuthMode[] = ["login", "register", "reset", "password"];

const GENERIC_COPY: Record<AuthMode, string> = {
  login: "We couldn't sign you in right now. Please try again.",
  register: "We couldn't create your account right now. Please try again.",
  reset: "We couldn't send the reset link right now. Please try again.",
  password: "We couldn't update your password. Please try again.",
};

describe("friendlyAuthError", () => {
  it("explains the email rate limit without exposing the window", () => {
    for (const mode of MODES) {
      const out = friendlyAuthError(err("Email rate limit exceeded", "over_email_send_rate_limit"), mode);
      expect(out).toContain("wait a few minutes");
      expect(out).not.toContain("rate limit exceeded");
      expect(out.toLowerCase()).not.toContain("over_email_send_rate_limit");
    }
  });

  it("covers the per-recipient resend cooldown too", () => {
    // Same code, different wording: "a new email should be sent after 600 seconds".
    const out = friendlyAuthError(
      err("Email sent to this address should be resent after 600 seconds", "over_email_send_rate_limit"),
      "register"
    );
    expect(out).toContain("sign-up emails");
    expect(out).not.toContain("600");
  });

  it("maps the request rate limit to a waiting message", () => {
    expect(friendlyAuthError(err("Request rate limit reached", "over_request_rate_limit"), "login")).toContain(
      "Too many attempts"
    );
    expect(friendlyAuthError(err("Too many requests"), "register")).toContain("Too many attempts");
  });

  it("prompts sign-in when the account already exists", () => {
    const out = friendlyAuthError(err("User already registered", "user_already_exists"), "register");
    expect(out).toContain("already exists");
    expect(out).toContain("signing in");
    // The raw provider wording must not reach the UI.
    expect(out).not.toContain("User already registered");
  });

  it("hides credential detail on failed sign-in", () => {
    expect(friendlyAuthError(err("Invalid login credentials", "invalid_credentials"), "login")).toBe(
      "Incorrect email or password."
    );
  });

  it("tells the user to confirm their email", () => {
    expect(friendlyAuthError(err("Email not confirmed", "email_not_confirmed"), "login")).toContain(
      "confirmed"
    );
    expect(friendlyAuthError(err("Email not confirmed"), "login")).toContain("inbox");
  });

  it("enforces the password length message", () => {
    expect(friendlyAuthError(err("Password should be at least 8 characters", "weak_password"), "register")).toContain(
      "at least 8 characters"
    );
  });

  it("never reveals whether an account exists when resetting", () => {
    const out = friendlyAuthError(err("User not found", "user_not_found"), "reset");
    expect(out).toBe("If an account exists for that email, a reset link is on its way.");
    expect(out).not.toContain("User not found");
  });

  it("flags unreachable networks instead of throwing fetch noise at the user", () => {
    expect(friendlyAuthError(new TypeError("Failed to fetch"), "register")).toContain(
      "internet connection"
    );
  });

  it.each(MODES)("falls back to a mode-appropriate generic message for unknown errors (%s)", (mode) => {
    // A deliberately ugly database/proxy error: none of it may leak through.
    const raw = "Internal: error: relation \"profiles\" does not exist (SQLSTATE 42P01)";
    const out = friendlyAuthError(err(raw, "unexpected_failure"), mode);
    expect(out).toBe(GENERIC_COPY[mode]);
    expect(out).not.toContain("profiles");
    expect(out).not.toContain("42P01");
  });

  it("guides password updates instead of echoing GoTrue's wording", () => {
    expect(friendlyAuthError(err("New password should be different from the old password"), "password")).toBe(
      "Please choose a password you haven't used before."
    );
    expect(friendlyAuthError(err("Password should be at least 8 characters", "weak_password"), "password")).toContain(
      "at least 8 characters"
    );
  });

  it("handles strings and non-errors without crashing", () => {
    expect(friendlyAuthError("something odd", "login")).toContain("sign you in");
    expect(friendlyAuthError(null, "reset")).toContain("reset link");
    expect(friendlyAuthError(undefined, "register")).toContain("account");
  });

  it("does not mislabel an existing account as a rate limit", () => {
    const out = friendlyAuthError(err("User already registered", "user_already_exists"), "register");
    expect(out).not.toContain("Too many");
  });
});

describe("friendlyAuthParam", () => {
  it("translates the callback's known error keys", () => {
    expect(friendlyAuthParam("missing_code")).toContain("incomplete");
    expect(friendlyAuthParam("session_expired")).toContain("expired");
    expect(friendlyAuthParam("exchange_failed")).toContain("sign-in");
  });

  it("never reflects arbitrary text from the URL onto the login page", () => {
    expect(friendlyAuthParam("<img src=x onerror=alert(1)>")).toBe("We couldn't complete sign-in. Please try again.");
    expect(friendlyAuthParam("access_denied")).toBe("We couldn't complete sign-in. Please try again.");
  });

  it("returns null when there is no error parameter", () => {
    expect(friendlyAuthParam(null)).toBeNull();
  });
});
