const fs = require('fs').promises;
const path = require('path');

/**
 * PromptX角色元数据生成和写入工具
 * 功能：生成metadata.json并写入角色目录
 *
 * 基于data-model.md的元数据格式规范
 */

class RoleMetadataWriter {
  /**
   * 生成角色元数据对象
   * @param {Object} options - 元数据选项
   * @param {string} options.roleId - 角色ID
   * @param {string} options.customName - 自定义名称
   * @param {string} options.customDescription - 自定义描述
   * @param {number} options.userId - 添加用户ID
   * @param {boolean} options.overwrite - 是否为覆盖操作
   * @returns {Object} 元数据对象
   */
  generateMetadata(options) {
    const {
      roleId,
      customName = null,
      customDescription = null,
      userId = null,
      overwrite = false
    } = options;

    const metadata = {
      roleId,
      customName,
      customDescription,
      addedAt: new Date().toISOString(),
      addedBy: userId,
      source: 'user',
      version: '1.0.0'
    };

    // 如果是覆盖操作，添加覆盖时间戳
    if (overwrite) {
      metadata.overwrittenAt = new Date().toISOString();
    }

    return metadata;
  }

  /**
   * 写入metadata.json到角色目录
   * @param {string} roleDir - 角色目录路径
   * @param {Object} metadata - 元数据对象
   * @returns {Promise<string>} metadata.json文件路径
   */
  async writeMetadata(roleDir, metadata) {
    try {
      const metadataPath = path.join(roleDir, 'metadata.json');

      // 格式化JSON（缩进2空格）
      const metadataJson = JSON.stringify(metadata, null, 2);

      // 写入文件
      await fs.writeFile(metadataPath, metadataJson, 'utf-8');

      console.log(`[MetadataWriter] 已写入metadata.json: ${metadataPath}`);
      return metadataPath;
    } catch (error) {
      console.error(`[MetadataWriter] 写入失败:`, error);
      throw new Error(`元数据写入失败: ${error.message}`);
    }
  }

  /**
   * 读取现有的metadata.json
   * @param {string} roleDir - 角色目录路径
   * @returns {Promise<Object|null>} 元数据对象，不存在则返回null
   */
  async readMetadata(roleDir) {
    try {
      const metadataPath = path.join(roleDir, 'metadata.json');
      const metadataJson = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(metadataJson);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // 文件不存在
      }
      console.error(`[MetadataWriter] 读取失败:`, error);
      throw new Error(`元数据读取失败: ${error.message}`);
    }
  }

  /**
   * 更新现有metadata.json
   * @param {string} roleDir - 角色目录路径
   * @param {Object} updates - 要更新的字段
   * @returns {Promise<Object>} 更新后的元数据对象
   */
  async updateMetadata(roleDir, updates) {
    try {
      // 读取现有元数据
      const existingMetadata = await this.readMetadata(roleDir);

      if (!existingMetadata) {
        throw new Error('元数据文件不存在，无法更新');
      }

      // 合并更新
      const updatedMetadata = {
        ...existingMetadata,
        ...updates,
        lastUpdatedAt: new Date().toISOString()
      };

      // 写回
      await this.writeMetadata(roleDir, updatedMetadata);

      return updatedMetadata;
    } catch (error) {
      console.error(`[MetadataWriter] 更新失败:`, error);
      throw new Error(`元数据更新失败: ${error.message}`);
    }
  }

  /**
   * 验证metadata.json格式
   * @param {Object} metadata - 元数据对象
   * @returns {boolean} 是否有效
   */
  validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }

    // 必需字段
    const requiredFields = ['roleId', 'addedAt', 'source', 'version'];
    for (const field of requiredFields) {
      if (!(field in metadata)) {
        console.error(`[MetadataWriter] 缺少必需字段: ${field}`);
        return false;
      }
    }

    // 验证source字段值
    if (!['user', 'system', 'project'].includes(metadata.source)) {
      console.error(`[MetadataWriter] 无效的source值: ${metadata.source}`);
      return false;
    }

    return true;
  }
}

module.exports = new RoleMetadataWriter();
