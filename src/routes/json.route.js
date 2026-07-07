"use strict";

const express = require("express");
const { getJson } = require("../lib/getJson");

const router = express.Router();

// GET /api/json?url=https://...
router.get("/", async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Query `url` wajib diisi" });
    
    const result = await getJson(url);
    res.status(result.ok ? 200 : result.status || 502).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;