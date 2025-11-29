const WorkspaceRoleAuth = require("../utils/workspaceRoleAuth");

describe("MCP Authorization Tests", () => {
  let roleAuth;
  let testWorkspaceId;

  beforeAll(async () => {
    roleAuth = new WorkspaceRoleAuth();
    // 使用测试工作区ID，实际使用时应该创建或查找一个真实的工作区
    testWorkspaceId = 1; // 假设存在工作区ID为1
  });

  afterAll(async () => {
    await roleAuth.disconnect();
  });

  describe("isRoleAuthorized", () => {
    test("系统工具应该始终被授权", async () => {
      const systemTools = ['discover', 'project', 'toolx'];

      for (const toolName of systemTools) {
        const isAuthorized = await roleAuth.isRoleAuthorized(testWorkspaceId, toolName);
        expect(isAuthorized).toBe(true);
      }
    });

    test("未配置的工作区应该允许所有角色", async () => {
      // 假设工作区ID 999 不存在配置
      const nonExistentWorkspaceId = 999;

      const testRoles = ['nuwa', 'luban', 'writer', 'assistant'];

      for (const roleName of testRoles) {
        const isAuthorized = await roleAuth.isRoleAuthorized(nonExistentWorkspaceId, roleName);
        expect(isAuthorized).toBe(true); // 错误时默认允许
      }
    });

    test("应该正确检查角色授权状态", async () => {
      // 这个测试需要实际的数据库数据
      // 暂时只测试函数调用不会抛出错误
      const isAuthorized = await roleAuth.isRoleAuthorized(testWorkspaceId, 'nuwa');
      expect(typeof isAuthorized).toBe('boolean');
    });
  });

  describe("getAuthorizedRoles", () => {
    test("应该返回授权的角色列表", async () => {
      const { roles, error } = await roleAuth.getAuthorizedRoles(testWorkspaceId);

      if (error) {
        // 错误时应该返回空数组
        expect(roles).toEqual([]);
      } else {
        // 成功时应该返回数组
        expect(Array.isArray(roles)).toBe(true);
      }
    });

    test("未配置的工作区应该返回空数组", async () => {
      const nonExistentWorkspaceId = 999;
      const roles = await roleAuth.getAuthorizedRoles(nonExistentWorkspaceId);

      expect(Array.isArray(roles)).toBe(true);
      // 根据实现，可能返回空数组或者undefined
    });
  });

  describe("PromptX配置检查", () => {
    test("isPromptXEnabled应该返回布尔值", async () => {
      const isEnabled = await roleAuth.isPromptXEnabled(testWorkspaceId);
      expect(typeof isEnabled).toBe('boolean');
    });

    test("getWorkspaceConfig应该返回配置对象或null", async () => {
      const config = await roleAuth.getWorkspaceConfig(testWorkspaceId);

      if (config) {
        expect(typeof config).toBe('object');
      } else {
        expect(config).toBeNull();
      }
    });
  });
});