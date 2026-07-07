"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const config = require("../config");
const { takeScreenshot } = require("../lib/screenshot");

const router = express.Router();

// GET /api/real?url=https://...&json=1
router.get("/", async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });
  
  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    
    await page.setViewport({ width: 360, height: 704 });
    //const { id } = await startRecording(page, { fps: 12, width: 854, height: 480 });
    
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 0,
    });
    
    await scrollToElement(page, '#form-field-language', { block: "center" });
    await page.waitForFunction(() => {
      const el = document.querySelector('[name="cf-turnstile-response"]');
      return el && el.value.length > 0;
    }, {
      timeout: 30000
    });
    //await new Promise(resolve => setTimeout(resolve, 5000));
    await page.evaluate(() => {
      const iframe = document.querySelector('.taku_box-iframe');
      if (iframe) iframe.remove();
    });
    const { path: shotPath } = await takeScreenshot(page);
    const token = await page.evaluate(() =>
      document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
    );
    /*const { path: videoPath } = await stopRecording(id);*/
    const fullUrl = `${req.protocol}://${req.get("host")}${shotPath}`;
    res.status(200).json({ token, fullUrl });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close(); // tutup page, browser tetap hidup
  }
});

async function scrollToElement(page, selector, opts = {}) {
  // tunggu elemennya muncul dulu (biar nggak error kalau lazy-load)
  await page.waitForSelector(selector, { timeout: opts.timeout || 10000 });
  
  await page.evaluate((selector, block) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block });
  }, selector, opts.block || "center"); // "start" | "center" | "end"
  
  // kasih jeda biar animasi scroll-nya kerekam
  await new Promise((r) => setTimeout(r, opts.delay || 1200));
}

module.exports = router;