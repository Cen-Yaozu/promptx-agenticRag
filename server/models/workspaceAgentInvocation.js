const prisma = require("../utils/prisma");
const { v4: uuidv4 } = require("uuid");

const WorkspaceAgentInvocation = {
  // 🔥 移除了 parseAgents 函数
  // 现在不再需要从消息中解析 @agent 前缀
  // Agent 模式将由前端直接控制

  close: async function (uuid) {
    if (!uuid) return;
    try {
      await prisma.workspace_agent_invocations.update({
        where: { uuid: String(uuid) },
        data: { closed: true },
      });
    } catch {}
  },

  new: async function ({ prompt, workspace, user = null, thread = null }) {
    console.log(`[WorkspaceAgentInvocation.new] 开始创建...`);
    console.log(`[WorkspaceAgentInvocation.new] workspace:`, workspace ? { id: workspace.id } : 'null');
    console.log(`[WorkspaceAgentInvocation.new] user_id: ${user?.id}`);
    console.log(`[WorkspaceAgentInvocation.new] thread_id: ${thread?.id}`);
    console.log(`[WorkspaceAgentInvocation.new] prompt: "${prompt}"`);

    // 🔥 添加workspace参数验证
    if (!workspace) {
      const errorMessage = 'Workspace parameter is required but was null';
      console.error(`[WorkspaceAgentInvocation.new] ❌ ${errorMessage}`);
      return { invocation: null, message: errorMessage };
    }

    if (!workspace.id) {
      const errorMessage = 'Workspace.id is required but was null or undefined';
      console.error(`[WorkspaceAgentInvocation.new] ❌ ${errorMessage}`);
      return { invocation: null, message: errorMessage };
    }

    try {
      const invocation = await prisma.workspace_agent_invocations.create({
        data: {
          uuid: uuidv4(),
          workspace_id: workspace.id,
          prompt: String(prompt),
          user_id: user?.id,
          thread_id: thread?.id,
        },
      });

      console.log(`[WorkspaceAgentInvocation.new] ✅ 创建成功，uuid: ${invocation.uuid}`);
      return { invocation, message: null };
    } catch (error) {
      console.error(`[WorkspaceAgentInvocation.new] ❌ 创建失败:`, error.message);
      console.error(`[WorkspaceAgentInvocation.new] 错误详情:`, error);
      return { invocation: null, message: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const invocation = await prisma.workspace_agent_invocations.findFirst({
        where: clause,
      });

      return invocation || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  getWithWorkspace: async function (clause = {}) {
    try {
      const invocation = await prisma.workspace_agent_invocations.findFirst({
        where: clause,
        include: {
          workspace: true,
        },
      });

      return invocation || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.workspace_agent_invocations.delete({
        where: clause,
      });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  where: async function (clause = {}, limit = null, orderBy = null) {
    try {
      const results = await prisma.workspace_agent_invocations.findMany({
        where: clause,
        ...(limit !== null ? { take: limit } : {}),
        ...(orderBy !== null ? { orderBy } : {}),
      });
      return results;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },
};

module.exports = { WorkspaceAgentInvocation };
