# scraper-api

REST API scraper dengan dua jalur:
- **`/api/json`** — pakai `got` (HTTP/2 + header browser-like). Ringan, untuk endpoint JSON.
- **`/api/scrape`** — pakai Playwright (Chromium). Untuk halaman yang butuh render JS / anti-bot.

## Jalankan lokal
