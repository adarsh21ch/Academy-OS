/**
 * Cricket Academy OS — QR check-in poster rendering.
 *
 * The poster is drawn once onto an A4 canvas (150 dpi) and then exported as a
 * PNG image or a single-page PDF. Owners on mobile can't reliably print, so the
 * poster must be downloadable / shareable as a file to send to a print shop.
 */
import QRCode from "qrcode";

const A4_W = 1240; // 210mm @ 150dpi
const A4_H = 1754; // 297mm @ 150dpi

export interface PosterInput {
  academyName: string;
  checkinUrl: string;
}

/** Renders the poster to an A4 canvas. Browser only. */
export async function renderPosterCanvas({
  academyName,
  checkinUrl,
}: PosterInput): Promise<HTMLCanvasElement> {
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
    width: 1000,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const qrImg = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported on this device.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4_W, A4_H);

  const center = A4_W / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = "#0b0b0c";

  ctx.font = "700 78px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  wrapText(ctx, academyName, center, 190, A4_W - 160, 88);

  ctx.fillStyle = "#4b5563";
  ctx.font = "500 42px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Scan to check in & check out", center, 275);

  // QR panel
  const qrSize = 720;
  const qrX = center - qrSize / 2;
  const qrY = 350;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 4;
  roundRect(ctx, qrX - 26, qrY - 26, qrSize + 52, qrSize + 52, 32);
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Steps
  const steps = [
    "Open your phone camera and scan this code",
    "Sign in with your student account",
    "Allow location — you must be at the academy",
    "Scan again when you leave to check out",
  ];
  ctx.textAlign = "left";
  let y = qrY + qrSize + 130;
  steps.forEach((step, i) => {
    ctx.fillStyle = "#0b0b0c";
    ctx.font = "700 38px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${i + 1}.`, 150, y);
    ctx.fillStyle = "#1f2937";
    ctx.font = "400 38px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(step, 210, y);
    y += 62;
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7280";
  ctx.font = "400 28px ui-sans-serif, system-ui, sans-serif";
  wrapText(
    ctx,
    "Attendance is GPS-verified. Scanning a photo of this code from somewhere else will not work.",
    center,
    A4_H - 120,
    A4_W - 200,
    38,
  );

  return canvas;
}

export function posterFileName(academyName: string, ext: "pdf" | "png"): string {
  const slug =
    academyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "academy";
  return `${slug}-checkin-qr.${ext}`;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))),
      "image/png",
    );
  });
}

export async function posterPngBlob(input: PosterInput): Promise<Blob> {
  const canvas = await renderPosterCanvas(input);
  return canvasToBlob(canvas);
}

export async function posterPdfBlob(input: PosterInput): Promise<Blob> {
  const canvas = await renderPosterCanvas(input);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
  return doc.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** True when the device can share files (iOS/Android Safari & Chrome). */
export function canShareFiles(files: File[]): boolean {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator) : null;
  return !!nav?.canShare?.({ files }) && typeof nav.share === "function";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't render the QR code."));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}
