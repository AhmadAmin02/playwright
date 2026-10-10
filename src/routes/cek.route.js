"use strict";

const express = require("express");
const login = require("../lib/login");
const fs = require("fs");
const path = require("path");
const router = express.Router();

router.get("/", (req, res) => {
  const data = login.jobs;
  const allData = Object.values(data).map(item => item.statusData);
  const total = Object.values(data).reduce((sum, item) => sum + item.count, 0);
  res.json({ status: "ok", total, data: allData });
});

router.get("/error", (req, res) => {
  const filePath = path.join(__dirname, "../lib", "axios-error.json");
  
  if (!fs.existsSync(filePath)) {
    return res.json({
      status: "ok",
      data: []
    });
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json({ status: "ok", data });
  } catch (err) {
    res.json({
      status: "ok",
      data: []
    });
  }
});

router.get("/data", (req, res) => {
  const dir = path.join(__dirname, "../lib");
  
  const data = Array.from({ length: 20 }, (_, i) => `data${i + 1}.json`)
    .flatMap(file => {
      const filePath = path.join(dir, file);
      
      if (!fs.existsSync(filePath)) return [];
      
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    });
  res.json({ status: "ok", data, total: data.length });
});

function generateSequence(prefix) {
  const result = [];
  
  // Looping dari 1 sampai 9999
  for (let i = 1; i <= 9999; i++) {
    // Mengubah angka menjadi string dan menambahkan '0' di depan hingga panjangnya 4 karakter
    const suffix = String(i).padStart(4, '0');
    result.push({
      id: `${prefix}${suffix}`,
      nama: `Nama ${suffix}`
    });
  }
  
  return result;
}

function dapatkanHalaman(array, page, limit) {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  return array.slice(startIndex, endIndex);
}

/*for (let i = 1; i <= 5; i++) {
  const file = i === 1 ? "accounts.json" : `acc${i}.json`;
  
  const acc = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../lib", file), "utf8")
  );
  
  }
  */
const id = generateSequence("2506");
login.main(1, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 1, 200));
login.main(2, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 2, 200));
login.main(3, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 3, 200));
login.main(4, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 4, 200));
login.main(5, "01/01/2006", "31/12/2008", dapatkanHalaman(id, 5, 200));

module.exports = router;