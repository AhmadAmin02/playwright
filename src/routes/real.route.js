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

    // scroll ke widget (biar ke-render) lalu buang overlay yang nutupin
    await page.waitForSelector("#form-field-language", { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => {
      document.querySelector("#form-field-language")
        ?.scrollIntoView({ block: "center" });
    });

    const killOverlay = () =>
      page.evaluate(() => {
        document.querySelectorAll("div.taku_box, .taku_box-iframe")
          .forEach((el) => el.remove());
      }).catch(() => {});
    await killOverlay();
    const timer = setInterval(killOverlay, 1000);

    // tunggu token muncul
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

    if (!token) return res.status(504).json({ error: "Token gagal didapat" });
    res.json({ token });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close();
  }
});

module.exports = router;