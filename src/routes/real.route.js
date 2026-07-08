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

    // ===== BERSIHKAN cookie + cache =====
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

    // bersihkan storage origin
    await page.evaluate(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
    }).catch(() => {});

    try {
      await scrollToElement(page, "#form-field-language", { block: "center" });
    } catch (e) {
      log("info", `scroll: ${e.message}`);
    }

    // buang overlay KECUALI Cloudflare
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

    // ===== LOOP KLIK + SCREENSHOT tiap attempt =====
    const shots = [];
    const MAX_CLICK = 15;
    let token = await getToken();
    let clickMethod = token ? "none (auto-solve)" : "";

    for (let i = 1; !token && i <= MAX_CLICK; i++) {
      log("info", `=== attempt klik #${i} ===`);
      let method = "-";

      // Strategi A: klik dalam iframe CF
      const cfFrame = page.frames().find((f) => /challenges\.cloudflare\.com/.test(f.url()));
      if (cfFrame) {
        try {
          await cfFrame.waitForSelector('input[type="checkbox"], label, body', { timeout: 3000 });
          const target =
            (await cfFrame.$('input[type="checkbox"]')) ||
            (await cfFrame.$("label")) ||
            (await cfFrame.$("body"));
          if (target) { await target.click(); method = `A#${i}`; log("info", `klik ${method}`); }
        } catch (e) {
          log("info", `A#${i} gagal: ${e.message}`);
        }
      }
      token = await waitToken(getToken, 2000);

      // Strategi B: klik koordinat (kalau A belum berhasil)
      if (!token) {
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
          method = `B#${i} (${Math.round(cx)},${Math.round(cy)})`;
          log("info", `klik ${method}`);
        }
        token = await waitToken(getToken, 2000);
      }

      // === SCREENSHOT tiap attempt ===
      const shotUrl = await snap();
      shots.push({ attempt: i, method, token: !!token, url: shotUrl });

      if (token) { clickMethod = method; break; }
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

    res.status(200).json({ token, clickMethod, diag, shots, logs });
  } catch (err) {
    log("fatal", err.message);
    const screenshot = await snap(); // ss walau error
    res.status(500).json({ error: err.message, screenshot, logs });
  } finally {
    if (context) await context.close();
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

module.exports = router;