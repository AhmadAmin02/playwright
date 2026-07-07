"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SHOT_DIR = "/tmp/shots";
const DELETE_AFTER_MS = 120 * 1000; // hapus 1 menit setelah dibuat

fs.mkdirSync(SHOT_DIR, { recursive: true });

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Ambil screenshot dari puppeteer `page`.
 * @param {import("puppeteer").Page} page
 * @param {object} opts
 *   - fullPage: boolean  (default true)
 *   - selector: string   (kalau diisi, screenshot elemen itu saja)
 *   - type: "png"|"jpeg" (default "jpeg" biar ringan)
 *   - quality: number    (1-100, hanya utk jpeg, default 70)
 * @returns {Promise<{ id: string, path: string }>}  path relatif utk URL
 */
async function takeScreenshot(page, opts = {}) {
  const type = opts.type || "jpeg";
  const ext = type === "png" ? "png" : "jpg";
  const id = newId();
  const filePath = path.join(SHOT_DIR, `${id}.${ext}`);
  
  const shotOptions = {
    path: filePath,
    type,
    ...(type === "jpeg" ? { quality: opts.quality || 70 } : {}),
  };
  
  if (opts.selector) {
    // screenshot elemen tertentu
    await page.waitForSelector(opts.selector, { timeout: opts.timeout || 10000 });
    const el = await page.$(opts.selector);
    if (!el) throw new Error(`Elemen "${opts.selector}" tidak ketemu`);
    await el.screenshot(shotOptions);
  } else {
    // screenshot halaman
    await page.screenshot({ ...shotOptions, fullPage: opts.fullPage !== false });
  }
  
  // jadwalkan hapus setelah 1 menit
  setTimeout(() => {
    fs.promises.unlink(filePath).catch(() => {});
  }, DELETE_AFTER_MS).unref();
  
  return { id, path: `/shots/${id}.${ext}` };
}

/** Resolve path file screenshot (buat route serving). */
function resolveShot(fileName) {
  const safe = path.basename(fileName); // cegah path traversal
  const filePath = path.join(SHOT_DIR, safe);
  return fs.existsSync(filePath) ? filePath : null;
}

module.exports = { takeScreenshot, resolveShot, DELETE_AFTER_MS };