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

  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 360, height: 704 });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await scrollToElement(page, "#form-field-language", { block: "center" });

    // coba tunggu token, tapi JANGAN langsung throw — kita mau diagnosa
    let token = null;
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[name="cf-turnstile-response"]');
          return el && el.value && el.value.length > 20;
        },
        { timeout: 25000, polling: 500 }
      );
      token = await page.evaluate(
        () => document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
      );
    } catch (_) {
      // timeout → ambil info diagnostik
    }

    // DIAGNOSA: apa yang sebenarnya ada di halaman?
    const diag = await page.evaluate(() => {
      const input = document.querySelector('[name="cf-turnstile-response"]');
      const widget = document.querySelector(".cf-turnstile, [data-sitekey]");
      return {
        inputAda: !!input,
        inputValue: input ? input.value : null,
        widgetAda: !!widget,
        sitekey: widget ? widget.getAttribute("data-sitekey") : null,
        jumlahIframe: document.querySelectorAll("iframe").length,
        title: document.title,
        bodySnippet: document.body.innerText.slice(0, 300),
      };
    });

    // screenshot kondisi saat ini (SEBELUM hapus iframe apa pun)
    const { path: shotPath } = await takeScreenshot(page);
    const fullUrl = `${req.protocol}://${req.get("host")}${shotPath}`;

    res.status(200).json({ token, diag, screenshot: fullUrl });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close();
  }
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