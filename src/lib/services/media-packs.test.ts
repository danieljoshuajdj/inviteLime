import { describe, expect, it } from "vitest";

import {
  MAX_MEDIA_PACK_BYTES,
  MediaPackValidationError,
  buildPackDemoMedia,
  normalizePackDescription,
  normalizePackName,
  normalizePackRole,
  sniffImageMime,
  validateMediaPackUpload,
} from "./media-packs";

/** Minimal valid PNG: the 8-byte signature is enough to sniff and to carry bytes. */
function png(bytes = 2048): ArrayBuffer {
  const buffer = new Uint8Array(bytes);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return buffer.buffer;
}

describe("sniffImageMime", () => {
  it("detects PNG, JPEG and GIF signatures", () => {
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
  });

  it("detects WebP through its RIFF container", () => {
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46]); // RIFF
    head.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(sniffImageMime(head)).toBe("image/webp");
  });

  it("does not confuse a WAVE audio RIFF container with an image", () => {
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46]); // RIFF
    head.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
    expect(sniffImageMime(head)).toBeNull();
  });

  it("detects AVIF through its ISO-BMFF still and sequence brands", () => {
    const still = new Uint8Array(16);
    still.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    still.set([0x61, 0x76, 0x69, 0x66], 8); // avif
    expect(sniffImageMime(still)).toBe("image/avif");

    const sequence = new Uint8Array(16);
    sequence.set([0x66, 0x74, 0x79, 0x70], 4);
    sequence.set([0x61, 0x76, 0x69, 0x73], 8); // avis
    expect(sniffImageMime(sequence)).toBe("image/avif");
  });

  it("detects AVIF even when only the compatible brand list names it", () => {
    const head = new Uint8Array(32);
    head.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    head.set([0x6d, 0x69, 0x66, 0x31], 8); // mif1 major brand
    head.set([0x61, 0x76, 0x69, 0x66], 16); // avif compatible brand
    expect(sniffImageMime(head)).toBe("image/avif");
  });

  it("does not mistake an MP4 brand for an AVIF", () => {
    const head = new Uint8Array(32);
    head.set([0x66, 0x74, 0x79, 0x70], 4);
    head.set([0x69, 0x73, 0x6f, 0x6d], 8); // isom
    expect(sniffImageMime(head)).toBeNull();
  });

  it("returns null for unrecognized bytes", () => {
    expect(sniffImageMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe("validateMediaPackUpload", () => {
  it("accepts a valid PNG and maps the extension", () => {
    const result = validateMediaPackUpload({
      buffer: png(),
      declaredType: "image/png",
      originalName: "bride.png",
    });
    expect(result.mimeType).toBe("image/png");
    expect(result.ext).toBe("png");
    expect(result.sizeBytes).toBe(2048);
  });

  it("trusts the sniffed type over the declared one", () => {
    // Declared PNG, but the bytes are a JPEG: the sniff wins so the stored
    // object gets a matching extension.
    const result = validateMediaPackUpload({
      buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer,
      declaredType: "image/png",
      originalName: "bride.png",
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.ext).toBe("jpg");
  });

  it("strips content-type parameters", () => {
    const result = validateMediaPackUpload({
      buffer: png(),
      declaredType: "image/png; charset=binary",
      originalName: "bride.png",
    });
    expect(result.mimeType).toBe("image/png");
  });

  it("falls back to the declared type when the bytes are inconclusive", () => {
    const result = validateMediaPackUpload({
      buffer: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
      declaredType: "image/webp",
      originalName: "couple.webp",
    });
    expect(result.mimeType).toBe("image/webp");
    expect(result.ext).toBe("webp");
  });

  it("accepts an AVIF upload and maps the extension", () => {
    const head = new Uint8Array(32);
    head.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    head.set([0x61, 0x76, 0x69, 0x66], 8); // avif

    const result = validateMediaPackUpload({
      buffer: head.buffer,
      declaredType: "image/avif",
      originalName: "bride.avif",
    });
    expect(result.mimeType).toBe("image/avif");
    expect(result.ext).toBe("avif");
  });

  it("accepts a declared AVIF when the bytes are inconclusive", () => {
    const result = validateMediaPackUpload({
      buffer: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
      declaredType: "image/avif",
      originalName: "couple.avif",
    });
    expect(result.mimeType).toBe("image/avif");
    expect(result.ext).toBe("avif");
  });

  it("still rejects an ISO-BMFF video whose brand is not AVIF", () => {
    const head = new Uint8Array(32);
    head.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
    head.set([0x69, 0x73, 0x6f, 0x6d], 8); // isom (MP4)

    try {
      validateMediaPackUpload({
        buffer: head.buffer,
        declaredType: "image/avif",
        originalName: "sneaky.mp4",
      });
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as MediaPackValidationError).code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  it("rejects an empty file", () => {
    expect(() =>
      validateMediaPackUpload({ buffer: new ArrayBuffer(0), declaredType: "image/png", originalName: "" })
    ).toThrow(MediaPackValidationError);
  });

  it("rejects a file over the size limit with the FILE_TOO_LARGE code", () => {
    const tooBig = new ArrayBuffer(MAX_MEDIA_PACK_BYTES + 1);
    try {
      validateMediaPackUpload({ buffer: tooBig, declaredType: "image/png", originalName: "big.png" });
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as MediaPackValidationError).code).toBe("FILE_TOO_LARGE");
    }
  });

  it("does not let the declared type admit a known non-image format", () => {
    const cases: Array<[string, number[]]> = [
      ["PDF", [0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0]],
      ["ZIP", [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]],
      ["ELF", [0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]],
      ["gzip", [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0]],
      ["Mach-O", [0xfe, 0xed, 0xfa, 0xce, 0, 0, 0, 0]],
      ["MP4", [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]], // "ftyp"
      ["Ogg", [0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]],
      ["FLAC", [0x66, 0x4c, 0x61, 0x43, 0, 0, 0, 0]],
      ["MP3/ID3", [0x49, 0x44, 0x33, 0x03, 0x00, 0, 0, 0]],
    ];
    for (const [label, bytes] of cases) {
      expect(
        () =>
          validateMediaPackUpload({
            buffer: new Uint8Array(bytes).buffer,
            declaredType: "image/png",
            originalName: `${label}.png`,
          }),
        `${label} must be rejected`
      ).toThrow(MediaPackValidationError);
    }
  });

  it("rejects an unsupported declared type whose bytes are inconclusive", () => {
    try {
      validateMediaPackUpload({
        buffer: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
        declaredType: "image/tiff",
        originalName: "x.tiff",
      });
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as MediaPackValidationError).code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });
});

describe("normalizePackName / normalizePackDescription", () => {
  it("trims and requires a name", () => {
    expect(normalizePackName("  Royal couple  ")).toBe("Royal couple");
    try {
      normalizePackName("   ");
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as MediaPackValidationError).code).toBe("INVALID_NAME");
    }
    expect(() => normalizePackName(undefined)).toThrow(MediaPackValidationError);
  });

  it("caps runaway input length", () => {
    expect(normalizePackName("a".repeat(500))).toHaveLength(120);
    expect(normalizePackDescription("b".repeat(500))).toHaveLength(300);
  });

  it("treats an empty description as absent", () => {
    expect(normalizePackDescription("")).toBeNull();
    expect(normalizePackDescription("   ")).toBeNull();
    expect(normalizePackDescription("Pastel palette")).toBe("Pastel palette");
    expect(normalizePackDescription(undefined)).toBeNull();
  });
});

describe("normalizePackRole", () => {
  it("accepts the four pack roles, case-insensitively", () => {
    expect(normalizePackRole("bride")).toBe("bride");
    expect(normalizePackRole(" Groom ")).toBe("groom");
    expect(normalizePackRole("couple")).toBe("couple");
    expect(normalizePackRole("gallery")).toBe("gallery");
  });

  it("rejects unknown or missing roles", () => {
    try {
      normalizePackRole("video");
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as MediaPackValidationError).code).toBe("INVALID_ROLE");
    }
    expect(() => normalizePackRole(undefined)).toThrow(MediaPackValidationError);
  });
});

describe("buildPackDemoMedia", () => {
  const item = (role: "bride" | "groom" | "couple" | "gallery", url: string, sortOrder: number) => ({
    role,
    url,
    sortOrder,
  });

  it("maps single roles from their newest photo, whatever the input order", () => {
    const media = buildPackDemoMedia([
      item("bride", "/api/media/library/media/photo-new.webp", 20),
      item("bride", "/api/media/library/media/photo-old.webp", 10),
      item("couple", "/api/media/library/media/photo-couple.webp", 5),
    ]);

    expect(media.photos.bride).toBe("/api/media/library/media/photo-new.webp");
    expect(media.photos.groom).toBeNull();
    expect(media.photos.couple).toBe("/api/media/library/media/photo-couple.webp");
  });

  it("keeps gallery photos in upload order", () => {
    const media = buildPackDemoMedia([
      item("gallery", "/api/media/library/media/photo-2.webp", 2),
      item("gallery", "/api/media/library/media/photo-1.webp", 1),
    ]);

    expect(media.gallery).toEqual([
      { url: "/api/media/library/media/photo-1.webp" },
      { url: "/api/media/library/media/photo-2.webp" },
    ]);
  });

  it("returns empty slots for an empty pack", () => {
    const media = buildPackDemoMedia([]);
    expect(media.photos).toEqual({ bride: null, groom: null, couple: null });
    expect(media.gallery).toEqual([]);
  });
});
