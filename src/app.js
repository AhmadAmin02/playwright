"use strict";

const express = require("express");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json());
app.disable("x-powered-by");

// Root info
app.get("/", (req, res) => {
  res.json({
    name: "scraper-api",
    endpoints: ["/cek", "/health", "/api/json?url=", "/api/scrape?url=&json=1"],
  });
});

app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;