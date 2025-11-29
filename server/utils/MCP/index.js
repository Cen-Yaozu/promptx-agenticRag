const MCPHypervisor = require("./hypervisor");
const WorkspaceRoleAuth = require("../workspaceRoleAuth");

class MCPCompatibilityLayer extends MCPHypervisor {
  static _instance;

  constructor() {
    super();
    if (MCPCompatibilityLayer._instance) return MCPCompatibilityLayer._instance;
    MCPCompatibilityLayer._instance = this;
  }

  /**
   * Get all of the active MCP servers as plugins we can load into agents.
   * This will also boot all MCP servers if they have not been started yet.
   * @returns {Promise<string[]>} Array of flow names in @@mcp_{name} format
   */
  async activeMCPServers() {
    await this.bootMCPServers();
    return Object.keys(this.mcps).flatMap((name) => `@@mcp_${name}`);
  }

  /**
   * Convert an MCP server name to an AnythingLLM Agent plugin
   * @param {string} name - The base name of the MCP server to convert - not the tool name. eg: `docker-mcp` not `docker-mcp:list-containers`
   * @param {Object} aibitat - The aibitat object to pass to the plugin
   * @returns {Promise<{name: string, description: string, plugin: Function}[]|null>} Array of plugin configurations or null if not found
   */
  async convertServerToolsToPlugins(name, _aibitat = null) {
    const mcp = this.mcps[name];
    if (!mcp) return null;

    const tools = (await mcp.listTools()).tools;
    if (!tools.length) return null;

    // 获取工作区授权的角色列表（如果可能的话）
    let authorizedRoles = [];
    if (_aibitat?.handlerProps?.invocation?.workspace_id) {
      const workspaceId = _aibitat.handlerProps.invocation.workspace_id;
      try {
        const roleAuth = new WorkspaceRoleAuth();
        // 获取所有角色，不过滤系统工具
        const roles = await roleAuth.getAuthorizedRoles(workspaceId);
        authorizedRoles = roles;
      } catch (error) {
        console.warn('Failed to get authorized roles, allowing all tools:', error.message);
        // 如果获取授权角色失败，允许所有工具
      }
    }

    const plugins = [];
    for (const tool of tools) {
      // 检查工具是否被授权
      // 对于PromptX服务器，工具名就是角色ID
      if (name === 'promptx' && authorizedRoles.length > 0) {
        // 系统工具和认知工具始终允许
        const systemAndCognitiveTools = [
          'discover',    // 发现工具
          'project',     // 项目工具
          'toolx',       // ToolX工具
          'action',      // 激活工具（认知工具）
          'recall',      // 回忆工具（认知工具）
          'remember'     // 记忆工具（认知工具）
        ];
        if (!systemAndCognitiveTools.includes(tool.name) && !authorizedRoles.includes(tool.name)) {
          // 跳过未授权的工具，这样它就不会出现在discover响应中
          console.log(`Filtering out unauthorized tool: ${tool.name}`);
          continue;
        }
      }
      plugins.push({
        name: `${name}-${tool.name}`,
        description: tool.description,
        plugin: function () {
          return {
            name: `${name}-${tool.name}`,
            setup: (aibitat) => {
              console.log(`[MCP插件注册] ${name}-${tool.name} - aibitat.handlerProps:`,
                aibitat.handlerProps ? {
                  hasInvocation: !!aibitat.handlerProps.invocation,
                  workspaceId: aibitat.handlerProps.invocation?.workspace_id,
                  workspace: aibitat.handlerProps.invocation?.workspace ? { id: aibitat.handlerProps.invocation.workspace.id } : null
                } : 'null');

              aibitat.function({
                super: aibitat,
                name: `${name}-${tool.name}`,
                controller: new AbortController(),
                description: tool.description,
                examples: [],
                parameters: {
                  $schema: "http://json-schema.org/draft-07/schema#",
                  ...tool.inputSchema,
                },
                handler: async function (args = {}) {
                  try {
                    console.log(`[MCP工具执行] ${name}:${tool.name} - 开始权限检查`);
                    console.log(`[MCP工具执行] aibitat.handlerProps:`, aibitat.handlerProps ? {
                      hasInvocation: !!aibitat.handlerProps.invocation,
                      workspaceId: aibitat.handlerProps.invocation?.workspace_id,
                      workspace: aibitat.handlerProps.invocation?.workspace ? { id: aibitat.handlerProps.invocation.workspace.id } : null
                    } : 'null');

                    // 工作区权限检查
                    const workspaceId = aibitat.handlerProps?.invocation?.workspace_id;
                    console.log(`[MCP工具执行] 提取的workspaceId:`, workspaceId);

                    if (workspaceId) {
                      // 对于promptx-action工具，需要检查参数中的角色名
                      let roleToCheck = tool.name;
                      let shouldCheckAuthorization = true;

                      if (name === 'promptx' && tool.name === 'action' && args.role) {
                        roleToCheck = args.role;
                      } else if (name === 'promptx' && tool.name === 'discover') {
                        // discover工具允许执行，但需要过滤结果
                        shouldCheckAuthorization = false;
                        console.log(`[MCP工具执行] discover工具允许执行，将过滤结果`);
                      }

                      let isAuthorized = true; // 默认允许执行

                      if (shouldCheckAuthorization) {
                        const roleAuth = new WorkspaceRoleAuth();
                        isAuthorized = await roleAuth.isRoleAuthorized(
                          workspaceId,
                          roleToCheck
                        );
                      }

                      console.log(`[MCP工具执行] 角色"${roleToCheck}"在工作区${workspaceId}的授权结果:`, isAuthorized);

                      if (!isAuthorized) {
                        // 获取角色自定义名称（如果有的话）
                        let roleDisplayName = roleToCheck;
                        if (name === 'promptx') {
                          // 这里可以查询数据库获取自定义名称，暂时使用原始名称
                          roleDisplayName = roleToCheck;
                        }

                        const errorMsg = `⚠️ 权限限制：角色 "${roleDisplayName}" 在当前工作区中未被管理员启用。请联系工作区管理员启用此角色。`;

                        console.log(`[MCP工具执行] 权限检查失败，返回错误信息:`, errorMsg);

                        // 记录调试日志
                        if (aibitat.handlerProps?.log) {
                          aibitat.handlerProps.log(
                            `MCP Authorization Failed: Role "${roleToCheck}" not authorized in workspace ${workspaceId}`,
                            {
                              workspaceId,
                              toolName: tool.name,
                              serverName: name,
                              roleToCheck,
                              reason: 'Role not enabled by workspace administrator'
                            }
                          );
                        }

                        if (aibitat.introspect) {
                          aibitat.introspect(
                            `User attempted to use unauthorized role: ${roleToCheck} in workspace ${workspaceId}`
                          );
                        }

                        // 抛出错误以中断工具执行，这样AI会收到错误信息
                        throw new Error(errorMsg);
                      }
                    } else {
                      console.log(`[MCP工具执行] 警告: 无法获取workspaceId，跳过权限检查`);
                    }

                    aibitat.handlerProps.log(
                      `Executing MCP server: ${name}:${tool.name} with args:`,
                      args
                    );
                    aibitat.introspect(
                      `Executing MCP server: ${name} with ${JSON.stringify(args, null, 2)}`
                    );
                    const result = await mcp.callTool({
                      name: tool.name,
                      arguments: args,
                    });

                    // 对于discover工具，需要根据工作区权限过滤结果
                    let filteredResult = result;
                    if (name === 'promptx' && tool.name === 'discover' && workspaceId) {
                      try {
                        console.log(`[MCP工具执行] 开始过滤discover结果`);
                        const roleAuth = new WorkspaceRoleAuth();
                        const authorizedRoles = await roleAuth.getAuthorizedRoles(workspaceId);

                        // 解析discover结果并过滤角色
                        console.log(`[MCP工具执行] 开始处理discover结果`);

                        if (result && typeof result === 'object') {
                          console.log(`[MCP工具执行] 结果对象属性:`, Object.keys(result));

                          // 尝试从不同字段获取内容 - 处理数组格式
                          let resultText = '';
                          if (Array.isArray(result.content)) {
                            // 如果content是数组，取第一个元素的text
                            resultText = result.content[0]?.text || '';
                          } else if (result.content) {
                            resultText = result.content.text || result.content;
                          } else {
                            resultText = result.text || result.result || result.data || String(result);
                          }

                          console.log(`[MCP工具执行] 提取到的结果文本长度:`, resultText.length);
                          console.log(`[MCP工具执行] 授权角色列表 (${authorizedRoles.length}个):`, authorizedRoles);

                          if (typeof resultText === 'string') {
                            let filteredText = resultText;

                            // 获取所有系统工具和认知工具（始终允许的）
                            const alwaysAllowedTools = [
                              'discover', 'project', 'toolx', 'action', 'recall', 'remember'
                            ];

                            // 如果有授权角色列表，进行过滤
                            if (authorizedRoles.length > 0) {
                              console.log(`[MCP工具执行] 开始过滤discover结果，原始文本长度:`, resultText.length);

                              // 按行分割结果文本
                              const lines = resultText.split('\n');
                              console.log(`[MCP工具执行] 原始行数:`, lines.length);

                              const filteredLines = [];

                              for (let i = 0; i < lines.length; i++) {
                                const line = lines[i];
                                let shouldInclude = true;

                                // 检查是否包含角色标识（匹配 \`roleName\` 格式）
                                const roleMatches = line.match(/`([^`]+)`/g);

                                console.log(`[MCP工具执行] 第${i+1}行: "${line.substring(0, 80)}${line.length > 80 ? '...' : ''}"`);
                                if (roleMatches) {
                                  console.log(`[MCP工具执行] 发现角色匹配:`, roleMatches);

                                  // 检查每个角色是否被授权
                                  shouldInclude = roleMatches.some(roleMatch => {
                                    // 移除反引号获取角色名
                                    const roleName = roleMatch.replace(/`/g, '').trim();

                                    const isAuthorized = alwaysAllowedTools.includes(roleName) || authorizedRoles.includes(roleName);
                                    console.log(`[MCP工具执行] 角色 "${roleName}" 授权状态:`, isAuthorized);
                                    return isAuthorized;
                                  });
                                }

                                console.log(`[MCP工具执行] 第${i+1}行是否包含:`, shouldInclude);

                                // 如果该行包含至少一个授权角色，或者不包含角色，则保留该行
                                if (shouldInclude) {
                                  // 如果有未授权的角色，移除它们
                                  let cleanedLine = line;
                                  if (roleMatches) {
                                    for (const roleMatch of roleMatches) {
                                      const roleName = roleMatch.replace(/`/g, '').trim();

                                      if (!alwaysAllowedTools.includes(roleName) && !authorizedRoles.includes(roleName)) {
                                        console.log(`[MCP工具执行] 移除未授权角色: "${roleName}"`);
                                        // 移除未授权的角色及其描述（从角色名到行尾）
                                        cleanedLine = cleanedLine.replace(new RegExp(`- \`${roleMatch}\`[^\\n]*`), '');
                                        // 或者使用更通用的移除逻辑
                                        cleanedLine = cleanedLine.replace(new RegExp(`\`${roleMatch}\`[^\\n]*`), '').trim();
                                      }
                                    }
                                  }
                                  if (cleanedLine) {
                                    filteredLines.push(cleanedLine);
                                  }
                                }
                              }

                              filteredText = filteredLines.join('\n').trim();
                              console.log(`[MCP工具执行] 过滤后行数:`, filteredLines.length);
                              console.log(`[MCP工具执行] 过滤后文本长度:`, filteredText.length);
                              console.log(`[MCP工具执行] discover结果过滤完成`);
                            }
                          }
                        } else {
                          console.log(`[MCP工具执行] 结果格式不符合预期`);
                        }
                      } catch (filterError) {
                        console.error(`[MCP工具执行] 过滤discover结果失败:`, filterError);
                        // 过滤失败时返回原始结果
                      }
                    }

                    aibitat.handlerProps.log(
                      `MCP server: ${name}:${tool.name} completed successfully`,
                      filteredResult
                    );
                    aibitat.introspect(
                      `MCP server: ${name}:${tool.name} completed successfully`
                    );
                    return typeof filteredResult === "object"
                      ? JSON.stringify(filteredResult)
                      : String(filteredResult);
                  } catch (error) {
                    aibitat.handlerProps.log(
                      `MCP server: ${name}:${tool.name} failed with error:`,
                      error
                    );
                    aibitat.introspect(
                      `MCP server: ${name}:${tool.name} failed with error:`,
                      error
                    );
                    return `The tool ${name}:${tool.name} failed with error: ${error?.message || "An unknown error occurred"}`;
                  }
                },
              });
            },
          };
        },
        toolName: `${name}:${tool.name}`,
      });
    }

    return plugins;
  }

  /**
   * Returns the MCP servers that were loaded or attempted to be loaded
   * so that we can display them in the frontend for review or error logging.
   * @returns {Promise<{
   *   name: string,
   *   running: boolean,
   *   tools: {name: string, description: string, inputSchema: Object}[],
   *   process: {pid: number, cmd: string}|null,
   *   error: string|null
   * }[]>} - The active MCP servers
   */
  async servers() {
    await this.bootMCPServers();
    const servers = [];
    for (const [name, result] of Object.entries(this.mcpLoadingResults)) {
      const config = this.mcpServerConfigs.find((s) => s.name === name);

      if (result.status === "failed") {
        servers.push({
          name,
          config: config?.server || null,
          running: false,
          tools: [],
          error: result.message,
          process: null,
        });
        continue;
      }

      const mcp = this.mcps[name];
      if (!mcp) {
        delete this.mcpLoadingResults[name];
        delete this.mcps[name];
        continue;
      }

      const online = !!(await mcp.ping());
      const tools = online ? (await mcp.listTools()).tools : [];
      servers.push({
        name,
        config: config?.server || null,
        running: online,
        tools,
        error: null,
        process: {
          pid: mcp.transport?.process?.pid || null,
        },
      });
    }
    return servers;
  }

  /**
   * Toggle the MCP server (start or stop)
   * @param {string} name - The name of the MCP server to toggle
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async toggleServerStatus(name) {
    const server = this.mcpServerConfigs.find((s) => s.name === name);
    if (!server)
      return {
        success: false,
        error: `MCP server ${name} not found in config file.`,
      };
    const mcp = this.mcps[name];
    const online = !!mcp ? !!(await mcp.ping()) : false; // If the server is not in the mcps object, it is not running

    if (online) {
      const killed = this.pruneMCPServer(name);
      return {
        success: killed,
        error: killed ? null : `Failed to kill MCP server: ${name}`,
      };
    } else {
      const startupResult = await this.startMCPServer(name);
      return { success: startupResult.success, error: startupResult.error };
    }
  }

  /**
   * Delete the MCP server - will also remove it from the config file
   * @param {string} name - The name of the MCP server to delete
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async deleteServer(name) {
    const server = this.mcpServerConfigs.find((s) => s.name === name);
    if (!server)
      return {
        success: false,
        error: `MCP server ${name} not found in config file.`,
      };

    const mcp = this.mcps[name];
    const online = !!mcp ? !!(await mcp.ping()) : false; // If the server is not in the mcps object, it is not running
    if (online) this.pruneMCPServer(name);
    this.removeMCPServerFromConfig(name);

    delete this.mcps[name];
    delete this.mcpLoadingResults[name];
    this.log(`MCP server was killed and removed from config file: ${name}`);
    return { success: true, error: null };
  }

  /**
   * 触发PromptX资源刷新（尽力而为）
   * 基于research.md的决策：MCP无官方refresh API，仅验证连接健康
   * 实际资源刷新由前端重新调用discover工具触发
   * @returns {Promise<boolean>} 是否刷新检查成功
   */
  async refreshPromptXResources() {
    try {
      const mcpServer = this.mcps['promptx-local'];
      if (!mcpServer) {
        console.warn('[MCP刷新] PromptX MCP服务器未配置');
        return false;
      }

      // 检查连接健康
      const healthy = await mcpServer.ping();
      if (!healthy) {
        console.warn('[MCP刷新] PromptX MCP服务器ping失败');
        return false;
      }

      // 注意: 无官方refresh API，仅验证连接正常
      // 实际刷新由前端调用discover工具触发
      this.log('[MCP刷新] PromptX服务器连接正常，资源刷新将由discover触发');
      return true;
    } catch (error) {
      console.error('[MCP刷新] PromptX刷新检查失败:', error.message);
      return false;
    }
  }
}
module.exports = MCPCompatibilityLayer;
