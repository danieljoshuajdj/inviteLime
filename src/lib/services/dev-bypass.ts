/**
 * Local payment-bypass escape hatch.
 *
 * When DEV_BYPASS_PAYMENT=1 a developer can finalize a guest's draft into a
 * live invitation without a real payment, purely to exercise the publish +
 * share-link + email flow locally. It is opt-in via the env flag and is
 * hard-disabled in production builds, so a deployed app can never publish a
 * paid invitation for free.
 *
 * It only ever short-circuits the *payment* step. The publish, media
 * relocation, account linking and both emails are the same functions the real
 * Razorpay verify/webhook paths call (finalizePaidWedding), so what is
 * observed locally is what a real buyer sees.
 */
export function isPaymentBypassEnabled(): boolean {
  return process.env.DEV_BYPASS_PAYMENT === "1" && process.env.NODE_ENV !== "production";
}
