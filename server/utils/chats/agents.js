const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { writeResponseChunk } = require("../helpers/chat/responses");

/**
 * 🔥 向后兼容的 grepAgents 函数（已弃用）
 * 现在不再使用，但保留以防其他地方还在引用
 */
async function grepAgents() {
  console.log(`[Agent检测] grepAgents函数已被弃用，请使用triggerAgentMode`);
  return false;
}

/**
 * 🔥 新的 Agent 触发函数
 * 不再基于消息内容检测，而是直接基于前端传递的 Agent 模式参数
 */
async function triggerAgentMode({
  uuid,
  response,
  message,
  workspace,
  user = null,
  thread = null,
}) {
  console.log(`[Agent模式] 开始创建WorkspaceAgentInvocation...`);
  console.log(`[Agent模式] workspace:`, workspace ? { id: workspace.id, name: workspace.name } : 'null');
  console.log(`[Agent模式] user:`, user ? { id: user.id } : 'null');
  console.log(`[Agent模式] thread:`, thread ? { id: thread.id } : 'null');
  console.log(`[Agent模式] message: "${message.substring(0, 50)}..."`);

  const { invocation: newInvocation, message: errorMessage } = await WorkspaceAgentInvocation.new({
    prompt: message,
    workspace: workspace,
    user: user,
    thread: thread,
  });

  console.log(`[Agent模式] WorkspaceAgentInvocation.new() 完成`);
  console.log(`[Agent模式] newInvocation:`, newInvocation ? { uuid: newInvocation.uuid } : 'null');
  console.log(`[Agent模式] errorMessage:`, errorMessage);

  if (!newInvocation) {
    console.log(`[Agent模式] ❌ 创建invocation失败，发送错误响应`);
    writeResponseChunk(response, {
      uuid: uuid,
      type: "statusResponse",
      textResponse: `Agent模式启动失败。Chat will be handled as default chat.${errorMessage ? ` Error: ${errorMessage}` : ''}`,
      sources: [],
      close: true,
      animate: false,
      error: errorMessage || null,
    });
    return;
  }

  console.log(`[Agent模式] ✅ 准备发送agentInitWebsocketConnection响应`);
  console.log(`[Agent模式] websocketUUID: ${newInvocation.uuid}`);

  writeResponseChunk(response, {
    uuid: uuid,
    type: "agentInitWebsocketConnection",
    textResponse: null,
    sources: [],
    close: false,
    error: null,
    websocketUUID: newInvocation.uuid,
  });

  // Close HTTP stream-able chunk response method because we will swap to agents now.
  writeResponseChunk(response, {
    uuid: uuid,
    type: "statusResponse",
    textResponse: `Agent模式已启动。\n正在连接到Agent聊天系统...`,
    sources: [],
    close: true,
    error: null,
    animate: true,
  });
  return true;
}

module.exports = {
  grepAgents, // 保持向后兼容，但不再使用
  triggerAgentMode // 🔥 新的Agent触发函数
};
