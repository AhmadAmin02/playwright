"use strict";

/**
 * Config langsung di JS (tanpa .env).
 */
const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  requestTimeout: 30000,
  apiKeys: ["devkey123"],
  nodeEnv: "production",
  
  /**
   * Pilih engine browser yang AKTIF:
   *   "playwright" → hanya /api/scrape
   *   "real"       → hanya /api/real (puppeteer-real-browser)
   *   "none"       → matikan semua browser (cuma /api/json yang jalan, paling hemat RAM)
   *
   * Catatan: /api/json (got) SELALU aktif karena ringan & tanpa browser.
   */
  browserEngine: "real", // ← ganti sesuai kebutuhan: "playwright" | "real" | "none"
};

module.exports = config;