"use strict";

const express = require("express");
const apiKey = require("../middleware/apiKey");

const healthRoute = require("./health.route");
const jsonRoute = require("./json.route");
const scrapeRoute = require("./scrape.route");

const router = express.Router();

// Healthcheck (tanpa API key — buat Railway)
router.use("/health", healthRoute);

// Endpoint utama (diproteksi API key)
router.use("/api/json", apiKey, jsonRoute);
router.use("/api/scrape", apiKey, scrapeRoute);

module.exports = router;