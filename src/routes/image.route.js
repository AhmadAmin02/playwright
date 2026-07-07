"use strict";

const express = require("express");
const { resolveShot } = require("../lib/screenshot");

const router = express.Router();

// GET /shots/<id>.jpg  → tampilkan gambar (tanpa API key biar URL gampang dibuka)
router.get("/:file", (req, res) => {
  const filePath = resolveShot(req.params.file);
  if (!filePath) {
    return res
      .status(404)
      .json({ error: "Screenshot tidak ada atau sudah dihapus (kadaluarsa 1 menit)" });
  }
  const ext = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
  res.type(ext);
  res.sendFile(filePath);
});

module.exports = router;