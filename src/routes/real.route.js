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
      timeout: 0,
    });
    
    if (json) {
      const text = await page.evaluate(() => document.body.innerText);
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(200).json({ data });
    }
    console.log(await page.url());
    
    await page.waitForSelector('[name="cf-turnstile-response"]', { timeout: 30000 });
    const token = await page.evaluate(() =>
      document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
    );
    res.status(200).json({ token });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close(); // tutup page, browser tetap hidup
  }
});

module.exports = router;