"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const config = require("../config");

const router = express.Router();

// GET /api/real?url=https://...&json=1
router.get("/", async (req, res, next) => {
  const { url, json } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });
  
  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.requestTimeout,
    });
    
    if (json) {
      const text = await page.evaluate(() => document.body.innerText);
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(200).json({ data });
    }
    
    const html = await page.content();
    res.status(200).json({ html });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close(); // tutup page, browser tetap hidup
  }
});

module.exports = router;