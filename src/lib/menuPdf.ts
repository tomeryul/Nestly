import { W, H, baselineFor, drawHeader, font, newPage, savePdf, wrap } from "./checklistPdf";

/**
 * The week's menu as a printable A4 sheet for the fridge, landscape: seven
 * columns side by side, Sunday on the right, each with its day and date on top
 * and that day's dishes under it, one per line. The grid runs to the foot of the
 * page, so a day with nothing planned is room to write one in by hand. Drawn on
 * a canvas like the cleaning sheet, so Hebrew and numbers sit where they do on
 * screen; always one page (the text shrinks if a day is unusually full).
 */
export type MenuLine = { label: string; dishes: string[] };
export type MenuDay = { day: string; date: string; meals: MenuLine[] };

// Landscape: the portrait page turned on its side.
const PW = H;
const PH = W;
const PM = 40; // page margin
const HEAD = 58; // the day + date band at the top of each column
const PAD = 12; // inside a column
const BULLET = 13; // room for the "•" that starts each dish, so a long name that wraps still reads as one

export function drawMenu(title: string, subtitle: string, days: MenuDay[], extras: MenuLine[]) {
  const { canvas, ctx } = newPage(PW, PH);
  const right = PW - PM;
  const top = drawHeader(ctx, title, subtitle, PW, PM) - 6;
  const extrasH = extras.length ? 40 : 0;
  const bottom = PH - PM - extrasH;
  const colW = (PW - 2 * PM) / days.length;
  const textW = colW - PAD * 2;

  // The largest dish size at which every day fits its column.
  const layoutAt = (size: number) => {
    const line = Math.round(size * 1.35);
    ctx.font = font(500, size);
    const cols = days.map((d) => d.meals.map((m) => ({ label: m.label, dishes: m.dishes.map((dish) => wrap(ctx, dish, textW - BULLET)) })));
    const need = cols.map((meals) => meals.reduce((h, m) => h + (m.label ? 20 : 0) + m.dishes.reduce((n, l) => n + l.length * line + 4, 0) + 6, 0));
    return { size, line, cols, fits: need.every((h) => HEAD + PAD + h <= bottom - top) };
  };
  let layout = layoutAt(17);
  for (const size of [16, 15, 14, 13, 12]) if (!layout.fits) layout = layoutAt(size);

  days.forEach((d, i) => {
    const xr = right - i * colW; // RTL: Sunday's column is the rightmost
    const xl = xr - colW;
    // Day band
    ctx.fillStyle = "#f1f1f1";
    ctx.fillRect(xl, top, colW, HEAD);
    ctx.fillStyle = "#111";
    ctx.font = font(700, 19);
    ctx.fillText(d.day, xr - PAD, baselineFor(ctx, top + 21, 19));
    ctx.fillStyle = "#666";
    ctx.font = font(500, 14);
    ctx.fillText(d.date, xr - PAD, baselineFor(ctx, top + 42, 14));
    // Dishes, one per line, under their meal when the day has more than one
    let y = top + HEAD + PAD;
    for (const m of layout.cols[i]) {
      if (m.label) {
        ctx.fillStyle = "#888";
        ctx.font = font(700, 12);
        ctx.fillText(m.label, xr - PAD, baselineFor(ctx, y + 8, 12));
        y += 20;
      }
      ctx.font = font(500, layout.size);
      for (const lines of m.dishes) {
        ctx.fillStyle = "#999";
        ctx.fillText("•", xr - PAD, baselineFor(ctx, y + layout.line / 2, layout.size));
        ctx.fillStyle = "#111";
        for (const l of lines) {
          ctx.fillText(l, xr - PAD - BULLET, baselineFor(ctx, y + layout.line / 2, layout.size));
          y += layout.line;
        }
        y += 4;
      }
      y += 6;
    }
  });

  // Grid: outline, column dividers, and the line under the day band.
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(PM, top, PW - 2 * PM, bottom - top);
  ctx.beginPath();
  for (let i = 1; i < days.length; i++) {
    const x = right - i * colW;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  ctx.moveTo(PM, top + HEAD);
  ctx.lineTo(right, top + HEAD);
  ctx.stroke();

  // Whatever is planned for the whole week (or no day), in one line under the grid.
  if (extras.length) {
    const text = extras.map((e) => `${e.label} ${e.dishes.join(", ")}`).join("   ·   ");
    ctx.fillStyle = "#111";
    ctx.font = font(500, 15);
    ctx.fillText(wrap(ctx, text, PW - 2 * PM)[0], right, baselineFor(ctx, bottom + extrasH / 2 + 4, 15));
  }
  return [canvas];
}

export async function exportMenuPdf(opts: { title: string; subtitle: string; days: MenuDay[]; extras: MenuLine[]; filename: string }) {
  await savePdf(drawMenu(opts.title, opts.subtitle, opts.days, opts.extras), opts.filename, "landscape");
}
