/**
 * 角色管理相关的错误处理工具
 */

class RoleManagementError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'RoleManagementError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

class RoleValidationError extends RoleManagementError {
  constructor(message, field = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

class RoleAuthorizationError extends RoleManagementError {
  constructor(message, workspaceId = null, roleId = null) {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.workspaceId = workspaceId;
    this.roleId = roleId;
  }
}

class RoleNotFoundError extends RoleManagementError {
  constructor(roleId, workspaceId = null) {
    super(`Role '${roleId}' not found${workspaceId ? ` in workspace ${workspaceId}` : ''}`, 'ROLE_NOT_FOUND', 404);
    this.roleId = roleId;
    this.workspaceId = workspaceId;
  }
}

class WorkspaceNotFoundError extends RoleManagementError {
  constructor(workspaceId) {
    super(`Workspace ${workspaceId} not found`, 'WORKSPACE_NOT_FOUND', 404);
    this.workspaceId = workspaceId;
  }
}

/**
 * 错误处理中间件
 */
function handleRoleManagementError(error, req, res, next) {
  // 如果是我们自定义的错误
  if (error instanceof RoleManagementError) {
    const response = {
      success: false,
      error: error.message,
      code: error.code
    };

    // 添加额外的错误信息
    if (error.field) {
      response.field = error.field;
    }
    if (error.workspaceId) {
      response.workspaceId = error.workspaceId;
    }
    if (error.roleId) {
      response.roleId = error.roleId;
    }

    return res.status(error.statusCode).json(response);
  }

  // 处理Prisma错误
  if (error.name === 'PrismaClientKnownRequestError') {
    switch (error.code) {
      case 'P2002':
        return res.status(409).json({
          success: false,
          error: 'Duplicate entry: This role is already configured for this workspace',
          code: 'DUPLICATE_ROLE'
        });
      case 'P2025':
        return res.status(404).json({
          success: false,
          error: 'Record not found',
          code: 'NOT_FOUND'
        });
      case 'P2003':
        return res.status(400).json({
          success: false,
          error: 'Foreign key constraint violation',
          code: 'FOREIGN_KEY_ERROR'
        });
      default:
        return res.status(500).json({
          success: false,
          error: 'Database operation failed',
          code: 'DATABASE_ERROR',
          details: error.message
        });
    }
  }

  // 处理验证错误
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.message
    });
  }

  // 默认错误处理
  console.error('Unexpected error in role management:', error);
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
}

/**
 * 验证工作区ID
 */
function validateWorkspaceId(workspaceId) {
  if (!workspaceId) {
    throw new RoleValidationError('Workspace ID is required', 'workspaceId');
  }

  const id = parseInt(workspaceId, 10);
  if (isNaN(id) || id <= 0) {
    throw new RoleValidationError('Invalid workspace ID', 'workspaceId');
  }

  return id;
}

/**
 * 验证角色ID
 */
function validateRoleId(roleId) {
  if (!roleId || typeof roleId !== 'string' || roleId.trim().length === 0) {
    throw new RoleValidationError('Role ID is required and must be a non-empty string', 'roleId');
  }

  return roleId.trim();
}

/**
 * 验证角色配置数据
 */
function validateRoleConfig(data) {
  const errors = [];

  if (!data.roleId) {
    errors.push('roleId is required');
  }

  if (typeof data.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (data.customName && typeof data.customName !== 'string') {
    errors.push('customName must be a string');
  }

  if (data.customDescription && typeof data.customDescription !== 'string') {
    errors.push('customDescription must be a string');
  }

  if (errors.length > 0) {
    throw new RoleValidationError(`Validation failed: ${errors.join(', ')}`);
  }

  return {
    roleId: validateRoleId(data.roleId),
    enabled: data.enabled,
    customName: data.customName || null,
    customDescription: data.customDescription || null
  };
}

/**
 * 验证工作区配置数据
 */
function validateWorkspaceConfig(data) {
  const errors = [];

  if (typeof data.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (data.autoSwitchEnabled !== undefined && typeof data.autoSwitchEnabled !== 'boolean') {
    errors.push('autoSwitchEnabled must be a boolean');
  }

  if (data.enableAllRoles !== undefined && typeof data.enableAllRoles !== 'boolean') {
    errors.push('enableAllRoles must be a boolean');
  }

  if (data.defaultRoleId && typeof data.defaultRoleId !== 'string') {
    errors.push('defaultRoleId must be a string');
  }

  if (errors.length > 0) {
    throw new RoleValidationError(`Validation failed: ${errors.join(', ')}`);
  }

  return {
    enabled: data.enabled,
    autoSwitchEnabled: data.autoSwitchEnabled || false,
    enableAllRoles: data.enableAllRoles || false,
    defaultRoleId: data.defaultRoleId || null
  };
}

/**
 * 批量操作验证
 */
function validateBatchOperation(data) {
  const errors = [];

  if (!Array.isArray(data.roleIds) || data.roleIds.length === 0) {
    errors.push('roleIds must be a non-empty array');
  }

  if (typeof data.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  // 验证每个角色ID
  data.roleIds.forEach((roleId, index) => {
    if (!roleId || typeof roleId !== 'string') {
      errors.push(`roleId at index ${index} must be a non-empty string`);
    }
  });

  if (errors.length > 0) {
    throw new RoleValidationError(`Batch validation failed: ${errors.join(', ')}`);
  }

  return {
    roleIds: data.roleIds.map(roleId => roleId.trim()),
    enabled: data.enabled,
    customName: data.customName || null,
    customDescription: data.customDescription || null
  };
}

module.exports = {
  RoleManagementError,
  RoleValidationError,
  RoleAuthorizationError,
  RoleNotFoundError,
  WorkspaceNotFoundError,
  handleRoleManagementError,
  validateWorkspaceId,
  validateRoleId,
  validateRoleConfig,
  validateWorkspaceConfig,
  validateBatchOperation
};