"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const { takeScreenshot } = require("../lib/screenshot");
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "tmp");
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const router = express.Router();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

router.get("/", async (req, res, next) => {
  let browser;
  let page;
  
  try {
    ({ browser } = await getRealBrowser());
    
    page = await browser.newPage();
    
    await page.setViewport({
      width: 1280,
      height: 800,
    });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    );
    
    page.on("console", msg => {
      console.log("[Console]", msg.text());
    });
    
    page.on("response", response => {
      console.log(response.status(), response.url());
    });
    
    await page.goto("https://www.tiktok.com/@tiktok", {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    
    // Tunggu kalau ada challenge
    await delay(10000);
    
    // Screenshot (pakai fungsi kamu)
    const { path: shotPath } = await takeScreenshot(page);
    const screenshot = `${req.protocol}://${req.get("host")}${shotPath}`;
    
    // Simpan HTML
    const html = await page.content();
    fs.writeFileSync(
      path.join(dir, "tiktok.html"),
      html,
      "utf8"
    );
    
    // Ambil cookie
    const cookies = await page.cookies();
    const cookieHeader = cookies
      .map(c => `${c.name}=${c.value}`)
      .join("; ");
    
    res.json({
      success: true,
      url: page.url(),
      title: await page.title(),
      cookies: cookies.length,
      cookieHeader,
      screenshot,
      html: `${req.protocol}://${req.get("host")}/tmp/tiktok.html`
    });
    
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
});

module.exports = router;