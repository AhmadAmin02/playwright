"use strict";

const express = require("express");
const login = require("../lib/login");
const fs = require("fs");
const path = require("path");
const router = express.Router();

router.get("/", (req, res) => {
  const data = login.jobs;
  res.json({ status: "ok", data });
});

router.get("/data", (req, res) => {
  const dir = path.join(__dirname, "../lib");
  
  const data = Array.from({ length: 20 }, (_, i) => `data${i + 1}.json`)
    .flatMap(file => {
      const filePath = path.join(dir, file);
      
      if (!fs.existsSync(filePath)) return [];
      
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    });
  res.json({ status: "ok", data });
});

for (let i = 1; i <= 5; i++) {
  const file = i === 1 ? "accounts.json" : `acc${i}.json`;
  
  const acc = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../lib", file), "utf8")
  );
  
  login.main(i, "01/01/2006", "31/12/2008", acc);
}


module.exports = router;