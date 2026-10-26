import { describe, expect, it } from "vitest";

import {
  DemoDetailValidationError,
  normalizeDemoDetailPackInput,
} from "@/lib/services/demo-details";

const base = {
  name: "  Royal Tamil wedding  ",
  brideName: " Karthika M. ",
  groomName: " Jeya Chandran S. ",
  description: "  Palace celebration  ",
  brideDesignation: "Daughter of Mr. Mariappan",
  dressBrideColor: "#C2647A",
  dressBrideColorName: " Rosewood ",
  latitude: 13.08,
  longitude: "80.27",
  events: [
    { name: " Mehendi ", date: "2027-02-12", venue: "Courtyard" },
    { name: "Wedding Ceremony", time: "19:00" },
  ],
};

describe("normalizeDemoDetailPackInput", () => {
  it("trims text, clears blanks and orders events by submission order", () => {
    const pack = normalizeDemoDetailPackInput({ ...base, description: "   " });

    expect(pack.name).toBe("Royal Tamil wedding");
    expect(pack.brideName).toBe("Karthika M.");
    expect(pack.groomName).toBe("Jeya Chandran S.");
    expect(pack.description).toBeNull();
    expect(pack.dressBrideColor).toBe("#c2647a");
    expect(pack.dressBrideColorName).toBe("Rosewood");
    expect(pack.latitude).toBe(13.08);
    expect(pack.longitude).toBe(80.27);
    expect(pack.events).toEqual([
      {
        name: "Mehendi",
        date: "2027-02-12",
        time: null,
        venue: "Courtyard",
        address: null,
        mapsUrl: null,
        description: null,
        sortOrder: 0,
      },
      {
        name: "Wedding Ceremony",
        date: null,
        time: "19:00",
        venue: null,
        address: null,
        mapsUrl: null,
        description: null,
        sortOrder: 1,
      },
    ]);
  });

  it("requires the pack name and both couple names", () => {
    expect(() => normalizeDemoDetailPackInput({ ...base, name: "  " })).toThrow(
      DemoDetailValidationError
    );
    expect(() => normalizeDemoDetailPackInput({ ...base, brideName: "" })).toThrow(
      "Bride name is required"
    );
    expect(() => normalizeDemoDetailPackInput({ ...base, groomName: null })).toThrow(
      "Groom name is required"
    );
  });

  it("accepts date and time picker values and rejects free text", () => {
    const pack = normalizeDemoDetailPackInput({
      ...base,
      weddingDate: "2027-02-14",
      weddingTime: "19:00",
    });

    expect(pack.weddingDate).toBe("2027-02-14");
    expect(pack.weddingTime).toBe("19:00");

    expect(() =>
      normalizeDemoDetailPackInput({ ...base, weddingDate: "14 February 2027" })
    ).toThrow("Wedding date");
    expect(() =>
      normalizeDemoDetailPackInput({ ...base, weddingTime: "7:00 PM" })
    ).toThrow("Wedding time");
    expect(() =>
      normalizeDemoDetailPackInput({
        ...base,
        events: [{ name: "Haldi", date: "12 February 2027" }],
      })
    ).toThrow("Event 1 date");
    expect(() =>
      normalizeDemoDetailPackInput({
        ...base,
        events: [{ name: "Haldi", time: "10:00 AM" }],
      })
    ).toThrow("Event 1 time");
    expect(() =>
      normalizeDemoDetailPackInput({ ...base, rsvpDeadline: "1 February 2027" })
    ).toThrow("Reply-by date");
  });

  it("rejects colour values that are not #rrggbb", () => {
    expect(() =>
      normalizeDemoDetailPackInput({ ...base, dressBrideColor: "rose" })
    ).toThrow("must be a #rrggbb colour");
    expect(() =>
      normalizeDemoDetailPackInput({ ...base, dressGroomColor: "#fff" })
    ).toThrow("must be a #rrggbb colour");
  });

  it("rejects coordinates outside their valid ranges", () => {
    expect(() => normalizeDemoDetailPackInput({ ...base, latitude: 91 })).toThrow(
      "Latitude is out of range"
    );
    expect(() => normalizeDemoDetailPackInput({ ...base, longitude: -181 })).toThrow(
      "Longitude is out of range"
    );
  });

  it("requires a name for every event", () => {
    expect(() =>
      normalizeDemoDetailPackInput({ ...base, events: [{ name: "  " }] })
    ).toThrow("Event 1 name is required");
  });

  it("caps the number of events", () => {
    const events = Array.from({ length: 21 }, (_, index) => ({ name: `Event ${index + 1}` }));
    expect(() => normalizeDemoDetailPackInput({ ...base, events })).toThrow(
      "at most 20 events"
    );
  });

  it("treats a missing events array as empty", () => {
    const pack = normalizeDemoDetailPackInput({ ...base, events: undefined });
    expect(pack.events).toEqual([]);
  });
});
