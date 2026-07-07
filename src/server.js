"use strict";

const app = require("./app");
const config = require("./config");
const { closeBrowser } = require("./lib/browser");

const server = app.listen(config.port, () => {
  console.log(`🚀 scraper-api listening on :${config.port}`);
});

// Graceful shutdown — tutup browser biar nggak leak
async function shutdown(signal) {
  console.log(`\n${signal} diterima, menutup...`);
  server.close(async () => {
    await closeBrowser();
    process.exit(0);
  });
}

["SIGTERM", "SIGINT"].forEach((sig) =>
  process.on(sig, () => shutdown(sig))
);