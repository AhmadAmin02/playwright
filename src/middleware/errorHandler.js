"use strict";

const config = require("../config");

// 404
function notFound(req, res, next) {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
}

// Error handler global
function errorHandler(err, req, res, next) {
  console.error("[ERROR]", err.message);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal Server Error",
    ...(config.nodeEnv !== "production" && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };