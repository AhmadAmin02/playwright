"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");

const router = express.Router();

// GET /api/real?url=https://...
router.get("/", async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });

  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 360, height: 704 });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // === PERSIS seperti versi yang jalan ===
    await scrollToElement(page, "#form-field-language", { block: "center" });

    const killOverlay = () =>
      page.evaluate(() => {
        document
          .querySelectorAll("body > div.taku_box, .taku_box, .taku_box-iframe")
          .forEach((el) => el.remove());
      }).catch(() => {});
    await killOverlay();
    const timer = setInterval(() => killOverlay(), 1000);

    let token = null;
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[name="cf-turnstile-response"]');
          return el && el.value && el.value.length > 20;
        },
        { timeout: 30000, polling: 500 }
      );
      token = await page.evaluate(
        () => document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
      );
    } finally {
      clearInterval(timer);
    }
    // =======================================

    if (!token) return res.status(504).json({ error: "Token gagal didapat" });
    res.json({ token });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close();
  }
});

// helper ini WAJIB dipertahankan apa adanya — jeda 1200ms-nya penting buat timing Turnstile
async function scrollToElement(page, selector, opts = {}) {
  await page.waitForSelector(selector, { timeout: opts.timeout || 10000 });
  await page.evaluate((selector, block) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block });
  }, selector, opts.block || "center");
  await new Promise((r) => setTimeout(r, opts.delay || 1200));
}

module.exports = router;