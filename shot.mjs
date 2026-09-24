import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 1150 }, deviceScaleFactor: 2 });
await p.goto('file:///tmp/claude-0/-home-user-Nestly/5d41f2bb-0038-50b3-aa4f-40cdaa9331e6/scratchpad/preview.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/claude-0/-home-user-Nestly/5d41f2bb-0038-50b3-aa4f-40cdaa9331e6/scratchpad/' + process.argv[2] + '.png', fullPage: true });
await b.close();
