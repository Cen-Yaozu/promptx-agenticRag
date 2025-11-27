/**
 * 配置审计服务
 * 负责配置操作的审计、监控和安全检查
 */
class AuditService {
  constructor(logDAO, logger) {
    this.logDAO = logDAO;
    this.logger = logger;

    // 审计事件类型
    this.eventTypes = {
      CONFIG_CREATE: 'config_create',
      CONFIG_UPDATE: 'config_update',
      CONFIG_DELETE: 'config_delete',
      CONFIG_READ: 'config_read',
      CONFIG_EXPORT: 'config_export',
      CONFIG_IMPORT: 'config_import',
      CONFIG_ROLLBACK: 'config_rollback',
      CONFIG_BATCH_UPDATE: 'config_batch_update',
      SECURITY_ALERT: 'security_alert',
      ACCESS_DENIED: 'access_denied',
      KEY_ROTATION: 'key_rotation',
      SYSTEM_STARTUP: 'system_startup',
      SYSTEM_SHUTDOWN: 'system_shutdown'
    };

    // 风险级别
    this.riskLevels = {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical'
    };

    // 敏感操作监控
    this.sensitiveOperations = new Set([
      'api_key', 'secret', 'password', 'token', 'credential'
    ]);

    // 审计规则
    this.initAuditRules();
  }

  /**
   * 初始化审计规则
   */
  initAuditRules() {
    // 批量操作阈值
    this.batchThreshold = 10;

    // 高频操作阈值 (每分钟)
    this.highFrequencyThreshold = 50;

    // 敏感配置访问监控
    this.sensitiveAccessThreshold = 5; // 每分钟5次
  }

  /**
   * 记录审计事件
   * @param {Object} eventData - 审计事件数据
   * @returns {Promise<Object>} 审计记录
   */
  async logEvent(eventData) {
    const {
      eventType,
      userId,
      configKey,
      category = 'system',
      workspaceId = null,
      oldValue = null,
      newValue = null,
      source = 'api',
      ipAddress = null,
      userAgent = null,
      riskLevel = this.riskLevels.LOW,
      metadata = {}
    } = eventData;

    try {
      // 构建审计记录
      const auditRecord = {
        eventType,
        userId,
        configKey,
        category,
        workspaceId,
        oldValue,
        newValue,
        source,
        ipAddress,
        userAgent,
        riskLevel,
        metadata: {
          timestamp: new Date().toISOString(),
          ...metadata
        }
      };

      // 检查安全规则
      await this.checkSecurityRules(auditRecord);

      // 记录到日志
      const logEntry = await this.logDAO.createLog({
        configKey: configKey || 'system_audit',
        category,
        workspaceId,
        userId,
        action: eventType,
        oldValue,
        newValue,
        source,
        description: `${eventType} - ${configKey || 'system'}`,
        metadata: auditRecord.metadata
      });

      // 记录审计日志
      this.logger.info('配置审计事件', {
        eventType,
        userId,
        configKey,
        category,
        riskLevel,
        timestamp: auditRecord.metadata.timestamp
      });

      // 检查是否需要发送告警
      if (this.shouldTriggerAlert(auditRecord)) {
        await this.triggerAlert(auditRecord);
      }

      return logEntry;
    } catch (error) {
      this.logger.error('记录审计事件失败', {
        eventType,
        userId,
        configKey,
        error: error.message
      });
      throw new Error(`记录审计事件失败: ${error.message}`);
    }
  }

  /**
   * 记录配置变更审计
   * @param {Object} configData - 配置数据
   * @param {Object} auditData - 审计数据
   * @returns {Promise<Object>} 审计记录
   */
  async logConfigChange(configData, auditData) {
    const {
      key,
      category = 'system',
      workspaceId = null,
      oldValue,
      newValue,
      valueType = 'string',
      isEncrypted = false
    } = configData;

    const {
      userId,
      action, // 'create', 'update', 'delete'
      source = 'api',
      ipAddress,
      userAgent
    } = auditData;

    // 确定风险级别
    const riskLevel = this.assessRiskLevel(key, action, oldValue, newValue);

    // 构建元数据
    const metadata = {
      valueType,
      isEncrypted,
      ipAddress,
      userAgent,
      ...(this.isSensitiveConfig(key) && { isSensitive: true })
    };

    return this.logEvent({
      eventType: `config_${action}`,
      userId,
      configKey: key,
      category,
      workspaceId,
      oldValue,
      newValue,
      source,
      ipAddress,
      userAgent,
      riskLevel,
      metadata
    });
  }

  /**
   * 记录批量操作审计
   * @param {Array} operations - 操作列表
   * @param {Object} auditData - 审计数据
   * @returns {Promise<Array>} 审计记录列表
   */
  async logBatchOperation(operations, auditData) {
    const {
      userId,
      source = 'api',
      ipAddress,
      userAgent
    } = auditData;

    // 检查批量操作安全
    await this.checkBatchOperationSecurity(operations, userId);

    // 记录批量审计事件
    const batchEvent = await this.logEvent({
      eventType: this.eventTypes.CONFIG_BATCH_UPDATE,
      userId,
      configKey: 'batch_operation',
      category: 'system',
      workspaceId: null,
      oldValue: null,
      newValue: JSON.stringify({
        operationCount: operations.length,
        operations: operations.map(op => ({ key: op.key, action: op.action }))
      }),
      source,
      ipAddress,
      userAgent,
      riskLevel: operations.length > this.batchThreshold ? this.riskLevels.MEDIUM : this.riskLevels.LOW,
      metadata: {
        batchId: this.generateBatchId(),
        operationCount: operations.length,
        operations: operations.map(op => ({
          key: op.key,
          category: op.category,
          action: op.action
        }))
      }
    });

    // 为每个操作记录详细审计
    const detailLogs = [];
    for (const operation of operations) {
      const detailLog = await this.logConfigChange(operation, {
        userId,
        action: operation.action,
        source,
        ipAddress,
        userAgent,
        batchId: batchEvent.id
      });
      detailLogs.push(detailLog);
    }

    return { batchEvent, detailLogs };
  }

  /**
   * 记录访问拒绝事件
   * @param {Object} accessData - 访问数据
   * @returns {Promise<Object>} 审计记录
   */
  async logAccessDenied(accessData) {
    const {
      userId,
      configKey,
      category,
      workspaceId,
      reason,
      ipAddress,
      userAgent,
      source = 'api'
    } = accessData;

    return this.logEvent({
      eventType: this.eventTypes.ACCESS_DENIED,
      userId,
      configKey,
      category,
      workspaceId,
      source,
      ipAddress,
      userAgent,
      riskLevel: this.riskLevels.MEDIUM,
      metadata: {
        reason,
        accessAttempt: new Date().toISOString()
      }
    });
  }

  /**
   * 评估风险级别
   * @param {string} configKey - 配置键
   * @param {string} action - 操作类型
   * @param {any} oldValue - 旧值
   * @param {any} newValue - 新值
   * @returns {string} 风险级别
   */
  assessRiskLevel(configKey, action, oldValue, newValue) {
    // 敏感配置操作
    if (this.isSensitiveConfig(configKey)) {
      if (action === 'delete') {
        return this.riskLevels.CRITICAL;
      }
      return this.riskLevels.HIGH;
    }

    // 批量操作
    if (action === 'batch_update') {
      return this.riskLevels.MEDIUM;
    }

    // 系统级配置
    if (configKey.includes('system_') || configKey.includes('admin_')) {
      return this.riskLevels.MEDIUM;
    }

    // 普通操作
    return this.riskLevels.LOW;
  }

  /**
   * 检查是否为敏感配置
   * @param {string} configKey - 配置键
   * @returns {boolean} 是否为敏感配置
   */
  isSensitiveConfig(configKey) {
    if (!configKey) return false;

    const sensitiveKeywords = this.sensitiveOperations;
    const key = configKey.toLowerCase();

    for (const keyword of sensitiveKeywords) {
      if (key.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查安全规则
   * @param {Object} auditRecord - 审计记录
   * @returns {Promise<void>}
   */
  async checkSecurityRules(auditRecord) {
    const { eventType, userId, configKey, riskLevel } = auditRecord;

    // 检查高频操作
    await this.checkHighFrequencyOperations(userId, eventType);

    // 检查敏感配置访问
    if (this.isSensitiveConfig(configKey)) {
      await this.checkSensitiveConfigAccess(userId, configKey);
    }

    // 检查异常时间操作
    await this.checkAbnormalTimeAccess(userId, eventType);

    // 检查权限提升
    await this.checkPrivilegeEscalation(userId, auditRecord);
  }

  /**
   * 检查高频操作
   * @param {string} userId - 用户ID
   * @param {string} eventType - 事件类型
   * @returns {Promise<void>}
   */
  async checkHighFrequencyOperations(userId, eventType) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    try {
      const recentLogs = await this.logDAO.getLogs({
        userId,
        startDate: oneMinuteAgo.toISOString()
      }, { limit: 100 });

      if (recentLogs.logs.length > this.highFrequencyThreshold) {
        await this.triggerAlert({
          eventType: this.eventTypes.SECURITY_ALERT,
          userId,
          configKey: 'high_frequency_operations',
          category: 'security',
          riskLevel: this.riskLevels.HIGH,
          metadata: {
            alertType: 'HIGH_FREQUENCY',
            operationCount: recentLogs.logs.length,
            timeWindow: '1分钟',
            eventType
          }
        });
      }
    } catch (error) {
      this.logger.error('检查高频操作失败:', error.message);
    }
  }

  /**
   * 检查敏感配置访问
   * @param {string} userId - 用户ID
   * @param {string} configKey - 配置键
   * @returns {Promise<void>}
   */
  async checkSensitiveConfigAccess(userId, configKey) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    try {
      const recentLogs = await this.logDAO.getLogs({
        userId,
        configKey,
        startDate: oneMinuteAgo.toISOString()
      }, { limit: 10 });

      if (recentLogs.logs.length > this.sensitiveAccessThreshold) {
        await this.triggerAlert({
          eventType: this.eventTypes.SECURITY_ALERT,
          userId,
          configKey,
          category: 'security',
          riskLevel: this.riskLevels.HIGH,
          metadata: {
            alertType: 'SENSITIVE_CONFIG_ACCESS',
            accessCount: recentLogs.logs.length,
            timeWindow: '1分钟',
            configKey
          }
        });
      }
    } catch (error) {
      this.logger.error('检查敏感配置访问失败:', error.message);
    }
  }

  /**
   * 检查异常时间访问
   * @param {string} userId - 用户ID
   * @param {string} eventType - 事件类型
   * @returns {Promise<void>}
   */
  async checkAbnormalTimeAccess(userId, eventType) {
    const currentHour = new Date().getHours();

    // 定义工作时间 (9:00-18:00)
    const workingHours = { start: 9, end: 18 };

    if (currentHour < workingHours.start || currentHour > workingHours.end) {
      // 非工作时间访问，记录但不必告警
      this.logger.info('非工作时间访问', {
        userId,
        eventType,
        hour: currentHour
      });
    }
  }

  /**
   * 检查权限提升
   * @param {string} userId - 用户ID
   * @param {Object} auditRecord - 审计记录
   * @returns {Promise<void>}
   */
  async checkPrivilegeEscalation(userId, auditRecord) {
    // 这里可以实现权限提升检查逻辑
    // 例如检查用户是否尝试修改超出其权限的配置
  }

  /**
   * 检查批量操作安全性
   * @param {Array} operations - 操作列表
   * @param {string} userId - 用户ID
   * @returns {Promise<void>}
   */
  async checkBatchOperationSecurity(operations, userId) {
    if (operations.length > this.batchThreshold) {
      this.logger.warn('大批量操作检测', {
        userId,
        operationCount: operations.length,
        threshold: this.batchThreshold
      });

      // 检查是否包含敏感配置
      const sensitiveOps = operations.filter(op => this.isSensitiveConfig(op.key));
      if (sensitiveOps.length > 0) {
        await this.triggerAlert({
          eventType: this.eventTypes.SECURITY_ALERT,
          userId,
          configKey: 'batch_sensitive_operation',
          category: 'security',
          riskLevel: this.riskLevels.HIGH,
          metadata: {
            alertType: 'BATCH_SENSITIVE_OPERATION',
            operationCount: operations.length,
            sensitiveCount: sensitiveOps.length,
            sensitiveKeys: sensitiveOps.map(op => op.key)
          }
        });
      }
    }
  }

  /**
   * 判断是否应该触发告警
   * @param {Object} auditRecord - 审计记录
   * @returns {boolean} 是否触发告警
   */
  shouldTriggerAlert(auditRecord) {
    const { riskLevel, eventType } = auditRecord;

    // 高风险级别总是触发告警
    if ([this.riskLevels.HIGH, this.riskLevels.CRITICAL].includes(riskLevel)) {
      return true;
    }

    // 特定事件类型触发告警
    const alertEvents = [
      this.eventTypes.ACCESS_DENIED,
      this.eventTypes.SECURITY_ALERT
    ];

    return alertEvents.includes(eventType);
  }

  /**
   * 触发告警
   * @param {Object} alertData - 告警数据
   * @returns {Promise<void>}
   */
  async triggerAlert(alertData) {
    try {
      this.logger.error('配置安全告警', alertData);

      // 这里可以集成各种告警渠道:
      // - 邮件通知
      // - Slack/企业微信通知
      // - 短信通知
      // - 监控系统集成

      // 记录告警到审计日志
      await this.logEvent({
        eventType: this.eventTypes.SECURITY_ALERT,
        userId: alertData.userId || 'system',
        configKey: alertData.configKey || 'security_alert',
        category: 'security',
        riskLevel: this.riskLevels.CRITICAL,
        metadata: alertData.metadata
      });
    } catch (error) {
      this.logger.error('触发告警失败:', error.message);
    }
  }

  /**
   * 生成批量操作ID
   * @returns {string} 批量ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取审计统计信息
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Object>} 统计信息
   */
  async getAuditStats(filters = {}) {
    const {
      userId,
      startDate,
      endDate,
      category
    } = filters;

    try {
      const logStats = await this.logDAO.getLogStats({
        userId,
        startDate,
        endDate,
        category
      });

      // 计算安全指标
      const securityMetrics = this.calculateSecurityMetrics(logStats);

      return {
        ...logStats,
        securityMetrics
      };
    } catch (error) {
      this.logger.error('获取审计统计失败:', error.message);
      return {};
    }
  }

  /**
   * 计算安全指标
   * @param {Object} logStats - 日志统计
   * @returns {Object} 安全指标
   */
  calculateSecurityMetrics(logStats) {
    const totalOperations = Object.values(logStats.actionStats || {}).reduce((sum, count) => sum + count, 0);

    const securityEvents = [
      'config_delete',
      'access_denied',
      'security_alert'
    ];

    const securityEventCount = securityEvents.reduce((sum, event) => {
      return sum + (logStats.actionStats[event] || 0);
    }, 0);

    const securityRatio = totalOperations > 0 ? (securityEventCount / totalOperations) * 100 : 0;

    return {
      totalOperations,
      securityEventCount,
      securityRatio: Math.round(securityRatio * 100) / 100,
      riskLevel: this.assessOverallRisk(securityRatio)
    };
  }

  /**
   * 评估整体风险级别
   * @param {number} securityRatio - 安全事件比率
   * @returns {string} 风险级别
   */
  assessOverallRisk(securityRatio) {
    if (securityRatio > 20) {
      return this.riskLevels.CRITICAL;
    } else if (securityRatio > 10) {
      return this.riskLevels.HIGH;
    } else if (securityRatio > 5) {
      return this.riskLevels.MEDIUM;
    } else {
      return this.riskLevels.LOW;
    }
  }

  /**
   * 生成审计报告
   * @param {Object} reportParams - 报告参数
   * @returns {Promise<Object>} 审计报告
   */
  async generateAuditReport(reportParams) {
    const {
      startDate,
      endDate,
      category,
      workspaceId,
      format = 'json'
    } = reportParams;

    try {
      const logs = await this.logDAO.getLogs({
        category,
        workspaceId,
        startDate,
        endDate
      }, { limit: 1000 });

      const stats = await this.getAuditStats({
        category,
        workspaceId,
        startDate,
        endDate
      });

      const report = {
        reportPeriod: {
          startDate,
          endDate
        },
        summary: {
          totalEvents: logs.total,
          uniqueUsers: new Set(logs.logs.map(log => log.userId)).size,
          riskDistribution: this.calculateRiskDistribution(logs.logs)
        },
        statistics: stats,
        details: format === 'summary' ? logs.logs.slice(0, 50) : logs.logs,
        generatedAt: new Date().toISOString()
      };

      return report;
    } catch (error) {
      this.logger.error('生成审计报告失败:', error.message);
      throw new Error(`生成审计报告失败: ${error.message}`);
    }
  }

  /**
   * 计算风险分布
   * @param {Array} logs - 日志列表
   * @returns {Object} 风险分布
   */
  calculateRiskDistribution(logs) {
    const distribution = {
      [this.riskLevels.LOW]: 0,
      [this.riskLevels.MEDIUM]: 0,
      [this.riskLevels.HIGH]: 0,
      [this.riskLevels.CRITICAL]: 0
    };

    logs.forEach(log => {
      const riskLevel = log.metadata?.riskLevel || this.riskLevels.LOW;
      if (distribution[riskLevel] !== undefined) {
        distribution[riskLevel]++;
      }
    });

    return distribution;
  }
}

module.exports = AuditService;