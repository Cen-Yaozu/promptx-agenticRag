const { Telemetry } = require("../models/telemetry");
const {
  WorkspaceAgentInvocation,
} = require("../models/workspaceAgentInvocation");
const { AgentHandler } = require("../utils/agents");
const {
  WEBSOCKET_BAIL_COMMANDS,
} = require("../utils/agents/aibitat/plugins/websocket");
const { safeJsonParse } = require("../utils/http");

// Setup listener for incoming messages to relay to socket so it can be handled by agent plugin.
function relayToSocket(message) {
  if (this.handleFeedback) return this?.handleFeedback?.(message);
  this.checkBailCommand(message);
}

function agentWebsocket(app) {
  if (!app) return;

  app.ws("/agent-invocation/:uuid", async function (socket, request) {
    const uuid = String(request.params.uuid);
    console.log(`[WebSocket] Agent连接请求: ${uuid}`);

    try {
      console.log(`[WebSocket] 创建AgentHandler...`);
      const agentHandler = await new AgentHandler({
        uuid: uuid,
      }).init();

      console.log(`[WebSocket] AgentHandler创建完成`);
      if (!agentHandler.invocation) {
        console.log(`[WebSocket] AgentHandler.invocation为空，关闭连接`);
        socket.close();
        return;
      }

      console.log(`[WebSocket] 设置事件监听器...`);

      socket.on("message", relayToSocket);
      socket.on("close", () => {
        agentHandler.closeAlert();
        WorkspaceAgentInvocation.close(String(request.params.uuid));
        return;
      });

      socket.checkBailCommand = (data) => {
        const content = safeJsonParse(data)?.feedback;
        if (WEBSOCKET_BAIL_COMMANDS.includes(content)) {
          agentHandler.log(
            `User invoked bail command while processing. Closing session now.`
          );
          agentHandler.aibitat.abort();
          socket.close();
          return;
        }
      };

      await Telemetry.sendTelemetry("agent_chat_started");
      console.log(`[WebSocket] 启动Telemetry完成`);

      await agentHandler.createAIbitat({ socket });
      console.log(`[WebSocket] AIbitat创建完成`);

      await agentHandler.startAgentCluster();
      console.log(`[WebSocket] Agent集群启动完成`);
    } catch (e) {
      console.error(`[WebSocket] AgentHandler初始化失败:`, e.message);
      console.error(`[WebSocket] 错误详情:`, e);
      socket?.send(JSON.stringify({ type: "wssFailure", content: e.message }));
      socket?.close();
    }
  });
}

module.exports = { agentWebsocket };
