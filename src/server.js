"use strict";

const app = require("./app");
const config = require("./config");
const { closeBrowser } = require("./lib/browser");
const { closeRealBrowser } = require("./lib/realBrowser");

const server = app.listen(config.port, () => {
  console.log(`🚀 scraper-api listening on :${config.port}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} diterima, menutup...`);
  server.close(async () => {
    const tasks = [];
    if (config.browserEngine === "playwright") tasks.push(closeBrowser());
    if (config.browserEngine === "real") tasks.push(closeRealBrowser());
    await Promise.allSettled(tasks);
    process.exit(0);
  });
}

["SIGTERM", "SIGINT"].forEach((sig) => process.on(sig, () => shutdown(sig)));