"use strict";

const config = require("../config");

/** Proteksi sederhana: header `x-api-key`, query `apiKey`/`apikey`/`api_key`. */
function apiKey(req, res, next) {
  if (config.apiKeys.length === 0) return next();
  
  const key =
    req.get("x-api-key") ||
    req.query.apiKey ||
    req.query.apikey ||
    req.query.api_key;
  
  if (key && config.apiKeys.includes(key)) return next();
  
  return res.status(401).json({ error: "Unauthorized: API key tidak valid" });
}

module.exports = apiKey;