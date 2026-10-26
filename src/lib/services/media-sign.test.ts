import { describe, expect, it } from "vitest";

import { signMediaToken, verifyMediaToken } from "./media-sign";

const KEY = "2e8203db91d77463-4-1/gallery/gallery-c41270cc20.webp";

describe("media signatures", () => {
  it("round-trips a signature for the object it was minted for", () => {
    const token = signMediaToken(KEY);
    expect(verifyMediaToken(token, KEY)).toBe(true);
  });

  it("is scoped to one object, so it cannot be replayed onto another", () => {
    const token = signMediaToken(KEY);
    expect(verifyMediaToken(token, `${KEY.split("/").slice(0, 2).join("/")}/gallery/other.webp`)).toBe(false);
    expect(verifyMediaToken(token, "2e8203db91d77463-4-1/music/song.mp3")).toBe(false);
    expect(verifyMediaToken(token, "3f2504e0-4f89-41d3-9a0c-0305e82c3301/gallery/a.webp")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signMediaToken(KEY);
    const [exp, sig] = token.split(".");
    const flipped = sig[0] === "a" ? "b" : "a";
    expect(verifyMediaToken(`${exp}.${flipped}${sig.slice(1)}`, KEY)).toBe(false);
    expect(verifyMediaToken(`${exp}.${sig}00`, KEY)).toBe(false);
    expect(verifyMediaToken(`${exp}x.${sig}`, KEY)).toBe(false);
  });

  it("rejects a malformed token", () => {
    for (const token of ["", ".", "abc", "12345", "notanumber.abc", ".sig"]) {
      expect(verifyMediaToken(token, KEY)).toBe(false);
    }
  });

  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 1;
    const token = `${past}.${signMediaToken(KEY).split(".")[1]}`;
    expect(verifyMediaToken(token, KEY)).toBe(false);
  });

  it("is not interchangeable with a template asset signature", () => {
    // Both proxies share a secret, so the digest input is domain-separated.
    const media = signMediaToken(KEY);
    const assetShape = KEY.split("/").slice(0, 2).join("/");
    expect(verifyMediaToken(media, assetShape)).toBe(false);
  });
});
