import { describe, expect, it, vi } from "vitest";

import {
  RsvpSubmissionError,
  normalizeRsvpEmail,
  submitRsvpResponse,
  type SubmitRsvpInput,
} from "./rsvp";
import type { AdminClient } from "@/lib/supabase/admin";

const WEDDING_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function baseInput(overrides: Partial<SubmitRsvpInput> = {}): SubmitRsvpInput {
  return {
    weddingId: WEDDING_ID,
    name: "Priya Sharma",
    email: "Priya.Sharma@Example.com",
    phone: "+91 98765 43210",
    attendance: "attending",
    guests: 2,
    ...overrides,
  };
}

function stubClient(response: { data?: unknown; error?: { message: string; code: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: response.data ?? null, error: response.error ?? null });
  return { client: { rpc } as unknown as AdminClient, rpc };
}

describe("normalizeRsvpEmail", () => {
  it("trims and lower-cases an address", () => {
    expect(normalizeRsvpEmail("  Guest@Example.COM ")).toBe("guest@example.com");
  });

  it("treats blank, whitespace-only and missing values as no email", () => {
    expect(normalizeRsvpEmail("")).toBeNull();
    expect(normalizeRsvpEmail("   ")).toBeNull();
    expect(normalizeRsvpEmail(null)).toBeNull();
    expect(normalizeRsvpEmail(undefined)).toBeNull();
  });
});

describe("submitRsvpResponse", () => {
  it("sends the guest through the submit_rsvp function with a normalized email", async () => {
    const { client, rpc } = stubClient({});

    await submitRsvpResponse(client, baseInput({ guests: 3, message: "Congratulations!" }));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("submit_rsvp", {
      p_wedding_id: WEDDING_ID,
      p_name: "Priya Sharma",
      p_email: "priya.sharma@example.com",
      p_phone: "+91 98765 43210",
      p_attendance: "attending",
      p_guests: 3,
      p_dietary: null,
      p_message: "Congratulations!",
    });
  });

  it("passes null rather than an empty address so repeat submissions match", async () => {
    const { client, rpc } = stubClient({});

    await submitRsvpResponse(client, baseInput({ email: "   " }));

    expect(rpc.mock.calls[0][1].p_email).toBeNull();
  });

  it("passes a null phone when the guest did not provide one", async () => {
    const { client, rpc } = stubClient({});

    await submitRsvpResponse(client, baseInput({ phone: "   " }));

    expect(rpc.mock.calls[0][1].p_phone).toBeNull();
  });

  it("trims the guest name", async () => {
    const { client, rpc } = stubClient({});

    await submitRsvpResponse(client, baseInput({ name: "  Priya Sharma  " }));

    expect(rpc.mock.calls[0][1].p_name).toBe("Priya Sharma");
  });

  it("does not write a table row itself", async () => {
    const { client, rpc } = stubClient({});

    await submitRsvpResponse(client, baseInput());

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("submit_rsvp");
  });

  it("raises a typed error carrying the SQLSTATE when the function refuses", async () => {
    const { client } = stubClient({
      error: { message: "RSVP deadline has passed", code: "22023" },
    });

    const error = await submitRsvpResponse(client, baseInput()).catch((e) => e);

    expect(error).toBeInstanceOf(RsvpSubmissionError);
    expect(error.message).toBe("RSVP deadline has passed");
    expect(error.code).toBe("22023");
  });
});
