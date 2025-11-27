# DeeConfig 统一配置管理服务

DeeConfig是一个企业级的配置管理解决方案，为现有系统提供统一的配置存储、验证、加密、审计和同步功能。

## 🚀 快速开始

### 基本使用

```javascript
const { initializeDeeConfig } = require('./services/deeconfig');

// 初始化服务
const deeConfig = await initializeDeeConfig({
  loadFromEnv: true,    // 从环境变量加载配置
  validateConfig: true  // 验证配置
});

// 获取配置
const openAiKey = await deeConfig.getConfig('open_ai_key', 'system');

// 设置配置
await deeConfig.setConfig({
  key: 'llm_provider',
  value: 'anthropic',
  userId: 1,
  source: 'api'
});

// 批量设置配置
await deeConfig.batchSetConfigs([
  { key: 'anthropic_api_key', value: 'sk-ant-...' },
  { key: 'anthropic_model', value: 'claude-3-sonnet' }
], { userId: 1 });
```

### Express集成

```javascript
const express = require('express');
const deeConfigRoutes = require('./endpoints/deeconfig/routes');

const app = express();
app.use(express.json());

// 挂载DeeConfig API路由
app.use('/api/deeconfig', deeConfigRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log('DeeConfig API可用: http://localhost:' + PORT + '/api/deeconfig/health');
});
```

## 📋 核心功能

### 1. 统一配置存储

```javascript
// 系统级配置
await deeConfig.setConfig({
  key: 'open_ai_key',
  value: 'sk-...',
  category: 'system',
  description: 'OpenAI API密钥',
  userId: 1
});

// 工作区级配置
await deeConfig.setConfig({
  key: 'custom_prompt',
  value: '你是一个专业的助手...',
  category: 'workspace',
  workspaceId: 123,
  userId: 1
});
```

### 2. 配置验证

```javascript
const { ValidationService } = require('./services/deeconfig');
const validation = new ValidationService();

// 验证单个配置
const result = validation.validateValue('open_ai_key', 'sk-...', 'string', {
  validator: 'apiKey',
  required: true,
  min: 8
});

// 验证批量配置
const batchResult = validation.validateConfigBatch([
  { key: 'port', value: 8080, category: 'system' },
  { key: 'email', value: 'admin@example.com', category: 'system' }
], validation.getConfigSchema());
```

### 3. 敏感配置加密

```javascript
const { EncryptionService } = require('./services/deeconfig');
const encryption = new EncryptionService();

// 检查是否需要加密
const shouldEncrypt = encryption.shouldEncrypt('api_key'); // true

// 加密敏感数据
const encrypted = encryption.encrypt('sk-1234567890');
const decrypted = encryption.decrypt(encrypted);

// 批量加密配置
const configs = { api_key: 'sk-...', secret: 'my-secret' };
const encryptedConfigs = encryption.encryptConfigs(configs);
```

### 4. 配置审计

```javascript
// 获取配置变更历史
const history = await deeConfig.getConfigHistory({
  configKey: 'open_ai_key',
  category: 'system'
});

// 获取审计日志
const auditLogs = await deeConfig.getAuditLogs({
  userId: 1,
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});

// 回滚配置
await deeConfig.rollbackConfig({
  configKey: 'llm_model',
  category: 'system',
  logId: 12345,
  userId: 1
});
```

### 5. 多层同步

```javascript
// 从环境变量同步到数据库
const loadResult = await deeConfig.loadFromEnvironment();

// 从数据库同步到环境变量
const syncResult = await deeConfig.syncToEnvironment();

// 检查同步状态
const syncStatus = deeConfig.getSyncStatus();
```

## 🔧 配置选项

### 服务初始化选项

```javascript
const options = {
  // 数据库客户端 (必需)
  dbClient: prisma,

  // 日志器
  logger: console,

  // 加密配置
  encryption: {
    algorithm: 'aes-256-gcm',
    saltLength: 32,
    keyRotationInterval: 30 * 24 * 60 * 60 * 1000 // 30天
  },

  // 同步配置
  sync: {
    autoSyncToEnv: true,
    autoSyncToEnvFile: true,
    envFilePath: '.env',
    batchSize: 50,
    maxRetries: 3
  },

  // 审计配置
  audit: {
    enableSecurityAlerts: true,
    highFrequencyThreshold: 50,
    sensitiveAccessThreshold: 5
  }
};

const deeConfig = await initializeDeeConfig(options);
```

### 环境变量

```bash
# 加密密钥 (生产环境必需)
DEECONFIG_ENCRYPTION_KEY=your-32-byte-encryption-key

# JWT密钥 (后备加密密钥)
JWT_SECRET=your-jwt-secret

# 同步选项
AUTO_SYNC_TO_ENV=true
AUTO_SYNC_TO_ENV_FILE=true
```

## 🌐 API接口

### RESTful API

```bash
# 健康检查
GET /api/deeconfig/health

# 获取配置列表
GET /api/deeconfig/configs?category=system&page=1&limit=20

# 获取单个配置
GET /api/deeconfig/configs/open_ai_key?category=system

# 设置配置
PUT /api/deeconfig/configs/llm_provider
Content-Type: application/json
{
  "value": "anthropic",
  "description": "LLM Provider",
  "valueType": "string"
}

# 批量更新配置
POST /api/deeconfig/configs/batch
Content-Type: application/json
{
  "configs": [
    {"key": "anthropic_api_key", "value": "sk-..."},
    {"key": "anthropic_model", "value": "claude-3-sonnet"}
  ]
}

# 获取配置历史
GET /api/deeconfig/configs/open_ai_key/history?limit=10

# 配置回滚
POST /api/deeconfig/configs/llm_model/rollback
Content-Type: application/json
{
  "logId": 12345
}

# 获取审计日志
GET /api/deeconfig/audit/logs?userId=1&startDate=2024-01-01

# 配置同步
POST /api/deeconfig/sync
Content-Type: application/json
{
  "direction": "to_env" // "from_env" | "to_env"
}

# 获取配置统计
GET /api/deeconfig/stats?category=system

# 验证配置
POST /api/deeconfig/validate
Content-Type: application/json
{
  "configs": [
    {"key": "port", "value": 8080},
    {"key": "email", "value": "admin@example.com"}
  ]
}
```

### 工作区配置

```bash
# 获取工作区配置
GET /api/deeconfig/workspaces/123/configs

# 设置工作区配置
PUT /api/deeconfig/workspaces/123/configs/custom_prompt
Content-Type: application/json
{
  "value": "你是一个专业的助手...",
  "category": "workspace"
}
```

## 🔒 安全特性

### 配置加密

```javascript
// 自动识别敏感配置
const sensitiveKeys = ['api_key', 'secret', 'password', 'token'];

// 自定义加密模式
const encryption = new EncryptionService({
  algorithm: 'aes-256-gcm',
  encryptionKey: Buffer.from('your-32-byte-key', 'hex')
});

// 密钥轮换
const newEncrypted = await encryption.rotateEncryption(
  oldEncryptedData,
  oldKey,
  newKey
);
```

### 审计和监控

```javascript
// 检查高频操作
const stats = await deeConfig.getAuditStats();
console.log('安全事件比率:', stats.securityMetrics.securityRatio);

// 生成审计报告
const report = await deeConfig.generateAuditReport({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  format: 'summary'
});
```

### 访问控制

```javascript
// 记录访问拒绝事件
await deeConfig.audit.logAccessDenied({
  userId: 1,
  configKey: 'admin_api_key',
  reason: 'INSUFFICIENT_PERMISSIONS',
  ipAddress: '192.168.1.100'
});
```

## 🧪 测试

### 单元测试

```javascript
const { createDeeConfigService } = require('./services/deeconfig');

describe('DeeConfig', () => {
  let deeConfig;

  beforeEach(async () => {
    deeConfig = createDeeConfigService({
      dbClient: mockDbClient,
      logger: mockLogger
    });
  });

  test('应该能够设置和获取配置', async () => {
    await deeConfig.setConfig({
      key: 'test_key',
      value: 'test_value',
      userId: 1
    });

    const config = await deeConfig.getConfig('test_key');
    expect(config.value).toBe('test_value');
  });
});
```

### API测试

```bash
# 健康检查
curl -X GET http://localhost:3000/api/deeconfig/health

# 设置配置
curl -X PUT http://localhost:3000/api/deeconfig/configs/test_key \
  -H "Content-Type: application/json" \
  -d '{"value": "test_value"}'

# 获取配置
curl -X GET http://localhost:3000/api/deeconfig/configs/test_key
```

## 📈 监控和指标

### 性能监控

```javascript
// 服务健康检查
const health = await deeConfig.healthCheck();
console.log('服务状态:', health);

// 配置统计
const stats = await deeConfig.getConfigStats();
console.log('配置统计:', stats);

// 同步状态
const syncStatus = deeConfig.getSyncStatus();
console.log('同步状态:', syncStatus);
```

### 日志监控

```javascript
// 配置变更日志
deeConfig.on('config:changed', (event) => {
  console.log('配置变更:', event);
});

// 安全事件日志
deeConfig.on('security:alert', (alert) => {
  console.error('安全告警:', alert);
});
```

## 🔄 迁移指南

### 从现有系统迁移

```javascript
// 1. 从system_settings表迁移数据
const { SystemSettings } = require('../models/systemSettings');
const settings = await SystemSettings.where();

const migrationResult = await deeConfig.configDAO.migrateFromSystemSettings(settings);
console.log(`迁移了 ${migrationResult} 个配置项`);

// 2. 加载环境变量配置
const loadResult = await deeConfig.loadFromEnvironment();
console.log(`从环境变量加载了 ${loadResult.loadedCount} 个配置项`);

// 3. 验证配置完整性
const validation = deeConfig.validateConfiguration();
if (!validation.valid) {
  console.warn('配置验证失败:', validation.issues);
}
```

### 数据库表结构

```sql
-- 统一配置表
CREATE TABLE unified_configs (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'system',
    workspace_id INTEGER,
    value TEXT,
    value_type VARCHAR(20) DEFAULT 'string',
    is_encrypted BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(key, category, workspace_id)
);

-- 配置变更日志表
CREATE TABLE config_change_logs (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    workspace_id INTEGER,
    user_id INTEGER,
    action VARCHAR(20) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    value_type VARCHAR(20),
    is_encrypted BOOLEAN DEFAULT FALSE,
    source VARCHAR(20) DEFAULT 'api',
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_unified_configs_key_category ON unified_configs(key, category);
CREATE INDEX idx_unified_configs_workspace ON unified_configs(workspace_id);
CREATE INDEX idx_config_logs_key ON config_change_logs(config_key);
CREATE INDEX idx_config_logs_user ON config_change_logs(user_id);
CREATE INDEX idx_config_logs_created ON config_change_logs(created_at);
```

## 🛠️ 故障排除

### 常见问题

1. **加密失败**
   ```javascript
   // 检查加密配置
   const validation = encryption.validateConfiguration();
   console.log('加密配置问题:', validation.issues);
   ```

2. **同步失败**
   ```javascript
   // 检查同步配置
   const syncValidation = syncManager.validateSyncConfiguration();
   console.log('同步配置问题:', syncValidation.issues);
   ```

3. **数据库连接问题**
   ```javascript
   // 检查数据库连接
   try {
     await deeConfig.healthCheck();
   } catch (error) {
     console.error('数据库连接失败:', error.message);
   }
   ```

### 调试模式

```javascript
// 启用详细日志
const deeConfig = await initializeDeeConfig({
  logger: {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
  }
});

// 监听所有事件
deeConfig.onAny((eventName, ...args) => {
  console.log(`[DeeConfig Event] ${eventName}:`, args);
});
```

## 📚 更多资源

- [技术规格文档](../../../spec-artifacts/deeconfig-complete-technical-spec.md)
- [API文档](./api.md)
- [配置模式参考](./schema.md)
- [安全指南](./security.md)

## 🤝 贡献

欢迎提交Issue和Pull Request来改进DeeConfig。

## 📄 许可证

MIT License