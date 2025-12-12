const { Workspace } = require("../../models/workspace");
const { WorkspaceThread } = require("../../models/workspaceThread");
const { userFromSession, multiUserMode } = require("../http");

// Will pre-validate and set the workspace for a request if the slug is provided in the URL path.
async function validWorkspaceSlug(request, response, next) {
  console.log("🔥 [中间件] validWorkspaceSlug 开始");
  const { slug } = request.params;
  console.log("🔥 [中间件] workspace slug:", slug);
  
  const user = await userFromSession(request, response);
  console.log("🔥 [中间件] user:", user ? `ID: ${user.id}, role: ${user.role}` : "无用户");
  
  const isMultiUser = multiUserMode(response);
  console.log("🔥 [中间件] multiUserMode:", isMultiUser);
  
  let workspace;
  if (isMultiUser) {
    console.log("🔥 [中间件] 使用 getWithUser 查询");
    console.log("🔥 [中间件] 查询参数:", { user: user ? `ID: ${user.id}, role: ${user.role}` : "null", slug });
    workspace = await Workspace.getWithUser(user, { slug });
  } else {
    console.log("🔥 [中间件] 使用 get 查询");
    console.log("🔥 [中间件] 查询参数:", { slug });
    workspace = await Workspace.get({ slug });
  }

  console.log("🔥 [中间件] workspace查询结果:", workspace ? `找到工作空间 ${workspace.id}` : "未找到工作空间");
  
  // 如果多用户模式查询失败，尝试单用户模式查询作为对比
  if (isMultiUser && !workspace) {
    console.log("🔥 [中间件] 多用户查询失败，尝试单用户查询作为对比...");
    const fallbackWorkspace = await Workspace.get({ slug });
    console.log("🔥 [中间件] 单用户查询结果:", fallbackWorkspace ? `找到工作空间 ${fallbackWorkspace.id}` : "未找到工作空间");
  }

  if (!workspace) {
    console.log("🔥 [中间件] validWorkspaceSlug 失败: 工作空间不存在");
    response.status(404).send("Workspace does not exist.");
    return;
  }

  console.log("🔥 [中间件] validWorkspaceSlug 成功");
  response.locals.workspace = workspace;
  next();
}

// Will pre-validate and set the workspace AND a thread for a request if the slugs are provided in the URL path.
async function validWorkspaceAndThreadSlug(request, response, next) {
  const { slug, threadSlug } = request.params;
  const user = await userFromSession(request, response);
  const workspace = multiUserMode(response)
    ? await Workspace.getWithUser(user, { slug })
    : await Workspace.get({ slug });

  if (!workspace) {
    response.status(404).send("Workspace does not exist.");
    return;
  }

  const thread = await WorkspaceThread.get({
    slug: threadSlug,
    user_id: user?.id || null,
  });
  if (!thread) {
    response.status(404).send("Workspace thread does not exist.");
    return;
  }

  response.locals.workspace = workspace;
  response.locals.thread = thread;
  next();
}

module.exports = {
  validWorkspaceSlug,
  validWorkspaceAndThreadSlug,
};
