import { STORAGE_BUCKET } from "@/lib/db-schema";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = STORAGE_BUCKET;

const COMPRESS_MAX_DIM = 1600;
const COMPRESS_MIN_BYTES = 300 * 1024;

/**
 * Downscale + re-encode large photos as WebP (preserves logo transparency) before upload.
 * Coaches upload 5–10 MB phone photos; the site only ever needs ~200 KB.
 * Falls back to the original file for SVG/GIF, small files, or any codec failure.
 */
async function maybeCompressImage(
  file: File,
): Promise<{ blob: Blob; ext: string; contentType: string }> {
  const original = {
    blob: file as Blob,
    ext: file.name.split(".").pop() ?? "bin",
    contentType: file.type || "application/octet-stream",
  };
  const skip =
    typeof document === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif" ||
    file.size < COMPRESS_MIN_BYTES;
  if (skip) return original;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (blob && blob.size > 0 && blob.size < file.size) {
      return { blob, ext: "webp", contentType: "image/webp" };
    }
  } catch {
    // fall through to original
  }
  return original;
}

// NOTE: any NEW public-website section must upload under the 'public/' prefix
// (e.g. folder = "public/testimonials"). The tenant-assets storage RLS anon-read
// allowlist only permits: public, gallery, hero, logo_url, founder, cta,
// star_players, upi_qr_url. A new root folder outside this list is anon-invisible.
export async function uploadTenantFile(
  tenantId: string,
  folder: string,
  file: File,
): Promise<string> {
  const { blob, ext, contentType } = await maybeCompressImage(file);
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;

  // Safari/WebKit can send Blob uploads through supabase-js as an empty
  // multipart body (`content-length: 0`), which Supabase rejects as
  // "No content provided". Upload a raw ArrayBuffer instead so every browser
  // sends the actual bytes with the correct content type.
  const body = await blob.arrayBuffer();
  if (body.byteLength === 0) throw new Error("Selected file is empty");

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(path: string, expiresIn = 60 * 60 * 24 * 365): Promise<string> {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return path; // absolute app-relative asset (e.g. Lovable CDN)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return "";
  return data.signedUrl;
}

export async function deleteTenantFile(path: string) {
  if (!path || path.startsWith("http")) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export const TENANT_BUCKET = BUCKET;
