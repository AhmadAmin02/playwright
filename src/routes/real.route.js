"use strict";

const express = require("express");
const { getRealBrowser } = require("../lib/realBrowser");
const { takeScreenshot } = require("../lib/screenshot");
const fs = require("fs");
const path = require("path");
const SIGI_MARKER = 'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"';

const dir = path.join(process.cwd(), "tmp");
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const router = express.Router();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

router.get("/", async (req, res, next) => {
  const { users } = req.query;
  if (!users) return res.status(400).json({ error: "Query `users` wajib diisi" }); 
  let page;
  
  try {
    const { browser } = await getRealBrowser()
    
    page = await browser.newPage();
    
    await page.setViewport({
      width: 1280,
      height: 800,
    });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    );
    
    page.on("console", msg => {
      console.log("[Console]", msg.text());
    });
    
    page.on("response", response => {
      console.log(response.status(), response.url());
    });
    
    await page.goto(`https://www.tiktok.com/@${users}`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });
    
    // Tunggu kalau ada challenge
    await page.waitForSelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__", {
      timeout: 120000,
    });
    
    // Screenshot (pakai fungsi kamu)
    /*const { path: shotPath } = await takeScreenshot(page);
    const screenshot = `${req.protocol}://${req.get("host")}${shotPath}`;*/
    
    // Simpan HTML
    const html = await page.content();
    
    // Ambil cookie
    const cookies = await page.cookies();
    const cookieHeader = cookies
      .map(c => `${c.name}=${c.value}`)
      .join("; ");
    const data = extractSigiJson(html, false);
    
    res.json({
      cookieHeader,
      success: true,
      data
    });
    
  } catch (err) {
    next(err);
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

function extractSigiJson(html, dataOnly) {
  const markerPos = html.indexOf(SIGI_MARKER);
  if (markerPos === -1) return "SIGI script tag not found in HTML";
  
  const gtPos = html.indexOf(">", markerPos);
  if (gtPos === -1) return "no > after SIGI marker";
  
  const jsonStart = gtPos + 1;
  const scriptEnd = html.indexOf("</script>", jsonStart);
  if (scriptEnd === -1) return "no </script> after SIGI JSON";
  
  const jsonStr = html.slice(jsonStart, scriptEnd);
  if (!jsonStr) return "empty SIGI JSON blob";
  
  if (dataOnly) return jsonStr;
  
  const blob = JSON.parse(jsonStr);
  
  const scope = blob["__DEFAULT_SCOPE__"];
  const userDetail = scope?.["webapp.user-detail"];
  
  if (!userDetail) {
    console.log("missing __DEFAULT_SCOPE__/webapp.user-detail");
    return null;
  }
  
  const statusCode = userDetail.statusCode ?? 0;
  
  if (statusCode !== 0) {
    if (statusCode === 10222) {
      console.log("Profile Private");
      return null;
    }
    
    if (statusCode === 10221 || statusCode === 10223) {
      console.log("Profile Not Found");
      return null;
    }
    
    console.log("Profile Error:", statusCode);
    return null;
  }
  
  const userInfo = userDetail.userInfo;
  
  if (!userInfo) {
    console.log("missing userInfo");
    return null;
  }
  
  const user = userInfo.user || {};
  const stats = userInfo.statsV2 || {};
  
  const bioLinkObj = user.bioLink;
  let bioLink = null;
  
  if (bioLinkObj && typeof bioLinkObj === "object") {
    if (bioLinkObj.link) {
      bioLink = bioLinkObj.link;
    }
  }
  
  return {
    userId: String(user.id ?? ""),
    uniqueId: String(user.uniqueId ?? ""),
    nickname: String(user.nickname ?? ""),
    bio: String(user.signature ?? ""),
    avatarThumb: String(user.avatarThumb ?? ""),
    avatarMedium: String(user.avatarMedium ?? ""),
    avatarLarge: String(user.avatarLarger ?? ""),
    verified: Boolean(user.verified),
    privateAccount: Boolean(user.privateAccount),
    isOrganization: Number(user.isOrganization ?? 0) !== 0,
    roomId: String(user.roomId ?? ""),
    bioLink,
    followerCount: Number(stats.followerCount ?? 0),
    followingCount: Number(stats.followingCount ?? 0),
    heartCount: Number(stats.heartCount ?? 0),
    videoCount: Number(stats.videoCount ?? 0),
    friendCount: Number(stats.friendCount ?? 0),
  };
}

module.exports = router;