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

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    await scrollToElement(page, "#form-field-language", { block: "center" });

    // buang semua overlay KECUALI Cloudflare
    const killOverlay = () =>
      page.evaluate(() => {
        const CF_SEL =
          ".cf-turnstile, [name='cf-turnstile-response'], iframe[src*='challenges.cloudflare.com'], iframe[src*='cloudflare']";
        const isCF = (el) =>
          el?.matches &&
          (el.matches(CF_SEL) ||
            el.querySelector?.(CF_SEL) ||
            el.closest?.(".cf-turnstile"));

        document.querySelectorAll("iframe").forEach((f) => {
          if (!isCF(f)) f.remove();
        });
        document.querySelectorAll("body *").forEach((el) => {
          if (isCF(el)) return;
          const st = getComputedStyle(el);
          const z = parseInt(st.zIndex, 10);
          if (
            (st.position === "fixed" || st.position === "sticky" || st.position === "absolute") &&
            !Number.isNaN(z) && z >= 1000
          ) el.remove();
        });
      }).catch(() => {});

    await killOverlay();
    const timer = setInterval(() => killOverlay(), 500);

    let token = null;
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[name="cf-turnstile-response"]');
          return el && el.value && el.value.length > 20;
        },
        { timeout: 8000, polling: 300 }
      );
      token = await page.evaluate(
        () => document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
      );
    } finally {
      clearInterval(timer);
    }

    if (!token) return res.status(504).json({ error: "Token gagal didapat" });
    res.json({ token });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close();
  }
});

async function scrollToElement(page, selector, opts = {}) {
  await page.waitForSelector(selector, { timeout: opts.timeout || 8000 });
  await page.evaluate((selector, block) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block });
  }, selector, opts.block || "center");
  await new Promise((r) => setTimeout(r, opts.delay || 1000));
}

module.exports = router;