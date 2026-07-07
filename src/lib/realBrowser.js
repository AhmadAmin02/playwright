"use strict";

const { connect } = require("puppeteer-real-browser");

let instancePromise = null;

/**
 * Connect sekali, reuse. puppeteer-real-browser jalan headful di dalam
 * virtual display (xvfb) supaya lolos deteksi bot.
 */
function getRealBrowser() {
  if (!instancePromise) {
    instancePromise = connect({
      headless: false, // WAJIB false biar "real" — xvfb yang bikin bisa jalan di server
      turnstile: true, // auto-klik Cloudflare Turnstile
      disableXvfb: false, // biarkan xvfb aktif (Linux/server)
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      customConfig: {
        // pakai Chrome asli yang di-install di Dockerfile
        chromePath: process.env.CHROME_PATH || undefined,
      },
      connectOption: {},
    });
  }
  return instancePromise;
}

async function closeRealBrowser() {
  if (instancePromise) {
    const { browser } = await instancePromise;
    await browser.close();
    instancePromise = null;
  }
}

module.exports = { getRealBrowser, closeRealBrowser };