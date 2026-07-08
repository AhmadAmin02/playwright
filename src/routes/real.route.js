"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const { takeScreenshot } = require("../lib/screenshot");

const router = express.Router();

// GET /api/real?url=https://...
router.get("/", async (req, res, next) => {
  /*const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });*/
  
  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const link = `https://amprem.irfanjawa.com/`;
    page.on("console", msg => console.log(msg.text()));
    
    page.on("response", res => {
      if (res.url().includes("challenge")) {
        console.log(res.status(), res.url());
      }
    });
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    /*while (!page.url().includes("dashboard")) {
      await new Promise(r => setTimeout(r, 500));
    }*/
    
    await page.waitForSelector("body > main > section.relative.pt-32.pb-20.px-4.overflow-hidden > div.max-w-5xl.mx-auto.text-center.relative > h1 > span.gradient-text");
    const html = await page.content();
    
    const { path: shotPath } = await takeScreenshot(page);
    const screenshot = `${req.protocol}://${req.get("host")}${shotPath}`;
    
    res.json({
      link,
      html,
      screenshot
    });
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close();
  }
});

/**
 * Cari link YouTube dari sebuah string dan kembalikan video ID-nya.
 *
 * - Input 1 URL saja  -> return string ID tunggal (atau null kalau tidak valid)
 * - Input teks/banyak link -> return array ID (otomatis dedupe)
 *
 * @param {string} input
 * @param {boolean} [unique=true]  Dedupe ID saat hasilnya array.
 * @returns {string|null|string[]}
 */
function getId(input, unique = true) {
  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  
  // Ambil ID dari satu potongan URL
  const parseOne = (raw) => {
    try {
      let clean = raw.trim();
      if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;
      
      const u = new URL(clean);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      
      const isYoutube =
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "music.youtube.com" ||
        host === "youtube-nocookie.com" ||
        host === "youtu.be";
      if (!isYoutube) return null;
      
      let id = null;
      const parts = u.pathname.split("/").filter(Boolean);
      
      if (host === "youtu.be") {
        id = parts[0]; // youtu.be/<id>
      } else if (u.searchParams.get("v")) {
        id = u.searchParams.get("v"); // watch?v=<id>
      } else if (parts.length >= 2 && ["shorts", "embed", "live", "v", "watch"].includes(parts[0])) {
        id = parts[1]; // /shorts|embed|live|v|watch/<id>
      }
      
      return id && idPattern.test(id) ? id : null;
    } catch {
      return null;
    }
  };
  
  if (typeof input !== "string") return null;
  
  // Deteksi: apakah input cuma 1 URL (tanpa spasi/newline di dalamnya)?
  const isSingleUrl = input.trim().length > 0 && !/\s/.test(input.trim());
  
  if (isSingleUrl) {
    return parseOne(input); // -> string | null
  }
  
  // Mode teks: cari semua link YouTube
  const urlRegex =
    /https?:\/\/[^\s<>"'`)]+|(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)[^\s<>"'`)]*/gi;
  
  const ids = [];
  for (const raw of input.match(urlRegex) || []) {
    const id = parseOne(raw);
    if (id) ids.push(id);
  }
  
  return unique ? [...new Set(ids)] : ids; // -> string[]
}

module.exports = router;