"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const config = require("../config");
const { takeScreenshot } = require("../lib/screenshot");

const router = express.Router();

router.get("/", async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });

  const logs = []; // <-- tampung semua console/error/network

  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();

    // ===== FULL DEBUG CONSOLE =====
    page.on("console", (msg) =>
      logs.push({ type: `console.${msg.type()}`, text: msg.text() })
    );
    page.on("pageerror", (err) =>
      logs.push({ type: "pageerror", text: err.message })
    );
    page.on("requestfailed", (req) =>
      logs.push({
        type: "requestfailed",
        text: `${req.method()} ${req.url()} — ${req.failure()?.errorText}`,
      })
    );
    page.on("response", (resp) => {
      if (resp.status() >= 400)
        logs.push({ type: "response", text: `${resp.status()} ${resp.url()}` });
    });
    // ==============================

    await page.setViewport({ width: 360, height: 704 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await scrollToElement(page, "#form-field-language", { block: "center" });

    // ===== HAPUS OVERLAY DULU (sebelum nunggu token) =====
    // dipanggil berkala karena kadang di-inject ulang
    const killOverlay = async () => {
      await page.evaluate(() => {
        document
          .querySelectorAll("body > div.taku_box, .taku_box, .taku_box-iframe")
          .forEach((el) => el.remove());
      });
    };
    await killOverlay();
    const overlayTimer = setInterval(() => killOverlay().catch(() => {}), 1000);

    // ===== TUNGGU TOKEN =====
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
    } catch (_) {
      logs.push({ type: "info", text: "Timeout: token tidak muncul" });
    } finally {
      clearInterval(overlayTimer);
    }

    const diag = await page.evaluate(() => {
      const input = document.querySelector('[name="cf-turnstile-response"]');
      const widget = document.querySelector(".cf-turnstile, [data-sitekey]");
      return {
        inputAda: !!input,
        inputValue: input ? input.value : null,
        widgetAda: !!widget,
        sitekey: widget ? widget.getAttribute("data-sitekey") : null,
        jumlahIframe: document.querySelectorAll("iframe").length,
        overlayMasihAda: !!document.querySelector("div.taku_box"),
      };
    });

    const { path: shotPath } = await takeScreenshot(page);
    const fullUrl = `${req.protocol}://${req.get("host")}${shotPath}`;

    res.status(200).json({ token, diag, screenshot: fullUrl, logs });
  } catch (err) {
    logs.push({ type: "fatal", text: err.message });
    res.status(500).json({ error: err.message, logs });
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