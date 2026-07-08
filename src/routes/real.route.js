"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const { takeScreenshot } = require("../lib/screenshot");

const router = express.Router();

router.get("/", async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });
  
  const logs = [];
  const log = (t, text) => logs.push({ type: t, text });
  
  let context;
  let page;
  
  const snap = async () => {
    if (!page) return null;
    try {
      const { path: p } = await takeScreenshot(page);
      return `${req.protocol}://${req.get("host")}${p}`;
    } catch (e) {
      log("info", `screenshot gagal: ${e.message}`);
      return null;
    }
  };
  
  try {
    const { browser } = await getRealBrowser();
    
    // ===== CONTEXT BARU = state bersih tiap request =====
    if (typeof browser.createBrowserContext === "function") {
      context = await browser.createBrowserContext();
      log("info", "pakai createBrowserContext (isolated)");
    } else if (typeof browser.createIncognitoBrowserContext === "function") {
      context = await browser.createIncognitoBrowserContext();
      log("info", "pakai createIncognitoBrowserContext (isolated)");
    }
    page = context ? await context.newPage() : await browser.newPage();
    
    page.on("console", (m) => log(`console.${m.type()}`, m.text()));
    page.on("pageerror", (e) => log("pageerror", e.message));
    
    // ===== BERSIHKAN cookie + cache (fallback kalau context nggak isolated) =====
    try {
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");
      await client.send("Network.clearBrowserCache");
      log("info", "cookies + cache dibersihkan");
    } catch (e) {
      log("info", `clear CDP gagal: ${e.message}`);
    }
    
    await page.setViewport({ width: 360, height: 704 });
    
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
      .catch((e) => log("info", `goto: ${e.message}`));
    
    // bersihkan storage origin ini juga (setelah sampai origin)
    await page.evaluate(() => {
      try { localStorage.clear();
        sessionStorage.clear(); } catch (_) {}
    }).catch(() => {});
    
    try {
      await scrollToElement(page, "#form-field-language", { block: "center" });
    } catch (e) {
      log("info", `scroll: ${e.message}`);
    }
    
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
    
    try {
      await page.waitForSelector(".cf-turnstile, [data-sitekey]", { timeout: 15000 });
    } catch (e) {
      log("info", `widget: ${e.message}`);
    }
    
    const getToken = () =>
      page.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || null);
    
    // ===== LOOP KLIK sampai dapat token / mentok =====
    const MAX_CLICK = 5;
    let token = await getToken();
    let clickMethod = token ? "none (auto-solve)" : "";
    
    for (let i = 1; !token && i <= MAX_CLICK; i++) {
      log("info", `=== attempt klik #${i} ===`);
      
      // Strategi A: klik dalam iframe CF
      const cfFrame = page.frames().find((f) => /challenges\.cloudflare\.com/.test(f.url()));
      if (cfFrame) {
        try {
          await cfFrame.waitForSelector('input[type="checkbox"], label, body', { timeout: 3000 });
          const target =
            (await cfFrame.$('input[type="checkbox"]')) ||
            (await cfFrame.$("label")) ||
            (await cfFrame.$("body"));
          if (target) {
            await target.click();
            clickMethod = `A#${i}: klik dalam iframe`;
            log("info", clickMethod);
          }
        } catch (e) {
          log("info", `A#${i} gagal: ${e.message}`);
        }
      }
      token = await waitToken(getToken, 2500);
      if (token) break;
      
      // Strategi B: klik koordinat
      const box = await page.evaluate(() => {
        const el = document.querySelector(".cf-turnstile, [data-sitekey]");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      if (box) {
        const cx = box.x + 30;
        const cy = box.y + box.h / 2;
        await page.mouse.move(cx - 5, cy - 5);
        await sleep(120);
        await page.mouse.click(cx, cy);
        clickMethod = `B#${i}: koordinat (${Math.round(cx)}, ${Math.round(cy)})`;
        log("info", clickMethod);
      }
      token = await waitToken(getToken, 2500);
    }
    
    clearInterval(overlayTimer);
    
    const diag = await page.evaluate(() => {
      const input = document.querySelector('[name="cf-turnstile-response"]');
      const widget = document.querySelector(".cf-turnstile, [data-sitekey]");
      return {
        inputAda: !!input,
        inputValue: input ? input.value : null,
        widgetAda: !!widget,
        jumlahIframe: document.querySelectorAll("iframe").length,
      };
    }).catch((e) => ({ diagError: e.message }));
    
    const screenshot = await snap(); // ss selalu diambil
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
    const data = htmlToJSON(body);
    res.status(200).json({ token, clickMethod, diag, screenshot, logs, data });
  } catch (err) {
    log("fatal", err.message);
    const screenshot = await snap(); // ss walau error
    res.status(500).json({ error: err.message, screenshot, logs });
  } finally {
    if (context) await context.close(); // tutup context → state ikut kebuang
    else if (page) await page.close();
  }
});

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