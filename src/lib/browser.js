"use strict";

const { chromium } = require("playwright");

let browserPromise = null;

/** Launch sekali, reuse terus (hemat RAM + cepat). */
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = { getBrowser, closeBrowser };