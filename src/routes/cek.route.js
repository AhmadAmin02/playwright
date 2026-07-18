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
  const files = [
    "data1.json",
    "data2.json"
  ];
  
  const data = files.flatMap(file => {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, file), "utf8")
    );
  });
  res.json({ status: "ok", data });
});

const acc1 = JSON.parse(fs.readFileSync(path.join(__dirname, "../lib/accounts.json"), "utf8"));
login.main(1, "01/01/2006", "31/12/2008", acc1);
const acc2 = JSON.parse(fs.readFileSync(path.join(__dirname, "../lib/accounts.json"), "utf8"));
login.main(2, "01/01/2006", "31/12/2008", acc2);


module.exports = router;