import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    rotate: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("cleaned-bytes")),
  }));
  return { default: mockSharp };
});

import sharp from "sharp";
import {
  detectImageMime,
  processBookingPhoto,
  ALLOWED_MIMES,
} from "./photos";

const CLIENT_ID = "11111111-1111-4111-9111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── detectImageMime — pure signature detection ─────────────────────────

describe("detectImageMime", () => {
  it("identifies JPEG by FF D8 FF prefix", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageMime(buf)).toBe("image/jpeg");
  });

  it("identifies PNG by full 8-byte signature", () => {
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(detectImageMime(buf)).toBe("image/png");
  });

  it("rejects PNG with corrupted signature", () => {
    // First byte wrong
    const buf = Buffer.from([
      0x90, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(detectImageMime(buf)).toBeNull();
  });

  it("identifies HEIC by ftyp + heic brand", () => {
    const buf = Buffer.concat([
      Buffer.alloc(4), // size
      Buffer.from("ftyp"),
      Buffer.from("heic"),
    ]);
    expect(detectImageMime(buf)).toBe("image/heic");
  });

  it("identifies HEIC variants (heix, mif1, msf1)", () => {
    for (const brand of ["heix", "mif1", "msf1"]) {
      const buf = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from("ftyp"),
        Buffer.from(brand),
      ]);
      expect(detectImageMime(buf)).toBe("image/heic");
    }
  });

  it("rejects ftyp with unknown brand", () => {
    const buf = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from("ftyp"),
      Buffer.from("mp42"), // mp4 video, not heic
    ]);
    expect(detectImageMime(buf)).toBeNull();
  });

  it("identifies WebP by RIFF + WEBP", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4), // size
      Buffer.from("WEBP"),
    ]);
    expect(detectImageMime(buf)).toBe("image/webp");
  });

  it("rejects RIFF without WEBP marker (e.g. WAV audio)", () => {
    const buf = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WAVE"),
    ]);
    expect(detectImageMime(buf)).toBeNull();
  });

  it("returns null on buffers shorter than 12 bytes", () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("returns null on a random buffer that matches nothing", () => {
    expect(detectImageMime(Buffer.alloc(100))).toBeNull();
  });

  it("guards against extension-disguised PHP", () => {
    // A PHP file starts with `<?php`. Whatever the filename, this should fail.
    const buf = Buffer.from("<?php echo 'attack'; ?>            ");
    expect(detectImageMime(buf)).toBeNull();
  });
});

// ── ALLOWED_MIMES ──────────────────────────────────────────────────────

describe("ALLOWED_MIMES", () => {
  it("includes the four whitelisted image formats", () => {
    expect(ALLOWED_MIMES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_MIMES.has("image/png")).toBe(true);
    expect(ALLOWED_MIMES.has("image/heic")).toBe(true);
    expect(ALLOWED_MIMES.has("image/webp")).toBe(true);
  });

  it("rejects common attack vectors", () => {
    // Cast to Set<string> for these runtime checks — the typed Set narrows .has
    // to the literal union, but we want to verify the runtime behavior on
    // non-whitelisted values.
    const set = ALLOWED_MIMES as Set<string>;
    expect(set.has("application/x-php")).toBe(false);
    expect(set.has("text/html")).toBe(false);
    expect(set.has("image/svg+xml")).toBe(false); // SVG can carry script
    expect(set.has("application/octet-stream")).toBe(false);
  });
});

// ── processBookingPhoto — IO orchestration ─────────────────────────────

function fakeJpegFile(size: number, type = "image/jpeg"): File {
  // Build a minimal valid JPEG header so the magic-byte check passes.
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.alloc(Math.max(0, size - header.length));
  const buf = Buffer.concat([header, body]);
  return new File([buf], "photo.jpg", { type });
}

function mockStorageUpload(result: { error: { message: string } | null }) {
  const upload = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ upload });
  return {
    supabase: { storage: { from } } as unknown as Parameters<
      typeof processBookingPhoto
    >[0]["supabase"],
    upload,
    from,
  };
}

describe("processBookingPhoto", () => {
  it("returns ok with the storage path on the happy path", async () => {
    const { supabase, upload } = mockStorageUpload({ error: null });
    const result = await processBookingPhoto({
      file: fakeJpegFile(1024),
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual({ ok: true, path: `${CLIENT_ID}/0.jpg` });
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(
      `${CLIENT_ID}/0.jpg`,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "image/jpeg",
        upsert: false,
      })
    );
  });

  it("rejects files over 5MB without reading them", async () => {
    const { supabase, upload } = mockStorageUpload({ error: null });
    const result = await processBookingPhoto({
      file: fakeJpegFile(6 * 1024 * 1024),
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "too_large" })
    );
    expect(sharp).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects unwhitelisted mime types", async () => {
    const { supabase } = mockStorageUpload({ error: null });
    const file = new File([Buffer.alloc(100)], "evil.svg", {
      type: "image/svg+xml",
    });
    const result = await processBookingPhoto({
      file,
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "invalid_mime" })
    );
    expect(sharp).not.toHaveBeenCalled();
  });

  it("rejects when the magic bytes don't match the claimed mime (extension-disguised content)", async () => {
    // Claim image/jpeg but the bytes are PNG.
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const file = new File([pngHeader], "evil.jpg", { type: "image/jpeg" });
    const { supabase } = mockStorageUpload({ error: null });

    const result = await processBookingPhoto({
      file,
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "invalid_signature" })
    );
  });

  it("rejects when content matches nothing (e.g. PHP payload claiming to be JPG)", async () => {
    const phpPayload = Buffer.from("<?php echo 'rce'; ?>             ");
    const file = new File([phpPayload], "rce.jpg", { type: "image/jpeg" });
    const { supabase } = mockStorageUpload({ error: null });

    const result = await processBookingPhoto({
      file,
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "invalid_signature" })
    );
  });

  it("returns processing_failed when sharp throws (e.g. corrupt image or missing HEIC support)", async () => {
    const { supabase, upload } = mockStorageUpload({ error: null });
    vi.mocked(sharp).mockImplementationOnce(
      () =>
        ({
          rotate: vi.fn().mockReturnThis(),
          toBuffer: vi
            .fn()
            .mockRejectedValue(new Error("libheif not compiled in")),
        }) as unknown as ReturnType<typeof sharp>
    );

    const result = await processBookingPhoto({
      file: fakeJpegFile(1024),
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "processing_failed" })
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("returns upload_failed when storage rejects the file", async () => {
    const { supabase } = mockStorageUpload({
      error: { message: "RLS denied" },
    });
    const result = await processBookingPhoto({
      file: fakeJpegFile(1024),
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: "upload_failed" })
    );
  });

  it("derives storage extension from validated mime, NOT the original filename", async () => {
    const { supabase, upload } = mockStorageUpload({ error: null });
    // Filename claims .php.jpg attack, content is real JPEG, mime is image/jpeg.
    const buf = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(100).fill(0),
    ]);
    const file = new File([buf], "exploit.php.jpg", { type: "image/jpeg" });

    const result = await processBookingPhoto({
      file,
      clientId: CLIENT_ID,
      index: 2,
      supabase,
    });

    expect(result).toEqual({ ok: true, path: `${CLIENT_ID}/2.jpg` });
    // Path uses .jpg derived from image/jpeg, not from the filename.
    expect(upload).toHaveBeenCalledWith(
      `${CLIENT_ID}/2.jpg`,
      expect.any(Buffer),
      expect.any(Object)
    );
  });

  it("uses index in the storage path", async () => {
    const { supabase, upload } = mockStorageUpload({ error: null });
    await processBookingPhoto({
      file: fakeJpegFile(1024),
      clientId: CLIENT_ID,
      index: 0,
      supabase,
    });
    await processBookingPhoto({
      file: fakeJpegFile(1024),
      clientId: CLIENT_ID,
      index: 1,
      supabase,
    });
    expect(upload).toHaveBeenNthCalledWith(
      1,
      `${CLIENT_ID}/0.jpg`,
      expect.any(Buffer),
      expect.any(Object)
    );
    expect(upload).toHaveBeenNthCalledWith(
      2,
      `${CLIENT_ID}/1.jpg`,
      expect.any(Buffer),
      expect.any(Object)
    );
  });
});
