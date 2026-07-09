"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const { takeScreenshot } = require("../lib/screenshot");
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "tmp");

const router = express.Router();

// GET /api/real?url=https://...
router.get("/", async (req, res, next) => {
  const query = {
    email: req.query.email || "",
    link: req.query.link || "",
    step: 1
  };
  if (isValidEmail(query.email)) {
    return res.status(400).json({ success: false, error: "Email tolong diisi." });
  }
  const file = path.join(dir, `${query.email}.json`);
  if (!fs.existsSync(file)) {
    wdata(file, query.step);
  } else {
    const data = rdata(file);
    query.step = data.step;
  }
  let page;
  try {
    const { browser } = await getRealBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const link = `https://amprem.irfanjawa.com/auth`;
    page.on("console", msg => console.log(msg.text()));
    
    page.on("response", res => {
      if (res.url().includes("challenge")) {
        console.log(res.status(), res.url());
      }
    });
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    /*while (!page.url().includes("dashboard")) {
      await new Promise(r => setTimeout(r, 500));
    }*/
    /*await page.waitForFunction(() => {
      const el = document.querySelector(
        "body > main > nav > div > div:nth-child(2) > a.btn-primary.text-sm"
      );
      
      return el;
    }, { timeout: 60000 });*/
    
    await new Promise(resolve => setTimeout(resolve, 10000)); // 1 detik
    const { path: shotPath2 } = await takeScreenshot(page);
    const screenshot2 = `${req.protocol}://${req.get("host")}${shotPath2}`;
    console.log(screenshot2);
    if (!page.url().includes("dashboard")) {
      await page.evaluate(() => {
        const setValue = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          ).set;
          setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        
        setValue(document.querySelector('input[type="email"]'), "sapudinasiktau@gmail.com");
        setValue(document.querySelector('input[type="password"]'), "asikbanget");
        
        document.querySelector('button[type="submit"]').click();
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    const result = await page.evaluate(async (query) => {
      if (query.step === 1) {
        const res = await fetch("https://amprem.irfanjawa.com/api/auth/send-magic-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            email: query.email
          })
        });
        const d = await res.json();
        if (!d.success) return d.message;
        return d.success;
      } else if (query.step === 2) {
        const res2 = await fetch("https://amprem.irfanjawa.com/api/auth/verify-magic-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            email: query.email,
            magicLink: query.link
          })
        });
        const d2 = await res.json();
        if (!d2.success) return d2.message;
        return d2;
      }
    }, query);
    
    
    /*const { path: shotPath } = await takeScreenshot(page);
    const screenshot = `${req.protocol}://${req.get("host")}${shotPath}`;*/
    
    res.json({
      result
    });
    if (query.step === 1) wdata(file, 2);
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close();
  }
});

function isValidEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

function wdata(file, step = 1) {
  fs.writeFileSync(file, JSON.stringify({
    step
  }));
}

function rdata(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = router;