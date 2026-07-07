"use strict";

const express = require("express");
const apiKey = require("../middleware/apiKey");
const config = require("../config");

const healthRoute = require("./health.route");
const jsonRoute = require("./json.route");
const scrapeRoute = require("./scrape.route");
const realRoute = require("./real.route");

const router = express.Router();

router.use("/health", healthRoute);

// Jalur ringan — selalu aktif
router.use("/api/json", apiKey, jsonRoute);

// Jalur browser — hanya yang dipilih di config.browserEngine
if (config.browserEngine === "playwright") {
  router.use("/api/scrape", apiKey, scrapeRoute);
} else if (config.browserEngine === "real") {
  router.use("/api/real", apiKey, realRoute);
}

console.log(`🧭 Browser engine aktif: ${config.browserEngine}`);

module.exports = router;