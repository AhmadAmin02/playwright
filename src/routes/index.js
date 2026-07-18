"use strict";

const express = require("express");
const apiKey = require("../middleware/apiKey");
const config = require("../config");

const healthRoute = require("./health.route");
const cekRoute = require("./cek.route");
const jsonRoute = require("./json.route");
const scrapeRoute = require("./scrape.route");
const realRoute = require("./real.route");
const imageRoute = require("./image.route"); // ← ganti video.route

const router = express.Router();

router.use("/health", healthRoute);
router.use("/cek", cekRoute);
router.use("/api/json", apiKey, jsonRoute);

if (config.browserEngine === "playwright") {
  router.use("/api/scrape", apiKey, scrapeRoute);
} else if (config.browserEngine === "real") {
  router.use("/api/real", apiKey, realRoute);
}

router.use("/shots", imageRoute); // ← publik, ganti /videos

console.log(`🧭 Browser engine aktif: ${config.browserEngine}`);

module.exports = router;