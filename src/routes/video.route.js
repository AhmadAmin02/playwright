"use strict";

const express = require("express");
const { resolveVideo } = require("../lib/recorder");

const router = express.Router();

// GET /videos/<id>.mp4  → stream video (tanpa API key biar URL gampang dibuka)
router.get("/:file", (req, res) => {
  const filePath = resolveVideo(req.params.file);
  if (!filePath) {
    return res
      .status(404)
      .json({ error: "Video tidak ada atau sudah dihapus (kadaluarsa 1 menit)" });
  }
  res.type("video/mp4");
  res.sendFile(filePath);
});

module.exports = router;