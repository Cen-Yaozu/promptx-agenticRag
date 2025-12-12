const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
const { DocumentManager } = require("../DocumentManager");
const { getVectorDbClass, getLLMProvider } = require("../helpers");

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

  // 🔥 为Agent模式添加文档上下文支持
  let enhancedPrompt = message;
  try {
    console.log(`[Agent模式] 开始获取文档上下文...`);
    
    // 获取解析文件上下文
    const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
      workspace,
      thread || null,
      user || null
    );
    
    console.log(`[Agent模式] 获取到 ${parsedFiles.length} 个解析文件`);
    
    if (parsedFiles.length > 0) {
      // 构建文档上下文
      const contextTexts = parsedFiles.map(doc => doc.pageContent).filter(Boolean);
      
      if (contextTexts.length > 0) {
        const documentContext = contextTexts.join('\n\n---\n\n');
        enhancedPrompt = `基于以下文档内容回答用户问题：

=== 文档内容开始 ===
${documentContext}
=== 文档内容结束 ===

用户问题：${message}

请基于上述文档内容回答用户的问题。如果文档中没有相关信息，请明确说明。`;
        
        console.log(`[Agent模式] 已将 ${contextTexts.length} 个文档添加到Agent上下文中`);
        console.log(`[Agent模式] 增强后的提示词长度: ${enhancedPrompt.length} 字符`);
      }
    }
    
    // 获取置顶文档（如果有的话）
    const LLMConnector = getLLMProvider({
      provider: workspace?.chatProvider,
      model: workspace?.chatModel,
    });
    
    if (LLMConnector) {
      const pinnedDocs = await new DocumentManager({
        workspace,
        maxTokens: LLMConnector.promptWindowLimit(),
      }).pinnedDocs();
      
      if (pinnedDocs.length > 0) {
        console.log(`[Agent模式] 获取到 ${pinnedDocs.length} 个置顶文档`);
        const pinnedContext = pinnedDocs.map(doc => doc.pageContent).join('\n\n---\n\n');
        
        enhancedPrompt = `基于以下重要文档和其他文档内容回答用户问题：

=== 重要文档内容开始 ===
${pinnedContext}
=== 重要文档内容结束 ===

${enhancedPrompt}`;
        
        console.log(`[Agent模式] 已添加置顶文档到Agent上下文中`);
      }
    }
    
  } catch (error) {
    console.error(`[Agent模式] 获取文档上下文时出错:`, error.message);
    // 如果获取文档上下文失败，继续使用原始消息
  }

  const { invocation: newInvocation, message: errorMessage } = await WorkspaceAgentInvocation.new({
    prompt: enhancedPrompt, // 🔥 使用增强后的提示词
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
