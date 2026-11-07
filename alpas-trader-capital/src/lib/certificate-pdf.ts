/**
 * PDF renderer for certificate layouts. Fonts are embedded (subset) so
 * Turkish characters render on any device; QR modules are vector rectangles.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PAGE, type FontKey, type Op } from "./certificate-layout";

export const FONT_FILES: Record<FontKey, string> = {
  display: "Archivo_700Bold.ttf",
  displayHeavy: "Archivo_800ExtraBold.ttf",
  sans: "IBMPlexSans_400Regular.ttf",
  sansMedium: "IBMPlexSans_500Medium.ttf",
  serif: "Newsreader_600SemiBold.ttf",
  serifItalic: "Newsreader_400Regular_Italic.ttf",
  mono: "IBMPlexSans_500Medium.ttf", // IBM Plex Mono does not parse in fontkit; codes use Plex Sans Medium
};

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function loadFontBytes(fetcher: (file: string) => Promise<ArrayBuffer | Uint8Array>) {
  const entries = await Promise.all(Object.entries(FONT_FILES).map(async ([k, file]) => [k, await fetcher(file)] as const));
  return Object.fromEntries(entries) as Record<FontKey, ArrayBuffer | Uint8Array>;
}

export async function renderCertificatePdf(ops: Op[], fonts: Record<FontKey, ArrayBuffer | Uint8Array>, meta: { title: string; subject: string }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(meta.title);
  doc.setSubject(meta.subject);
  doc.setAuthor("ALPAS Trader Capital (prototype)");
  doc.setCreator("ALPAS prototype certificate renderer");
  doc.setKeywords(["DEMO", "SPECIMEN"]);
  const embedded = {} as Record<FontKey, PDFFont>;
  for (const k of Object.keys(FONT_FILES) as FontKey[]) embedded[k] = await doc.embedFont(fonts[k], { subset: true });
  const page = doc.addPage([PAGE.w, PAGE.h]);
  for (const op of ops) drawOp(page, op, embedded);
  return doc.save({ useObjectStreams: false });
}

function drawOp(page: PDFPage, op: Op, fonts: Record<FontKey, PDFFont>) {
  const H = PAGE.h;
  switch (op.k) {
    case "rect":
      page.drawRectangle({
        x: op.x,
        y: H - op.y - op.h,
        width: op.w,
        height: op.h,
        color: op.fill ? hex(op.fill) : undefined,
        borderColor: op.stroke ? hex(op.stroke) : undefined,
        borderWidth: op.stroke ? (op.sw ?? 1) : 0,
        opacity: op.opacity,
        borderOpacity: op.opacity,
      });
      return;
    case "path":
      page.drawSvgPath(op.d, {
        x: op.tx,
        y: H - op.ty,
        scale: op.scale,
        color: op.fill ? hex(op.fill) : undefined,
        borderColor: op.stroke ? hex(op.stroke) : undefined,
        borderWidth: op.stroke ? (op.sw ?? 1) : undefined,
        opacity: op.opacity,
        borderOpacity: op.opacity,
      });
      return;
    case "circle":
      page.drawCircle({
        x: op.cx,
        y: H - op.cy,
        size: op.r,
        color: op.fill ? hex(op.fill) : undefined,
        borderColor: op.stroke ? hex(op.stroke) : undefined,
        borderWidth: op.stroke ? (op.sw ?? 1) : 0,
        opacity: op.opacity,
        borderOpacity: op.opacity,
      });
      return;
    case "qr": {
      const n = op.modules.length;
      const cell = op.size / n;
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          if (!op.modules[r][c]) {
            c++;
            continue;
          }
          let e = c;
          while (e < n && op.modules[r][e]) e++;
          page.drawRectangle({ x: op.x + c * cell, y: H - op.y - (r + 1) * cell, width: (e - c) * cell + 0.05, height: cell + 0.05, color: hex(op.color) });
          c = e;
        }
      }
      return;
    }
    case "text": {
      const font = fonts[op.font];
      const tracking = op.tracking ?? 0;
      const chars = [...op.text];
      const width = font.widthOfTextAtSize(op.text, op.size) + tracking * Math.max(0, chars.length - 1);
      const theta = ((-(op.rotate ?? 0)) * Math.PI) / 180;
      const shift = op.anchor === "middle" ? width / 2 : op.anchor === "end" ? width : 0;
      let x = op.x - shift * Math.cos(theta);
      let y = H - op.y - shift * Math.sin(theta);
      const color = hex(op.color);
      if (!tracking) {
        page.drawText(op.text, { x, y, size: op.size, font, color, opacity: op.opacity, rotate: degrees(-(op.rotate ?? 0)) });
        return;
      }
      for (const ch of chars) {
        page.drawText(ch, { x, y, size: op.size, font, color, opacity: op.opacity, rotate: degrees(-(op.rotate ?? 0)) });
        const adv = font.widthOfTextAtSize(ch, op.size) + tracking;
        x += adv * Math.cos(theta);
        y += adv * Math.sin(theta);
      }
    }
  }
}
