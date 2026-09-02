const puppeteer = require("puppeteer");
const path = require("path");

const OUT = process.argv[2];
const BASE = "http://localhost:8731";

const SHOTS = [
  {
    file: "01-panel.png",
    h: "Any website,|beside the one|you are reading",
    s: "Pin a site to the rail and it opens here in the panel,|like a small window beside whatever you are reading.",
    setup: async (f) => {
      await f.evaluate(() => window.__open("https://sidebar.lightmorphic.com/"));
      await new Promise((r) => setTimeout(r, 4000));
    },
  },
  {
    file: "02-search.png",
    h: "Search here,|not in a new tab",
    s: "The mark, the name, one box, and a row of letters|for seven engines. Results open in the panel.",
    setup: async (f) => {
      await f.evaluate(() => window.__tab("search"));
    },
  },
  {
    file: "03-scratchpad.png",
    h: "A scratchpad|that follows you",
    s: "One click away, saved as you type, and carried|to your other machines by your own bookmark sync.",
    setup: async (f) => {
      await f.evaluate(() => window.__tab("scratchpad"));
    },
  },
  {
    file: "04-snippets.png",
    h: "The lines you|retype every week",
    s: "Click one and it drops straight into the box|you were typing in. No titles to fill out.",
    setup: async (f) => {
      await f.evaluate(() => window.__tab("snippets"));
    },
  },
  {
    file: "05-light.png",
    h: "Light or dark,|however you read",
    s: "One button cycles light, dark, and following|the browser. Everything stays in your browser.",
    light: true,
    setup: async (f) => {
      await f.evaluate(() => window.__tab("snippets"));
    },
  },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  for (const shot of SHOTS) {
    const url = `${BASE}/frame.html?h=${encodeURIComponent(shot.h)}&s=${encodeURIComponent(shot.s)}${shot.light ? "&light=1" : ""}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    const handle = await page.$("#f");
    const f = await handle.contentFrame();
    // The panel follows the browser unless told otherwise; pin it so the
    // panel and the surrounding ground agree.
    await f.evaluate((t) => document.documentElement.setAttribute("data-theme", t), shot.light ? "light" : "dark");
    if (shot.setup) await shot.setup(f);
    await new Promise((r) => setTimeout(r, 900));
    const out = path.join(OUT, shot.file);
    await page.screenshot({ path: out });
    console.log("wrote", out);
  }
  await browser.close();
})();
