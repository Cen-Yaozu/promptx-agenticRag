const deeconfigRouter = require("./deeconfig/routes");

function deeconfigEndpoints(apiRouter) {
  // LLM配置管理API路由
  // 前缀：/api/deeconfig
  apiRouter.use("/deeconfig", deeconfigRouter);
}

module.exports = { deeconfigEndpoints };