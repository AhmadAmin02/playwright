"use strict";

const express = require("express");
const { getBrowser } = require("../lib/browser");
const config = require("../config");

const router = express.Router();

// GET /api/scrape?url=https://...&json=1
router.get("/", async (req, res, next) => {
  const { url, json } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });

  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "id-ID",
    });

    const page = await context.newPage();
    const r = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.requestTimeout,
    });

    const status = r ? r.status() : 0;
    const body = await page.content(); // HTML penuh setelah render

    // Kalau minta json=1, coba ambil text mentah & parse
    if (json) {
      const text = await page.evaluate(() => document.body.innerText);
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(200).json({ status, data });
    }

    res.status(200).json({ status, html: body });
  } catch (err) {
    next(err);
  } finally {
    if (context) await context.close(); // tutup context, browser tetap hidup
  }
});

module.exports = router;