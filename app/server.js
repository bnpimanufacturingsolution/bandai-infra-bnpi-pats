const express = require("express");

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const environment = process.env.ENVIRONMENT || "LOCAL";
const version = process.env.APP_VERSION || "dev";
const serviceName = process.env.SERVICE_NAME || "project-truth";

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment,
    version,
    service: serviceName,
    hostname: require("os").hostname(),
    pid: process.pid
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Node health appliance is running",
    environment,
    version,
    service: serviceName,
    health: "/health"
  });
});

app.listen(port, host, () => {
  console.log(`node-health listening on http://${host}:${port}`);
});
