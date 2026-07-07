"use strict";

const got = require("got");
const config = require("../config");

/**
 * GET JSON dengan header browser-like + HTTP/2 + retry.
 * Untuk endpoint yang mengembalikan JSON tanpa perlu render JS.
 */
async function getJson(url, options = {}) {
  const { timeout = config.requestTimeout, headers = {}, searchParams } = options;

  const origin = new URL(url).origin;

  const defaultHeaders = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    DNT: "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    Referer: origin + "/",
    Origin: origin,
  };

  const res = await got(url, {
    http2: true,
    searchParams,
    headers: { ...defaultHeaders, ...headers },
    timeout: { request: timeout },
    followRedirect: true,
    retry: {
      limit: 2,
      methods: ["GET"],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
    throwHttpErrors: false,
    decompress: true,
  });

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    data = { raw: res.body };
  }

  return {
    ok: res.statusCode >= 200 && res.statusCode < 400,
    status: res.statusCode,
    url: res.url,
    data,
  };
}

module.exports = { getJson };