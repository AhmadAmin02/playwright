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
    
    await page.setViewport({ width: 360, height: 704 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    await scrollToElement(page, "#form-field-language", { block: "center" });
    
    // ===== OVERLAY KILLER: buang semua overlay KECUALI Cloudflare =====
    const killOverlay = () =>
      page.evaluate(() => {
        // penanda: apakah elemen ini bagian dari Cloudflare Turnstile?
        const CF_SEL =
          ".cf-turnstile, [name='cf-turnstile-response'], iframe[src*='challenges.cloudflare.com'], iframe[src*='cloudflare']";
        const isCloudflare = (el) => {
          if (!el || !el.matches) return false;
          if (el.matches(CF_SEL)) return true; // dia sendiri CF
          if (el.querySelector && el.querySelector(CF_SEL)) return true; // memuat CF
          if (el.closest && el.closest(".cf-turnstile")) return true; // di dalam widget CF
          return false;
        };
        
        let removed = 0;
        
        // 1) semua IFRAME yang bukan Cloudflare
        document.querySelectorAll("iframe").forEach((f) => {
          if (!isCloudflare(f)) {
            f.remove();
            removed++;
          }
        });
        
        // 2) elemen overlay: position fixed/sticky/absolute + z-index tinggi
        document.querySelectorAll("body *").forEach((el) => {
          if (isCloudflare(el)) return;
          const st = getComputedStyle(el);
          const z = parseInt(st.zIndex, 10);
          const pos = st.position;
          const isOverlay =
            (pos === "fixed" || pos === "sticky" || pos === "absolute") &&
            !Number.isNaN(z) && z >= 1000;
          if (isOverlay) {
            el.remove();
            removed++;
          }
        });
        
        return removed;
      }).catch(() => 0);
    
    await killOverlay();
    const timer = setInterval(() => killOverlay(), 1000);
    
    // ===== TUNGGU TOKEN =====
    let token = null;
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[name="cf-turnstile-response"]');
          return el && el.value && el.value.length > 20;
        }, { timeout: 30000, polling: 500 }
      );
      token = await page.evaluate(
        () => document.querySelector('[name="cf-turnstile-response"]')?.value ?? null
      );
    } catch (_) {
      logs.push({ type: "info", text: "Timeout: token tidak muncul" });
    } finally {
      clearInterval(timer);
    }
    
    // ===== DIAGNOSA (biar tau overlay mana yang masih nyangkut) =====
    const diag = await page.evaluate(() => {
      const input = document.querySelector('[name="cf-turnstile-response"]');
      const widget = document.querySelector(".cf-turnstile, [data-sitekey]");
      // daftar overlay yang MASIH ada (buat debug)
      const sisaOverlay = [];
      document.querySelectorAll("body *").forEach((el) => {
        const st = getComputedStyle(el);
        const z = parseInt(st.zIndex, 10);
        if ((st.position === "fixed" || st.position === "absolute") && z >= 1000) {
          sisaOverlay.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className?.toString().slice(0, 60),
            id: el.id || null,
            z,
          });
        }
      });
      return {
        inputAda: !!input,
        inputValue: input ? input.value : null,
        widgetAda: !!widget,
        sitekey: widget ? widget.getAttribute("data-sitekey") : null,
        jumlahIframe: document.querySelectorAll("iframe").length,
        sisaOverlay,
      };
    });
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
    console.log(body);
    const { path: shotPath } = await takeScreenshot(page);
    const fullUrl = `${req.protocol}://${req.get("host")}${shotPath}`;
    
    res.status(200).json({ body, token, diag, screenshot: fullUrl, logs });
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