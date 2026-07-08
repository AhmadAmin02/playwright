"use strict";

const express = require("express");
const got = require("got");
const { getRealBrowser } = require("../lib/realBrowser");
const { takeScreenshot } = require("../lib/screenshot");

const router = express.Router();

router.get("/", async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });
  
  const logs = [];
  const log = (t, text) => logs.push({ type: t, text });
  
  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const type = r.resourceType();
      if (type === "image" || type === "media" || type === "font") return r.abort();
      r.continue();
    });
    
    page.on("console", (m) => log(`console.${m.type()}`, m.text()));
    page.on("pageerror", (e) => log("pageerror", e.message));
    
    await page.setViewport({ width: 360, height: 704 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    await scrollToElement(page, "#form-field-language", { block: "center" });
    
    // bersihin overlay dulu (biar klik nggak kehalang)
    const killOverlay = () =>
      page.evaluate(() => {
        const CF = ".cf-turnstile, [name='cf-turnstile-response'], iframe[src*='cloudflare']";
        const isCF = (el) =>
          el?.matches && (el.matches(CF) || el.querySelector?.(CF) || el.closest?.(".cf-turnstile"));
        document.querySelectorAll("iframe").forEach((f) => { if (!isCF(f)) f.remove(); });
        document.querySelectorAll("body *").forEach((el) => {
          if (isCF(el)) return;
          const st = getComputedStyle(el);
          const z = parseInt(st.zIndex, 10);
          if ((st.position === "fixed" || st.position === "absolute") && !Number.isNaN(z) && z >= 1000) el.remove();
        });
      }).catch(() => {});
    await killOverlay();
    const overlayTimer = setInterval(killOverlay, 700);
    
    // tunggu widget-nya ke-render
    await page.waitForSelector(".cf-turnstile, [data-sitekey]", { timeout: 15000 });
    
    // fungsi cek token
    const getToken = () =>
      page.evaluate(
        () => document.querySelector('[name="cf-turnstile-response"]')?.value || null
      );
    
    let token = await getToken();
    let clickMethod = "none (auto-solve)";
    
    // ==== kalau belum ke-solve, klik manual ====
    if (!token) {
      // beri sedikit waktu buat auto-solve dulu
      await sleep(3000);
      token = await getToken();
      
      if (!token) {
        // STRATEGI A: masuk ke iframe Cloudflare, klik checkbox di dalamnya
        const cfFrame = page
          .frames()
          .find((f) => /challenges\.cloudflare\.com/.test(f.url()));
        log("info", `CF iframe ditemukan: ${!!cfFrame}`);
        
        if (cfFrame) {
          try {
            await cfFrame.waitForSelector('input[type="checkbox"], label, body', { timeout: 5000 });
            const target =
              (await cfFrame.$('input[type="checkbox"]')) ||
              (await cfFrame.$("label")) ||
              (await cfFrame.$("body"));
            if (target) {
              await target.click();
              clickMethod = "A: click di dalam iframe CF";
              log("info", clickMethod);
            }
          } catch (e) {
            log("info", `Strategi A gagal: ${e.message}`);
          }
        }
        
        token = await waitToken(getToken, 6000);
        
        // STRATEGI B: klik pakai KOORDINAT (checkbox ada di kiri widget)
        if (!token) {
          const box = await page.evaluate(() => {
            const el = document.querySelector(".cf-turnstile, [data-sitekey]");
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          });
          log("info", `Bounding box widget: ${JSON.stringify(box)}`);
          
          if (box) {
            // checkbox biasanya di kiri, ~30px dari tepi, vertikal di tengah
            const cx = box.x + 30;
            const cy = box.y + box.h / 2;
            await page.mouse.move(cx - 5, cy - 5); // gerak dulu biar natural
            await sleep(150);
            await page.mouse.click(cx, cy);
            clickMethod = `B: klik koordinat (${Math.round(cx)}, ${Math.round(cy)})`;
            log("info", clickMethod);
          }
        }
        
        token = token || (await waitToken(getToken, 8000));
      }
    }
    
    clearInterval(overlayTimer);
    
    // diag + screenshot buat lihat kondisi
    const diag = await page.evaluate(() => {
      const input = document.querySelector('[name="cf-turnstile-response"]');
      const widget = document.querySelector(".cf-turnstile, [data-sitekey]");
      return {
        inputAda: !!input,
        inputValue: input ? input.value : null,
        widgetAda: !!widget,
        jumlahIframe: document.querySelectorAll("iframe").length,
        frameUrls: [...document.querySelectorAll("iframe")].map((f) => f.src).slice(0, 5),
      };
    });
    
    const { path: shotPath } = await takeScreenshot(page);
    const fullUrl = `${req.protocol}://${req.get("host")}${shotPath}`;
    const { body } = await got.post("https://tubepilot.ai/wp-admin/admin-ajax.php", {
      form: {
        action: "yt_video_transcript",
        "form_fields[video_url]": "https://youtu.be/weO-otW4Vvs?si=M5gHYYSCaEmUslVv",
        "form_fields[include_timestamps]": "no",
        "form_fields[format_style]": "vtt",
        "form_fields[language]": "id",
        "cf-turnstile-response": token
      }
    });
    const datas = htmlToJSON(body)
    res.status(200).json({ token, clickMethod, diag, screenshot: fullUrl, logs, data: datas });
  } catch (err) {
    log("fatal", err.message);
    res.status(500).json({ error: err.message, logs });
  } finally {
    if (page) await page.close();
  }
});

// ===== helpers =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitToken(getToken, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const t = await getToken();
    if (t && t.length > 20) return t;
    await sleep(400);
  }
  return null;
}

async function scrollToElement(page, selector, opts = {}) {
  await page.waitForSelector(selector, { timeout: opts.timeout || 8000 });
  await page.evaluate((selector, block) => {
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block });
  }, selector, opts.block || "center");
  await sleep(opts.delay || 1000);
}

function htmlToJSON(html) {
  html = html
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
  
  const video = html.match(/<strong>\s*Video:\s*<\/strong>\s*([^<]+)/i)?.[1]?.trim() ?? null;
  const language = html.match(/<strong>\s*Language:\s*<\/strong>\s*([^|<]+)/i)?.[1]?.trim() ?? null;
  const format = html.match(/<strong>\s*Format:\s*<\/strong>\s*([^<]+)/i)?.[1]?.trim() ?? null;
  
  const transcript = html.match(
    /<div class=['"]transcript-content['"][^>]*>([\s\S]*?)<\/div>/i
  )?.[1] ?? "";
  
  const lines = transcript.trim().split(/\r?\n/);
  
  const captions = [];
  let current = null;
  
  for (const line of lines) {
    const text = line.trim();
    
    if (!text || text === "WEBVTT") continue;
    
    if (text.includes("-->")) {
      if (current) captions.push(current);
      
      const [start, end] = text.split(/\s*-->\s*/);
      
      current = {
        start,
        end,
        text: ""
      };
    } else if (current) {
      current.text += (current.text ? " " : "") + text;
    }
  }
  
  if (current) captions.push(current);
  
  return {
    video,
    language,
    format,
    captions
  };
}

module.exports = router;