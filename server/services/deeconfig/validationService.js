const { isValidUrl, safeJsonParse } = require('../../utils/http');

/**
 * 配置验证服务
 * 负责配置项的验证、类型转换和业务规则检查
 */
class ValidationService {
  constructor() {
    // 配置键名到验证函数的映射
    this.validators = new Map();

    // 支持的配置类型
    this.supportedTypes = ['string', 'number', 'boolean', 'json', 'url', 'email', 'array'];

    // 内置验证规则
    this.initBuiltinValidators();
  }

  /**
   * 初始化内置验证规则
   */
  initBuiltinValidators() {
    // URL 验证
    this.registerValidator('url', {
      validate: (value) => {
        if (!value) return { valid: true };
        if (typeof value !== 'string') {
          return { valid: false, error: 'URL必须是字符串类型' };
        }
        return isValidUrl(value)
          ? { valid: true }
          : { valid: false, error: '无效的URL格式' };
      },
      sanitize: (value) => typeof value === 'string' ? value.trim() : value
    });

    // Email 验证
    this.registerValidator('email', {
      validate: (value) => {
        if (!value) return { valid: true };
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value)
          ? { valid: true }
          : { valid: false, error: '无效的邮箱格式' };
      },
      sanitize: (value) => typeof value === 'string' ? value.trim().toLowerCase() : value
    });

    // JSON 验证
    this.registerValidator('json', {
      validate: (value) => {
        if (!value) return { valid: true };
        try {
          if (typeof value === 'string') {
            JSON.parse(value);
          } else if (typeof value === 'object') {
            JSON.stringify(value);
          }
          return { valid: true };
        } catch (error) {
          return { valid: false, error: '无效的JSON格式' };
        }
      },
      sanitize: (value) => {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      }
    });

    // 数组验证
    this.registerValidator('array', {
      validate: (value) => {
        if (!value) return { valid: true };
        if (Array.isArray(value)) return { valid: true };
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return { valid: true };
          } catch {
            // 尝试按逗号分割
            const parts = value.split(',').map(part => part.trim()).filter(part => part);
            return { valid: true, value: parts };
          }
        }
        return { valid: false, error: '必须是数组类型或可转换为数组的字符串' };
      },
      sanitize: (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            return value.split(',').map(part => part.trim()).filter(part => part);
          }
        }
        return [value];
      }
    });

    // 端口号验证
    this.registerValidator('port', {
      validate: (value) => {
        const port = parseInt(value);
        return (!isNaN(port) && port >= 1 && port <= 65535)
          ? { valid: true }
          : { valid: false, error: '端口号必须在1-65535范围内' };
      },
      sanitize: (value) => parseInt(value) || null
    });

    // 正整数验证
    this.registerValidator('positiveInteger', {
      validate: (value) => {
        const num = parseInt(value);
        return (!isNaN(num) && num > 0)
          ? { valid: true }
          : { valid: false, error: '必须是正整数' };
      },
      sanitize: (value) => parseInt(value) || null
    });

    // 非负整数验证
    this.registerValidator('nonNegativeInteger', {
      validate: (value) => {
        const num = parseInt(value);
        return (!isNaN(num) && num >= 0)
          ? { valid: true }
          : { valid: false, error: '必须是非负整数' };
      },
      sanitize: (value) => parseInt(value) || 0
    });

    // API Key 验证（简单的非空验证）
    this.registerValidator('apiKey', {
      validate: (value) => {
        if (!value) return { valid: false, error: 'API Key不能为空' };
        if (typeof value !== 'string') {
          return { valid: false, error: 'API Key必须是字符串类型' };
        }
        return value.trim().length >= 8
          ? { valid: true }
          : { valid: false, error: 'API Key长度至少8个字符' };
      },
      sanitize: (value) => typeof value === 'string' ? value.trim() : value
    });

    // 模型名称验证
    this.registerValidator('modelName', {
      validate: (value) => {
        if (!value) return { valid: true };
        if (typeof value !== 'string') {
          return { valid: false, error: '模型名称必须是字符串类型' };
        }
        // 允许字母、数字、连字符、下划线、点
        const modelRegex = /^[a-zA-Z0-9\-_\.]+$/;
        return modelRegex.test(value)
          ? { valid: true }
          : { valid: false, error: '模型名称只能包含字母、数字、连字符、下划线和点' };
      },
      sanitize: (value) => typeof value === 'string' ? value.trim() : value
    });

    // LLM Provider 验证
    this.registerValidator('llmProvider', {
      validate: (value) => {
        if (!value) return { valid: true };
        const validProviders = [
          'openai', 'anthropic', 'gemini', 'ollama', 'lmstudio', 'localai',
          'together_ai', 'fireworks_ai', 'openrouter', 'mistral', 'groq',
          'cohere', 'deepseek', 'xai', 'nvidia_nim', 'ppio', 'generic_openai',
          'azure_openai', 'huggingface', 'koboldcpp', 'text_gen_web_ui',
          'lite_llm', 'moonshot_ai', 'apipie', 'foundry', 'aws_bedrock',
          'dell_pro_ai_studio', 'cometapi', 'z_ai', 'novita_llm', 'perplexity'
        ];
        return validProviders.includes(value)
          ? { valid: true }
          : { valid: false, error: `无效的LLM Provider，支持的类型: ${validProviders.join(', ')}` };
      },
      sanitize: (value) => typeof value === 'string' ? value.trim().toLowerCase() : value
    });

    // 向量数据库 Provider 验证
    this.registerValidator('vectorDbProvider', {
      validate: (value) => {
        if (!value) return { valid: true };
        const validProviders = [
          'chroma', 'pinecone', 'chromacloud', 'weaviate', 'qdrant',
          'milvus', 'zilliz', 'astra_db', 'pgvector'
        ];
        return validProviders.includes(value)
          ? { valid: true }
          : { valid: false, error: `无效的向量数据库Provider，支持的类型: ${validProviders.join(', ')}` };
      },
      sanitize: (value) => typeof value === 'string' ? value.trim().toLowerCase() : value
    });
  }

  /**
   * 注册自定义验证器
   * @param {string} name - 验证器名称
   * @param {Object} validator - 验证器对象
   */
  registerValidator(name, validator) {
    this.validators.set(name, validator);
  }

  /**
   * 获取验证器
   * @param {string} name - 验证器名称
   * @returns {Object|null} 验证器对象
   */
  getValidator(name) {
    return this.validators.get(name) || null;
  }

  /**
   * 验证配置值
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   * @param {string} type - 期望的类型
   * @param {Object} rules - 额外的验证规则
   * @returns {Object} 验证结果
   */
  validateValue(key, value, type = 'string', rules = {}) {
    try {
      const result = {
        valid: true,
        value: value,
        error: null,
        warnings: []
      };

      // 1. 类型转换和基础验证
      const typeResult = this.validateType(value, type);
      if (!typeResult.valid) {
        return { ...result, ...typeResult };
      }
      result.value = typeResult.value;

      // 2. 应用自定义验证器
      if (rules.validator) {
        const validator = this.getValidator(rules.validator);
        if (validator) {
          const validatorResult = validator.validate(result.value);
          if (!validatorResult.valid) {
            return { ...result, ...validatorResult };
          }
          if (validatorResult.value !== undefined) {
            result.value = validatorResult.value;
          }
        }
      }

      // 3. 应用额外规则
      if (rules.required !== false && (result.value === null || result.value === undefined || result.value === '')) {
        return {
          valid: false,
          error: `${key} 是必需的配置项`
        };
      }

      // 最小值/长度验证
      if (rules.min !== undefined) {
        const minResult = this.validateMin(result.value, rules.min, type);
        if (!minResult.valid) {
          return { ...result, ...minResult };
        }
      }

      // 最大值/长度验证
      if (rules.max !== undefined) {
        const maxResult = this.validateMax(result.value, rules.max, type);
        if (!maxResult.valid) {
          return { ...result, ...maxResult };
        }
      }

      // 枚举值验证
      if (rules.enum) {
        const enumResult = this.validateEnum(result.value, rules.enum);
        if (!enumResult.valid) {
          return { ...result, ...enumResult };
        }
      }

      // 正则表达式验证
      if (rules.pattern) {
        const patternResult = this.validatePattern(result.value, rules.pattern, key);
        if (!patternResult.valid) {
          return { ...result, ...patternResult };
        }
      }

      // 自定义验证函数
      if (rules.custom && typeof rules.custom === 'function') {
        try {
          const customResult = rules.custom(result.value);
          if (customResult !== true) {
            return {
              ...result,
              valid: false,
              error: typeof customResult === 'string' ? customResult : `${key} 自定义验证失败`
            };
          }
        } catch (error) {
          return {
            ...result,
            valid: false,
            error: `${key} 自定义验证出错: ${error.message}`
          };
        }
      }

      return result;
    } catch (error) {
      return {
        valid: false,
        error: `验证 ${key} 时发生错误: ${error.message}`,
        value: null
      };
    }
  }

  /**
   * 验证数据类型
   * @param {any} value - 值
   * @param {string} type - 期望类型
   * @returns {Object} 验证结果
   */
  validateType(value, type) {
    if (value === null || value === undefined || value === '') {
      return { valid: true, value: null };
    }

    try {
      switch (type) {
        case 'string':
          return { valid: true, value: String(value) };

        case 'number':
          const num = Number(value);
          if (isNaN(num)) {
            return { valid: false, error: '无法转换为数字' };
          }
          return { valid: true, value: num };

        case 'boolean':
          if (typeof value === 'boolean') {
            return { valid: true, value };
          }
          if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (['true', '1', 'yes', 'on'].includes(lower)) {
              return { valid: true, value: true };
            }
            if (['false', '0', 'no', 'off'].includes(lower)) {
              return { valid: true, value: false };
            }
          }
          return { valid: false, error: '无法转换为布尔值' };

        case 'json':
          if (typeof value === 'object') {
            return { valid: true, value };
          }
          if (typeof value === 'string') {
            try {
              return { valid: true, value: JSON.parse(value) };
            } catch {
              return { valid: false, error: '无效的JSON格式' };
            }
          }
          return { valid: false, error: 'JSON必须是对象或字符串格式' };

        case 'url':
        case 'email':
        case 'array':
        case 'port':
        case 'positiveInteger':
        case 'nonNegativeInteger':
        case 'apiKey':
        case 'modelName':
        case 'llmProvider':
        case 'vectorDbProvider':
          // 这些类型使用专门的验证器
          const validator = this.getValidator(type);
          if (validator) {
            const result = validator.validate(value);
            if (result.valid) {
              return { valid: true, value: result.value || value };
            } else {
              return result;
            }
          }
          return { valid: true, value };

        default:
          return { valid: true, value };
      }
    } catch (error) {
      return { valid: false, error: `类型验证失败: ${error.message}` };
    }
  }

  /**
   * 验证最小值/长度
   * @param {any} value - 值
   * @param {number} min - 最小值
   * @param {string} type - 数据类型
   * @returns {Object} 验证结果
   */
  validateMin(value, min, type) {
    if (value === null || value === undefined) {
      return { valid: true };
    }

    if (type === 'number') {
      const num = Number(value);
      if (isNaN(num) || num < min) {
        return { valid: false, error: `数值不能小于 ${min}` };
      }
    } else {
      const length = String(value).length;
      if (length < min) {
        return { valid: false, error: `长度不能小于 ${min} 个字符` };
      }
    }

    return { valid: true };
  }

  /**
   * 验证最大值/长度
   * @param {any} value - 值
   * @param {number} max - 最大值
   * @param {string} type - 数据类型
   * @returns {Object} 验证结果
   */
  validateMax(value, max, type) {
    if (value === null || value === undefined) {
      return { valid: true };
    }

    if (type === 'number') {
      const num = Number(value);
      if (isNaN(num) || num > max) {
        return { valid: false, error: `数值不能大于 ${max}` };
      }
    } else {
      const length = String(value).length;
      if (length > max) {
        return { valid: false, error: `长度不能超过 ${max} 个字符` };
      }
    }

    return { valid: true };
  }

  /**
   * 验证枚举值
   * @param {any} value - 值
   * @param {Array} enumValues - 枚举值列表
   * @returns {Object} 验证结果
   */
  validateEnum(value, enumValues) {
    if (value === null || value === undefined) {
      return { valid: true };
    }

    if (Array.isArray(enumValues) && enumValues.includes(value)) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `值必须是以下选项之一: ${enumValues.join(', ')}`
    };
  }

  /**
   * 验证正则表达式
   * @param {any} value - 值
   * @param {string|RegExp} pattern - 正则表达式
   * @param {string} key - 配置键
   * @returns {Object} 验证结果
   */
  validatePattern(value, pattern, key) {
    if (value === null || value === undefined || value === '') {
      return { valid: true };
    }

    try {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      if (!regex.test(String(value))) {
        return { valid: false, error: `${key} 格式不正确` };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `正则表达式验证失败: ${error.message}` };
    }
  }

  /**
   * 验证配置变更请求
   * @param {Array} configs - 配置列表
   * @param {Object} schema - 配置架构
   * @returns {Object} 验证结果
   */
  validateConfigBatch(configs, schema = {}) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      validConfigs: []
    };

    for (const config of configs) {
      const { key, value, category = 'system' } = config;
      const configKey = `${category}.${key}`;

      // 获取配置定义
      const configDef = schema[configKey] || {};
      const rules = {
        type: configDef.type || 'string',
        required: configDef.required,
        validator: configDef.validator,
        min: configDef.min,
        max: configDef.max,
        enum: configDef.enum,
        pattern: configDef.pattern,
        custom: configDef.custom
      };

      const validation = this.validateValue(key, value, rules.type, rules);

      if (validation.valid) {
        results.validConfigs.push({
          ...config,
          value: validation.value
        });

        if (validation.warnings && validation.warnings.length > 0) {
          results.warnings.push(...validation.warnings.map(w => `${configKey}: ${w}`));
        }
      } else {
        results.valid = false;
        results.errors.push(`${configKey}: ${validation.error}`);
      }
    }

    return results;
  }

  /**
   * 获取配置模板定义
   * @returns {Object} 配置模板
   */
  getConfigSchema() {
    return {
      // LLM 相关配置
      'system.llm_provider': {
        type: 'llmProvider',
        required: false,
        description: 'LLM Provider'
      },
      'system.llm_model': {
        type: 'modelName',
        required: false,
        description: 'LLM模型名称'
      },
      'system.open_ai_key': {
        type: 'apiKey',
        required: false,
        isSecret: true,
        description: 'OpenAI API密钥'
      },
      'system.anthropic_api_key': {
        type: 'apiKey',
        required: false,
        isSecret: true,
        description: 'Anthropic API密钥'
      },

      // 向量数据库相关配置
      'system.vector_db': {
        type: 'vectorDbProvider',
        required: false,
        description: '向量数据库Provider'
      },
      'system.chroma_endpoint': {
        type: 'url',
        required: false,
        description: 'Chroma数据库端点'
      },
      'system.pinecone_api_key': {
        type: 'apiKey',
        required: false,
        isSecret: true,
        description: 'Pinecone API密钥'
      },

      // 系统配置
      'system.max_file_upload_size': {
        type: 'positiveInteger',
        required: false,
        description: '最大文件上传大小(MB)'
      },
      'system.enable_metrics': {
        type: 'boolean',
        required: false,
        description: '是否启用指标收集'
      },
      'system.support_email': {
        type: 'email',
        required: false,
        description: '技术支持邮箱'
      },

      // 嵌入模型配置
      'system.embedding_provider': {
        type: 'string',
        required: false,
        enum: ['native', 'openai', 'generic_openai', 'gemini', 'voyageai'],
        description: '嵌入模型Provider'
      },
      'system.embedding_model_max_chunk_length': {
        type: 'positiveInteger',
        required: false,
        description: '嵌入模型最大块长度'
      }
    };
  }
}

module.exports = ValidationService;