const puppeteer = require("puppeteer");
(async () => {
  const b = await puppeteer.launch({ headless: "shell", args: ["--font-render-hinting=none", "--force-color-profile=srgb", "--hide-scrollbars"] });
  const p = await b.newPage();
  await p.setViewport({ width: 440, height: 280, deviceScaleFactor: 3 });
  await p.goto("http://localhost:8731/tile.html", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: process.argv[2] });
  await b.close();
  console.log("tile done");
})();
