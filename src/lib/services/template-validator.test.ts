import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";

import { validateTemplateZip } from "./template-validator";

describe("validateTemplateZip", () => {
  function createValidZip(): Buffer {
    const zip = new AdmZip();
    const manifest = {
      schemaVersion: "1.0",
      id: "royal-classic",
      name: "Royal Classic",
      version: "1.0.0",
      entry: "index.html",
      features: { rsvp: true },
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    zip.addFile(
      "index.html",
      Buffer.from(
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Wedding</h1></body></html>'
      )
    );
    return zip.toBuffer();
  }

  it("passes validation for a valid template zip", () => {
    const buffer = createValidZip();
    const result = validateTemplateZip(buffer, buffer.length);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest?.id).toBe("royal-classic");
  });

  it("fails if manifest.json is missing", () => {
    const zip = new AdmZip();
    zip.addFile("index.html", Buffer.from("<html></html>"));
    const buffer = zip.toBuffer();
    const result = validateTemplateZip(buffer, buffer.length);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("manifest.json"))).toBe(true);
  });

  it("fails if entry point index.html is missing", () => {
    const zip = new AdmZip();
    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify({
          schemaVersion: "1.0",
          id: "test",
          name: "Test",
          version: "1.0.0",
          entry: "index.html",
          features: {},
        })
      )
    );
    const buffer = zip.toBuffer();
    const result = validateTemplateZip(buffer, buffer.length);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "index.html")?.passed).toBe(false);
    expect(result.checks.find((c) => c.name === "Entry file")?.passed).toBe(false);
    expect(result.errors.join(" ")).toMatch(/index\.html|entry/i);
  });

  it("rejects path traversal attempts in zip entry names", () => {
    // adm-zip sanitises "../" and a leading "/" while *writing*, so a hostile
    // name has to be patched into the finished archive. "ab/evil.html" and
    // "../evil.html" are the same length, so every offset in the zip stays valid.
    const zip = new AdmZip();
    const manifest = {
      schemaVersion: "1.0",
      id: "traversal",
      name: "Traversal",
      version: "1.0.0",
      entry: "index.html",
      features: {},
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    zip.addFile("index.html", Buffer.from("<html></html>"));
    zip.addFile("ab/evil.html", Buffer.from("<html>evil</html>"));
    const hostile = Buffer.from(
      zip.toBuffer().toString("binary").split("ab/evil.html").join("../evil.html"),
      "binary"
    );

    const result = validateTemplateZip(hostile, hostile.length);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "Path security")?.passed).toBe(false);
    expect(result.errors.join(" ")).toMatch(/suspicious path/i);
  });

  it("rejects an absolute path in a zip entry name", () => {
    const zip = new AdmZip();
    const manifest = {
      schemaVersion: "1.0",
      id: "absolute",
      name: "Absolute",
      version: "1.0.0",
      entry: "index.html",
      features: {},
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    zip.addFile("index.html", Buffer.from("<html></html>"));
    zip.addFile("cd/evil.html", Buffer.from("<html>evil</html>"));
    const hostile = Buffer.from(
      zip.toBuffer().toString("binary").split("cd/evil.html").join("/d/evil.html"),
      "binary"
    );

    const result = validateTemplateZip(hostile, hostile.length);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/suspicious path/i);
  });

  it("rejects forbidden file extensions like .exe or .sh", () => {
    const zip = new AdmZip();
    const manifest = {
      schemaVersion: "1.0",
      id: "malicious-exe",
      name: "Malicious",
      version: "1.0.0",
      entry: "index.html",
      features: {},
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    zip.addFile("index.html", Buffer.from("<html></html>"));
    zip.addFile("script.sh", Buffer.from("echo hacked"));
    zip.addFile("tool.exe", Buffer.from("MZ"));

    const buffer = zip.toBuffer();
    const result = validateTemplateZip(buffer, buffer.length);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "Path security")?.passed).toBe(false);
    expect(result.errors.join(" ")).toContain("script.sh");
    expect(result.errors.join(" ")).toContain("tool.exe");
    // The offending files are dropped, not merely reported.
    expect(result.files).not.toContain("script.sh");
    expect(result.files).not.toContain("tool.exe");
  });

  it("classifies extensions from the file name, not the directory", () => {
    const zip = new AdmZip();
    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify({
          schemaVersion: "1.0",
          id: "dotted-dir",
          name: "Dotted dir",
          version: "1.0.0",
          entry: "index.html",
          features: {},
        })
      )
    );
    zip.addFile("index.html", Buffer.from("<html></html>"));
    zip.addFile("etc/passwd", Buffer.from("not really"));

    const buffer = zip.toBuffer();
    const result = validateTemplateZip(buffer, buffer.length);
    // An extensionless file has no extension; the path is not the extension.
    expect(result.warnings.join(" ")).not.toMatch(/unknown extension/i);
    expect(result.files).toContain("etc/passwd");
  });
});
