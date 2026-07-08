"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const config = require("../config");
const { takeScreenshot } = require("../lib/screenshot");

const router = express.Router();

// GET /api/real?url=https://...
router.get("/", async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });

  const MAX_RETRY = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    let page;
    try {
      const { browser } = await getRealBrowser();
      page = await browser.newPage();

      // (a) BERSIHKAN cookie + cache tiap percobaan → state selalu fresh
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");
      await client.send("Network.clearBrowserCache");

      await page.setViewport({ width: 360, height: 704 });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000, // jangan 0 (tak terhingga) — kasih batas biar retry jalan
      });

      await scrollToElement(page, "#form-field-language", { block: "center" });

      // (b) TUNGGU token beneran muncul, bukan sleep buta
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[name="cf-turnstile-response"]');
          return el && el.value && el.value.length > 20;
        },
        { timeout: 25000, polling: 500 }
      );

      // bersihkan iframe pengganggu (kalau ada) SEBELUM screenshot
      await page.evaluate(() => {
        const iframe = document.querySelector(".taku_box-iframe");
        if (iframe) iframe.remove();
      });

      const token = await page.evaluate(
        () =>
          document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
      );

      if (!token) throw new Error("Token Turnstile kosong");

      const { path: shotPath } = await takeScreenshot(page);
      const fullUrl = `${req.protocol}://${req.get("host")}${shotPath}`;

      return res.status(200).json({ token, fullUrl, attempt });
    } catch (err) {
      lastErr = err;
      console.warn(`Turnstile gagal (percobaan ${attempt}/${MAX_RETRY}): ${err.message}`);
    } finally {
      if (page) await page.close(); // tutup page tiap percobaan → state ikut kebuang
    }
  }

  // (c) semua percobaan gagal
  next(lastErr || new Error("Turnstile gagal setelah beberapa percobaan"));
});

async function scrollToElement(page, selector, opts = {}) {
  await page.waitForSelector(selector, { timeout: opts.timeout || 10000 });
  await page.evaluate((selector, block) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block });
  }, selector, opts.block || "center");
  await new Promise((r) => setTimeout(r, opts.delay || 1200));
}

module.exports = router;