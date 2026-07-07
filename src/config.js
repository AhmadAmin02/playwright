"use strict";

/**
 * Config langsung di JS (tanpa .env).
 * Railway tetap bisa override PORT lewat process.env.PORT (wajib untuk deploy).
 */
const config = {
  // Railway inject PORT otomatis — tetap dibaca kalau ada, fallback 3000.
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  
  // Timeout default per request (ms)
  requestTimeout: 30000,
  
  // API key buat proteksi endpoint. Tambah/kurangi sesuka hati.
  // Kosongkan array (=[]) kalau mau endpoint terbuka tanpa proteksi.
  apiKeys: ["devkey123"],
  
  // Mode: "production" atau "development"
  nodeEnv: "production",
};

module.exports = config;