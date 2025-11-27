const crypto = require('crypto');

/**
 * 配置加密服务
 * 负责敏感配置的加密和解密操作
 */
class EncryptionService {
  constructor(options = {}) {
    // 加密算法
    this.algorithm = options.algorithm || 'aes-256-gcm';

    // 从环境变量获取加密密钥
    this.encryptionKey = this.getEncryptionKey();

    // 盐值长度
    this.saltLength = options.saltLength || 32;

    // IV长度
    this.ivLength = this.getIVLength();

    // 认证标签长度
    this.authTagLength = 16;

    // 密钥过期时间 (毫秒)
    this.keyRotationInterval = options.keyRotationInterval || 30 * 24 * 60 * 60 * 1000; // 30天

    // 加密配置键名模式
    this.encryptedKeyPattern = options.encryptedKeyPattern || /(api[_-]?key|secret|password|token|credential)/i;
  }

  /**
   * 获取加密密钥
   * @returns {Buffer} 加密密钥
   */
  getEncryptionKey() {
    // 优先使用专门的配置加密密钥
    let key = process.env.DEECONFIG_ENCRYPTION_KEY;

    // 如果没有，使用JWT密钥作为后备
    if (!key) {
      key = process.env.JWT_SECRET;
    }

    // 如果还没有，使用系统密钥
    if (!key) {
      key = 'default-deeconfig-encryption-key-change-in-production';
      console.warn('⚠️  使用默认加密密钥，生产环境中请设置 DEECONFIG_ENCRYPTION_KEY 环境变量');
    }

    // 将密钥转换为32字节的Buffer
    return crypto.createHash('sha256').update(key).digest();
  }

  /**
   * 获取IV长度
   * @returns {number} IV长度
   */
  getIVLength() {
    switch (this.algorithm) {
      case 'aes-256-gcm':
      case 'aes-192-gcm':
      case 'aes-128-gcm':
        return 16;
      case 'aes-256-cbc':
      case 'aes-192-cbc':
      case 'aes-128-cbc':
        return 16;
      default:
        return 16;
    }
  }

  /**
   * 检查配置键是否需要加密
   * @param {string} key - 配置键名
   * @param {boolean} isEncrypted - 是否已标记为加密
   * @returns {boolean} 是否需要加密
   */
  shouldEncrypt(key, isEncrypted = false) {
    // 如果已经标记为加密，返回true
    if (isEncrypted) {
      return true;
    }

    // 检查键名模式
    return this.encryptedKeyPattern.test(key);
  }

  /**
   * 加密字符串
   * @param {string} text - 要加密的文本
   * @returns {string} 加密后的字符串
   */
  encrypt(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    try {
      // 生成随机盐值
      const salt = crypto.randomBytes(this.saltLength);

      // 生成随机IV
      const iv = crypto.randomBytes(this.ivLength);

      // 使用盐值和密钥派生函数生成实际加密密钥
      const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 100000, 32, 'sha256');

      // 创建加密器
      const cipher = crypto.createCipher(this.algorithm, key);

      // 设置IV (对于某些算法)
      if (this.algorithm.includes('gcm')) {
        const cipher = crypto.createCipher(this.algorithm, key);
        cipher.setAAD(Buffer.from('deeconfig', 'utf8'));
      }

      // 加密数据
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // 获取认证标签 (对于GCM模式)
      let authTag = '';
      if (this.algorithm.includes('gcm')) {
        authTag = cipher.getAuthTag().toString('hex');
      }

      // 组合所有组件
      const result = [
        this.algorithm,
        salt.toString('hex'),
        iv.toString('hex'),
        authTag,
        encrypted
      ].filter(part => part).join(':');

      return result;
    } catch (error) {
      console.error('加密失败:', error.message);
      throw new Error(`加密失败: ${error.message}`);
    }
  }

  /**
   * 解密字符串
   * @param {string} encryptedText - 加密的文本
   * @returns {string} 解密后的字符串
   */
  decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return encryptedText;
    }

    // 检查是否是加密格式
    if (!this.isEncrypted(encryptedText)) {
      return encryptedText;
    }

    try {
      // 解析加密字符串
      const parts = encryptedText.split(':');

      if (parts.length < 3) {
        throw new Error('无效的加密格式');
      }

      let algorithm, salt, iv, authTag, encrypted;

      if (parts.length === 5) {
        // 新格式: algorithm:salt:iv:authTag:encrypted
        [algorithm, salt, iv, authTag, encrypted] = parts;
      } else if (parts.length === 4) {
        // 旧格式: algorithm:salt:iv:encrypted (无authTag)
        [algorithm, salt, iv, encrypted] = parts;
        authTag = '';
      } else {
        throw new Error('不支持的加密格式版本');
      }

      // 验证算法
      if (algorithm !== this.algorithm) {
        console.warn(`加密算法不匹配: 期望 ${this.algorithm}, 实际 ${algorithm}`);
      }

      // 转换组件
      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = authTag ? Buffer.from(authTag, 'hex') : null;

      // 派生密钥
      const key = crypto.pbkdf2Sync(this.encryptionKey, saltBuffer, 100000, 32, 'sha256');

      // 创建解密器
      const decipher = crypto.createDecipher(algorithm, key);

      // 设置认证标签 (对于GCM模式)
      if (authTagBuffer && algorithm.includes('gcm')) {
        decipher.setAuthTag(authTagBuffer);
        decipher.setAAD(Buffer.from('deeconfig', 'utf8'));
      }

      // 解密数据
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('解密失败:', error.message);
      throw new Error(`解密失败: ${error.message}`);
    }
  }

  /**
   * 检查字符串是否已加密
   * @param {string} text - 文本
   * @returns {boolean} 是否已加密
   */
  isEncrypted(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }

    // 检查加密格式: algorithm:salt:iv[:authTag]:data
    const parts = text.split(':');
    return parts.length >= 3 && parts[0].includes('aes');
  }

  /**
   * 加密配置对象
   * @param {Object} configs - 配置对象
   * @returns {Object} 加密后的配置对象
   */
  encryptConfigs(configs) {
    const encrypted = {};

    for (const [key, value] of Object.entries(configs)) {
      if (this.shouldEncrypt(key)) {
        try {
          encrypted[key] = this.encrypt(String(value));
        } catch (error) {
          console.error(`加密配置 ${key} 失败:`, error.message);
          encrypted[key] = value; // 失败时保留原值
        }
      } else {
        encrypted[key] = value;
      }
    }

    return encrypted;
  }

  /**
   * 解密配置对象
   * @param {Object} encryptedConfigs - 加密的配置对象
   * @returns {Object} 解密后的配置对象
   */
  decryptConfigs(encryptedConfigs) {
    const decrypted = {};

    for (const [key, value] of Object.entries(encryptedConfigs)) {
      try {
        decrypted[key] = this.decrypt(value);
      } catch (error) {
        console.error(`解密配置 ${key} 失败:`, error.message);
        decrypted[key] = value; // 失败时保留原值
      }
    }

    return decrypted;
  }

  /**
   * 安全地比较两个字符串 (防止时序攻击)
   * @param {string} a - 字符串a
   * @param {string} b - 字符串b
   * @returns {boolean} 是否相等
   */
  safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * 生成随机盐值
   * @param {number} length - 盐值长度
   * @returns {string} 十六进制盐值
   */
  generateSalt(length = this.saltLength) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 生成随机token
   * @param {number} length - token长度
   * @returns {string} 随机token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * 哈希字符串
   * @param {string} text - 要哈希的文本
   * @param {string} salt - 盐值
   * @returns {string} 哈希值
   */
  hash(text, salt = null) {
    const hash = crypto.createHash('sha256');
    if (salt) {
      hash.update(salt);
    }
    hash.update(text);
    return hash.digest('hex');
  }

  /**
   * 验证哈希值
   * @param {string} text - 原始文本
   * @param {string} hash - 哈希值
   * @param {string} salt - 盐值
   * @returns {boolean} 是否匹配
   */
  verifyHash(text, hash, salt = null) {
    const computedHash = this.hash(text, salt);
    return this.safeCompare(computedHash, hash);
  }

  /**
   * 检查加密密钥是否需要轮换
   * @param {Date} lastRotation - 上次轮换时间
   * @returns {boolean} 是否需要轮换
   */
  shouldRotateKey(lastRotation) {
    if (!lastRotation) {
      return true;
    }

    const now = new Date();
    const timeSinceRotation = now - lastRotation;

    return timeSinceRotation >= this.keyRotationInterval;
  }

  /**
   * 使用新密钥重新加密数据
   * @param {string} encryptedData - 使用旧密钥加密的数据
   * @param {string} oldKey - 旧密钥
   * @param {string} newKey - 新密钥
   * @returns {string} 使用新密钥加密的数据
   */
  rotateEncryption(encryptedData, oldKey, newKey) {
    try {
      // 使用旧密钥解密
      const oldDecryptionKey = crypto.createHash('sha256').update(oldKey).digest();
      const decrypted = this.decryptWithKey(encryptedData, oldDecryptionKey);

      // 使用新密钥加密
      const newEncryptionKey = crypto.createHash('sha256').update(newKey).digest();
      const reencrypted = this.encryptWithKey(decrypted, newEncryptionKey);

      return reencrypted;
    } catch (error) {
      throw new Error(`密钥轮换失败: ${error.message}`);
    }
  }

  /**
   * 使用指定密钥解密
   * @param {string} encryptedText - 加密文本
   * @param {Buffer} key - 解密密钥
   * @returns {string} 解密文本
   */
  decryptWithKey(encryptedText, key) {
    // 临时替换密钥进行解密
    const originalKey = this.encryptionKey;
    this.encryptionKey = key;

    try {
      const result = this.decrypt(encryptedText);
      return result;
    } finally {
      // 恢复原始密钥
      this.encryptionKey = originalKey;
    }
  }

  /**
   * 使用指定密钥加密
   * @param {string} text - 原始文本
   * @param {Buffer} key - 加密密钥
   * @returns {string} 加密文本
   */
  encryptWithKey(text, key) {
    // 临时替换密钥进行加密
    const originalKey = this.encryptionKey;
    this.encryptionKey = key;

    try {
      const result = this.encrypt(text);
      return result;
    } finally {
      // 恢复原始密钥
      this.encryptionKey = originalKey;
    }
  }

  /**
   * 获取加密服务状态
   * @returns {Object} 服务状态
   */
  getStatus() {
    return {
      algorithm: this.algorithm,
      keyLength: this.encryptionKey.length,
      ivLength: this.ivLength,
      hasCustomKey: !!process.env.DEECONFIG_ENCRYPTION_KEY,
      keyRotationInterval: this.keyRotationInterval,
      encryptedKeyPattern: this.encryptedKeyPattern.source
    };
  }

  /**
   * 验证加密配置
   * @returns {Object} 验证结果
   */
  validateConfiguration() {
    const issues = [];

    // 检查密钥强度
    if (this.encryptionKey.length < 32) {
      issues.push('加密密钥长度不足，建议使用至少32字节密钥');
    }

    // 检查是否使用默认密钥
    if (!process.env.DEECONFIG_ENCRYPTION_KEY && !process.env.JWT_SECRET) {
      issues.push('使用默认加密密钥，生产环境不安全');
    }

    // 检查算法
    const supportedAlgorithms = ['aes-256-gcm', 'aes-256-cbc'];
    if (!supportedAlgorithms.includes(this.algorithm)) {
      issues.push(`不支持的加密算法: ${this.algorithm}`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

module.exports = EncryptionService;