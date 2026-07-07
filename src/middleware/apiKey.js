"use strict";

const config = require("../config");

/** Proteksi sederhana: header `x-api-key` atau query `?apiKey=`. */
function apiKey(req, res, next) {
  // Kalau tidak ada API_KEYS di env, lewati (mode dev/open)
  if (config.apiKeys.length === 0) return next();

  const key = req.get("x-api-key") || req.query.apiKey;
  if (key && config.apiKeys.includes(key)) return next();

  return res.status(401).json({ error: "Unauthorized: API key tidak valid" });
}

module.exports = apiKey;