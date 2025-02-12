module.exports = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || "development",
  wsUrl: process.env.WS_URL || "ws://localhost:8080",
};
