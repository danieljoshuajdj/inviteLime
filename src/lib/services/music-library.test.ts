import { describe, expect, it } from "vitest";

import {
  MAX_MUSIC_BYTES,
  MusicValidationError,
  musicKeyFor,
  normalizeArtist,
  normalizeTitle,
  sniffAudioMime,
  validateMusicUpload,
} from "./music-library";
import { isLibraryMediaUrl, libraryTrackName, LIBRARY_MEDIA_PREFIX } from "@/lib/library-media";

/** Minimal valid MP3: an ID3 tag is enough to sniff, and to carry bytes. */
function mp3(bytes = 2048): ArrayBuffer {
  const buffer = new Uint8Array(bytes);
  buffer.set([0x49, 0x44, 0x33, 0x03, 0x00], 0); // "ID3"
  return buffer.buffer;
}

describe("sniffAudioMime", () => {
  it("detects an ID3-tagged MP3", () => {
    expect(sniffAudioMime(new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]))).toBe("audio/mpeg");
  });

  it("detects a bare MPEG frame sync", () => {
    expect(sniffAudioMime(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
    expect(sniffAudioMime(new Uint8Array([0xff, 0xfa, 0x90, 0x00]))).toBe("audio/mpeg");
  });

  it("detects WAV via its RIFF/WAVE header", () => {
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46]); // RIFF
    head.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
    expect(sniffAudioMime(head)).toBe("audio/wav");
  });

  it("detects FLAC and Ogg containers", () => {
    const flac = new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
    const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
    expect(sniffAudioMime(flac)).toBe("audio/flac");
    expect(sniffAudioMime(ogg)).toBe("audio/ogg");
  });

  it("rejects a RIFF container that is really a WebP image", () => {
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46]);
    head.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(sniffAudioMime(head)).toBeNull();
  });

  it("rejects a PNG even when it arrives with an audio name", () => {
    expect(
      sniffAudioMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ).toBeNull();
  });

  it("returns null for unrecognized bytes", () => {
    expect(sniffAudioMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe("validateMusicUpload", () => {
  it("accepts a valid MP3 and maps the extension", () => {
    const result = validateMusicUpload({
      buffer: mp3(),
      declaredType: "audio/mpeg",
      originalName: "song.mp3",
    });
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.ext).toBe("mp3");
    expect(result.sizeBytes).toBe(2048);
  });

  it("trusts the sniffed type over the declared one", () => {
    // Declared as audio, but the bytes are a WAV: the sniffed type must win so
    // the object is stored with a matching extension.
    const head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46]);
    head.set([0x57, 0x41, 0x56, 0x45], 8);
    const result = validateMusicUpload({
      buffer: head.buffer,
      declaredType: "audio/mpeg",
      originalName: "x.mp3",
    });
    expect(result.mimeType).toBe("audio/wav");
    expect(result.ext).toBe("wav");
  });

  it("strips content-type parameters", () => {
    const result = validateMusicUpload({
      buffer: mp3(),
      declaredType: "audio/mpeg; charset=binary",
      originalName: "song.mp3",
    });
    expect(result.mimeType).toBe("audio/mpeg");
  });

  it("falls back to the declared type when the bytes are inconclusive", () => {
    // A bare ADTS AAC stream has no container header, but its sync word is
    // distinctive enough to identify on its own.
    const result = validateMusicUpload({
      buffer: new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0x00, 0x1f, 0xfc]).buffer,
      declaredType: "audio/aac",
      originalName: "a.aac",
    });
    expect(result.mimeType).toBe("audio/aac");
  });

  it("identifies an ADTS AAC sync word rather than calling it MP3", () => {
    // 0xFFF1 / 0xFFF9 set layer === 00, which MPEG audio never does.
    expect(sniffAudioMime(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBe("audio/aac");
    expect(sniffAudioMime(new Uint8Array([0xff, 0xf9, 0x50, 0x80]))).toBe("audio/aac");
  });

  it("still identifies real MPEG audio frames", () => {
    // 0xFFFB / 0xFFFA have layer === 01, so they are MPEG-1/2 audio.
    expect(sniffAudioMime(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
    expect(sniffAudioMime(new Uint8Array([0xff, 0xfa, 0x90, 0x00]))).toBe("audio/mpeg");
  });

  it("rejects an empty file", () => {
    expect(() =>
      validateMusicUpload({ buffer: new ArrayBuffer(0), declaredType: "audio/mpeg", originalName: "" })
    ).toThrow(MusicValidationError);
  });

  it("rejects a file over the size limit", () => {
    const tooBig = { buffer: new ArrayBuffer(MAX_MUSIC_BYTES + 1), declaredType: "audio/mpeg", originalName: "big.mp3" };
    try {
      validateMusicUpload(tooBig);
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as MusicValidationError).code).toBe("FILE_TOO_LARGE");
    }
  });

  it("rejects a non-audio file disguised as audio", () => {
    expect(() =>
      validateMusicUpload({
        buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).buffer,
        declaredType: "audio/mpeg",
        originalName: "sneaky.mp3",
      })
    ).toThrow(MusicValidationError);
  });

  it("does not let the declared type admit a known non-audio format", () => {
    // Regression: an unrecognised declared type used to be accepted even when
    // the bytes were plainly something else, so a PNG could be stored as a
    // "track" that simply never plays.
    const cases: Array<[string, number[], string]> = [
      ["PNG", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], "audio/mpeg"],
      ["JPEG", [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0], "audio/mpeg"],
      ["GIF", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0], "audio/mpeg"],
      ["PDF", [0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0], "audio/mpeg"],
      ["ZIP", [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0], "audio/mpeg"],
      ["ELF", [0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], "audio/mpeg"],
      ["gzip", [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0], "audio/mpeg"],
    ];
    for (const [label, bytes, declared] of cases) {
      expect(() =>
        validateMusicUpload({
          buffer: new Uint8Array(bytes).buffer,
          declaredType: declared,
          originalName: `${label}.mp3`,
        }),
        `${label} must be rejected`
      ).toThrow(MusicValidationError);
    }
  });

  it("rejects an executable renamed to .mp3", () => {
    const head = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    expect(() =>
      validateMusicUpload({ buffer: head.buffer, declaredType: "audio/mpeg", originalName: "x.mp3" })
    ).toThrow(MusicValidationError);
  });
});

describe("normalizeTitle / normalizeArtist", () => {
  it("trims and requires a title", () => {
    expect(normalizeTitle("  First Dance  ")).toBe("First Dance");
    expect(() => normalizeTitle("   ")).toThrow(MusicValidationError);
    expect(() => normalizeTitle(undefined)).toThrow(MusicValidationError);
  });

  it("caps runaway input length", () => {
    expect(normalizeTitle("a".repeat(500))).toHaveLength(120);
    expect(normalizeArtist("b".repeat(500))).toHaveLength(120);
  });

  it("treats an empty artist as absent", () => {
    expect(normalizeArtist("")).toBeNull();
    expect(normalizeArtist("   ")).toBeNull();
    expect(normalizeArtist("Drake")).toBe("Drake");
  });
});

describe("musicKeyFor", () => {
  it("places the object in the library folder under the music role", () => {
    expect(musicKeyFor("abc123", "mp3")).toBe("library/music/trackabc123.mp3");
  });

  it("uses the sniffed extension, not always mp3", () => {
    expect(musicKeyFor("abc123", "ogg")).toBe("library/music/trackabc123.ogg");
    expect(musicKeyFor("abc123", "flac")).toBe("library/music/trackabc123.flac");
  });

  it("produces a key the media route will accept", () => {
    // `parseMediaPath` gates every read; a key it rejects would be unreachable.
    expect(musicKeyFor("abc123", "mp3").split("/")).toHaveLength(3);
  });

  it("strips characters that would break the path", () => {
    // The "track" prefix is added by musicKeyFor, so "../../etc" is flattened
    // into the id rather than escaping the folder.
    expect(musicKeyFor("../../etc", "mp3")).toBe("library/music/tracketc.mp3");
    expect(musicKeyFor("a/../b", "mp3")).toBe("library/music/trackab.mp3");
    expect(musicKeyFor("", "mp3")).toBe("library/music/track.mp3");
  });

  it("cannot collide for two uploads of the same title", () => {
    expect(musicKeyFor("aaa", "mp3")).not.toBe(musicKeyFor("bbb", "mp3"));
  });

  it("does not leak the title into the storage key", () => {
    expect(musicKeyFor("aaa", "mp3")).not.toContain("First Dance");
  });
});

describe("isLibraryMediaUrl", () => {
  it("recognizes a library URL", () => {
    expect(isLibraryMediaUrl(`${LIBRARY_MEDIA_PREFIX}track-abc.mp3`)).toBe(true);
  });

  it("recognizes an absolute library URL", () => {
    expect(isLibraryMediaUrl(`https://example.com${LIBRARY_MEDIA_PREFIX}track-abc.mp3`)).toBe(true);
  });

  it("does not treat a wedding's own track as a library one", () => {
    const wedding = "/api/media/3f2504e0-4f89-41d3-9a0c-0305e82c3301/music/music.mp3";
    expect(isLibraryMediaUrl(wedding)).toBe(false);
  });

  it("does not treat a draft-scoped track as a library one", () => {
    expect(isLibraryMediaUrl("/api/media/abcdef0123456789-5-9/music/music.mp3")).toBe(false);
  });

  it("does not match a folder that merely starts with 'library'", () => {
    expect(isLibraryMediaUrl("/api/media/library-backup/music/track.mp3")).toBe(false);
  });

  it("is false for non-strings", () => {
    expect(isLibraryMediaUrl(null)).toBe(false);
    expect(isLibraryMediaUrl(undefined)).toBe(false);
    expect(isLibraryMediaUrl(42)).toBe(false);
  });
});

describe("libraryTrackName", () => {
  it("includes the artist when known", () => {
    expect(libraryTrackName({ title: "First Dance", artist: "Drake" })).toBe("First Dance — Drake");
  });

  it("falls back to the title alone", () => {
    expect(libraryTrackName({ title: "Untitled", artist: null })).toBe("Untitled");
  });
});