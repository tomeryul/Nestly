/**
 * Printable checklist PDF, drawn straight onto a canvas.
 *
 * This used to be HTML rasterised by html2canvas, and the checkbox never
 * lined up with its task: html2canvas positions text with its own idea of font
 * metrics, which differs from the browser's (worst on iOS), so a box laid out
 * by the browser and text placed by html2canvas drifted apart — first with
 * flexbox, then with a table. Here the box and the text are drawn in the same
 * coordinate system from the same number, so they cannot disagree.
 *
 * Drawing it ourselves also means rows are never sliced in half across a page
 * break, which slicing one tall image into A4 strips used to do.
 */

export type ChecklistSection = { title: string; items: string[] };

// A4 at 96dpi, rendered at 2x for print sharpness.
const W = 794;
const H = 1123;
const SCALE = 2;
const M = 48; // page margin
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

const BOX = 18; // checkbox side
const GAP = 16; // checkbox → text
const TEXT = 16; // task font size
const LINE = 24; // task line height
const ROW_PAD = 8; // above and below each task
const HEAD = 18; // room heading font size
const FOOT = 32; // space reserved for the page number

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

/**
 * Where to put the baseline so the *body* of Hebrew letters is centred on `y`.
 * Centring the full ink box would move each row by whether it happens to have
 * a ל above or a ק below; a reference word with neither keeps every row the
 * same, the way the eye expects.
 */
function baselineFor(ctx: CanvasRenderingContext2D, y: number, size: number) {
  const m = ctx.measureText("שמסב");
  const body = m.actualBoundingBoxAscent || size * 0.7;
  return y + body / 2;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function roundedBox(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y, x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r);
  ctx.arcTo(x, y, x + s, y, r);
  ctx.closePath();
  ctx.stroke();
}

function newPage() {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  // RTL paragraph direction, so "-" and "+" and numbers inside a Hebrew
  // title land where they do on screen.
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

export function drawChecklist(title: string, subtitle: string, sections: ChecklistSection[]) {
  const pages: HTMLCanvasElement[] = [];
  let { canvas, ctx } = newPage();
  pages.push(canvas);
  const right = W - M;
  const textRight = right - BOX - GAP;
  const textMax = textRight - M;
  const bottom = H - M - FOOT;
  let y = M;

  // ---- page header ----
  ctx.fillStyle = "#111";
  ctx.font = font(700, 26);
  ctx.fillText(title, right, y + 26);
  y += 26 + 10;
  ctx.fillStyle = "#444";
  ctx.font = font(600, 16);
  ctx.fillText(subtitle, right, y + 16);
  y += 16 + 14;
  ctx.fillStyle = "#111";
  ctx.fillRect(M, y, W - 2 * M, 3);
  y += 3 + 24;

  const heading = (text: string, cont: boolean) => {
    ctx.fillStyle = cont ? "#777" : "#111";
    ctx.font = font(700, HEAD);
    ctx.fillText(cont ? `${text} (המשך)` : text, right, y + HEAD);
    y += HEAD + 7;
    ctx.fillStyle = "#bbb";
    ctx.fillRect(M, y, W - 2 * M, 1);
    y += 1 + 4;
  };
  const headingH = HEAD + 7 + 1 + 4;

  const breakPage = () => {
    ({ canvas, ctx } = newPage());
    pages.push(canvas);
    y = M;
  };

  const visible = sections.filter((s) => s.items.length);
  if (!visible.length) {
    ctx.fillStyle = "#666";
    ctx.font = font(400, TEXT);
    ctx.fillText("אין משימות ברשימה.", right, y + TEXT);
  }

  for (const section of visible) {
    ctx.font = font(400, TEXT);
    const rows = section.items.map((t) => wrap(ctx, t, textMax));
    const rowH = (lines: string[]) => ROW_PAD * 2 + lines.length * LINE;

    // Never strand a heading at the foot of a page without its first task.
    if (y + headingH + rowH(rows[0]) > bottom && y > M) breakPage();
    heading(section.title, false);

    rows.forEach((lines) => {
      const h = rowH(lines);
      if (y + h > bottom) {
        breakPage();
        heading(section.title, true);
      }
      // One number drives both: the centre of the first line.
      const mid = y + ROW_PAD + LINE / 2;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.6;
      roundedBox(ctx, right - BOX, mid - BOX / 2, BOX, 4);

      ctx.fillStyle = "#111";
      ctx.font = font(400, TEXT);
      const base = baselineFor(ctx, mid, TEXT);
      lines.forEach((line, i) => ctx.fillText(line, textRight, base + i * LINE));
      y += h;
    });
    y += 18; // breathing room between rooms
  }

  // Page numbers last, once the total is known.
  if (pages.length > 1) {
    pages.forEach((c, i) => {
      const p = c.getContext("2d")!;
      p.fillStyle = "#888";
      p.font = font(400, 11);
      p.textAlign = "center";
      p.fillText(`עמוד ${i + 1} מתוך ${pages.length}`, W / 2, H - M + 6);
    });
  }
  return pages;
}

export async function exportChecklistPdf(opts: {
  title: string;
  subtitle: string;
  sections: ChecklistSection[];
  filename: string;
}) {
  const { jsPDF } = await import("jspdf");
  const pages = drawChecklist(opts.title, opts.subtitle, opts.sections);
  const pdf = new jsPDF("p", "mm", "a4");
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  pages.forEach((c, i) => {
    if (i) pdf.addPage();
    pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, pw, ph);
    // iOS Safari holds canvas memory until GC and caps the total; a long list
    // of A4 pages at 2x can hit that cap, so let each one go once it's used.
    c.width = c.height = 0;
  });
  pdf.save(opts.filename);
}
