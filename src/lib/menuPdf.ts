import { M, W, H, baselineFor, drawHeader, font, newPage, numberPages, savePdf, wrap } from "./checklistPdf";

/**
 * The week's menu as a printable A4 sheet, for the fridge: a block per day,
 * Sunday to Saturday, the day and its date on the right and its meals beside
 * them, then whatever is planned for the whole week. Drawn on a canvas like the
 * cleaning sheet, so Hebrew and numbers sit where they do on screen and a day
 * is never split across a page break.
 */
export type MenuLine = { label: string; dishes: string };
export type MenuDay = { day: string; date: string; meals: MenuLine[] };

const DAY_COL = 150; // the day name + date column
const NAME = 19; // dish text
const LABEL = 14; // "ערב:" before it
const LINE = 28;
const PAD = 12; // above and below each day
const FOOT = 32;

export function drawMenu(title: string, subtitle: string, days: MenuDay[], extras: MenuLine[]) {
  const pages: HTMLCanvasElement[] = [];
  let { canvas, ctx } = newPage();
  pages.push(canvas);
  const right = W - M;
  const mealRight = right - DAY_COL;
  const bottom = H - M - FOOT;
  let y = drawHeader(ctx, title, subtitle);

  // One line per meal: the label, then its dishes, wrapped under themselves.
  const layout = (meals: MenuLine[]) =>
    meals.map((m) => {
      ctx.font = font(700, LABEL);
      const labelW = m.label ? ctx.measureText(m.label).width + 8 : 0;
      ctx.font = font(500, NAME);
      return { ...m, labelW, lines: wrap(ctx, m.dishes, mealRight - M - labelW) };
    });

  const drawBlock = (head: { day: string; date: string } | null, meals: MenuLine[], empty: string) => {
    const rows = layout(meals);
    const lineCount = Math.max(head ? 2 : 1, rows.reduce((n, r) => n + r.lines.length, 0) || 1);
    const h = PAD * 2 + lineCount * LINE;
    if (y + h > bottom && y > M + 1) {
      ({ canvas, ctx } = newPage());
      pages.push(canvas);
      y = M;
    }
    const top = y + PAD;
    if (head) {
      ctx.fillStyle = "#111";
      ctx.font = font(700, 20);
      ctx.fillText(head.day, right, baselineFor(ctx, top + LINE / 2, 20));
      ctx.fillStyle = "#666";
      ctx.font = font(500, 15);
      ctx.fillText(head.date, right, baselineFor(ctx, top + LINE * 1.5, 15));
    }
    let line = 0;
    if (!rows.length) {
      ctx.fillStyle = "#aaa";
      ctx.font = font(400, NAME);
      ctx.fillText(empty, mealRight, baselineFor(ctx, top + LINE / 2, NAME));
    }
    for (const r of rows) {
      const mid = top + line * LINE + LINE / 2;
      if (r.label) {
        ctx.fillStyle = "#777";
        ctx.font = font(700, LABEL);
        ctx.fillText(r.label, mealRight, baselineFor(ctx, mid, LABEL));
      }
      ctx.fillStyle = "#111";
      ctx.font = font(500, NAME);
      r.lines.forEach((l, i) => ctx.fillText(l, mealRight - r.labelW, baselineFor(ctx, mid + i * LINE, NAME)));
      line += r.lines.length;
    }
    y += h;
    ctx.fillStyle = "#ddd";
    ctx.fillRect(M, y, W - 2 * M, 1);
    y += 1;
  };

  days.forEach((d) => drawBlock({ day: d.day, date: d.date }, d.meals, "—"));
  if (extras.length) {
    y += 18;
    ctx.fillStyle = "#111";
    ctx.font = font(700, 18);
    ctx.fillText("עוד השבוע", right, y + 18);
    y += 18 + 8;
    drawBlock(null, extras, "");
  }
  numberPages(pages);
  return pages;
}

export async function exportMenuPdf(opts: { title: string; subtitle: string; days: MenuDay[]; extras: MenuLine[]; filename: string }) {
  await savePdf(drawMenu(opts.title, opts.subtitle, opts.days, opts.extras), opts.filename);
}
