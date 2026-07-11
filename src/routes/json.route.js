"use strict";

const express = require("express");
const { getJson } = require("../lib/getJson");
const SIGI_MARKER = 'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"';

const router = express.Router();

// GET /api/json?url=https://...
router.get("/", async (req, res, next) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ success: false, error: "Query `username` wajib diisi" });
    const response = await fetch(`https://www.tiktok.com/@${username}`);
    const a = await response.text();
    const data = test(a);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

function test(html, dataOnly) {
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