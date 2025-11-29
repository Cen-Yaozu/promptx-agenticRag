const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs').promises;

/**
 * PromptX角色包验证工具类
 * 功能：路径遍历检测、ZIP炸弹检测、DPML格式验证
 *
 * 基于research.md的技术决策：
 * - 使用adm-zip（已有依赖）
 * - 手动实现路径遍历检测
 * - 压缩比限制100:1
 * - 解压后大小限制50MB
 */

class RolePackageValidator {
  constructor(options = {}) {
    this.maxUncompressedSize = options.maxUncompressedSize || 50 * 1024 * 1024; // 50MB
    this.maxCompressionRatio = options.maxCompressionRatio || 100; // 100:1
    this.maxCompressedSize = options.maxCompressedSize || 10 * 1024 * 1024; // 10MB
  }

  /**
   * 验证ZIP格式（magic number检查）
   * @param {string} zipPath - ZIP文件路径
   * @returns {Promise<boolean>}
   */
  async validateZipFormat(zipPath) {
    try {
      const buffer = await fs.readFile(zipPath);

      // ZIP文件magic number: 50 4B (PK)
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
        throw new Error('无效的ZIP文件格式：文件签名不匹配');
      }

      // 尝试加载ZIP（如果损坏会抛出错误）
      new AdmZip(zipPath);

      return true;
    } catch (error) {
      if (error.message.includes('无效的ZIP文件格式')) {
        throw error;
      }
      throw new Error(`ZIP文件损坏或无法读取：${error.message}`);
    }
  }

  /**
   * 检测ZIP炸弹（压缩比异常）
   * @param {string} zipPath - ZIP文件路径
   * @returns {Promise<Object>} 检测结果
   */
  async detectZipBomb(zipPath) {
    try {
      const stats = await fs.stat(zipPath);
      const compressedSize = stats.size;

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // 计算解压后总大小
      let uncompressedSize = 0;
      for (const entry of entries) {
        uncompressedSize += entry.header.size;
      }

      // 检查1: 解压后总大小超限
      if (uncompressedSize > this.maxUncompressedSize) {
        throw new Error(
          `解压后文件过大，不应超过50MB（实际：${(uncompressedSize / 1024 / 1024).toFixed(2)}MB）`
        );
      }

      // 检查2: 压缩比异常（ZIP炸弹）
      const compressionRatio = uncompressedSize / compressedSize;
      if (compressionRatio > this.maxCompressionRatio) {
        throw new Error(
          `检测到ZIP炸弹：压缩比${compressionRatio.toFixed(2)}:1超过限制${this.maxCompressionRatio}:1`
        );
      }

      return {
        compressedSize,
        uncompressedSize,
        compressionRatio: compressionRatio.toFixed(2),
        safe: true
      };
    } catch (error) {
      if (error.message.includes('检测到ZIP炸弹') || error.message.includes('解压后文件过大')) {
        throw error;
      }
      throw new Error(`ZIP炸弹检测失败：${error.message}`);
    }
  }

  /**
   * 路径遍历攻击检测
   * @param {string} zipPath - ZIP文件路径
   * @param {string} targetDir - 目标解压目录
   * @returns {Promise<void>}
   */
  async detectPathTraversal(zipPath, targetDir) {
    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      for (const entry of entries) {
        const entryName = entry.entryName;

        // 检测1: 包含../或..\（Windows）
        if (entryName.includes('../') || entryName.includes('..\\')) {
          throw new Error(`路径遍历攻击检测：${entryName}`);
        }

        // 检测2: 绝对路径（/开头或C:\等）
        if (path.isAbsolute(entryName)) {
          throw new Error(`绝对路径检测：${entryName}`);
        }

        // 检测3: 规范化后路径是否逃逸目标目录
        const resolvedPath = path.resolve(targetDir, entryName);
        if (!resolvedPath.startsWith(path.resolve(targetDir))) {
          throw new Error(`路径逃逸检测：${entryName} → ${resolvedPath}`);
        }
      }
    } catch (error) {
      if (error.message.includes('路径遍历') || error.message.includes('路径逃逸') || error.message.includes('绝对路径')) {
        throw error;
      }
      throw new Error(`路径遍历检测失败：${error.message}`);
    }
  }

  /**
   * 验证.role.md文件（DPML格式）
   * 支持两种ZIP结构：
   * 1. 扁平结构：ZIP根目录直接包含 {roleId}.role.md
   * 2. 嵌套结构：ZIP根目录包含一个文件夹，文件夹内有 {roleId}.role.md
   *
   * @param {string} extractDir - 解压后的目录
   * @returns {Promise<Object>} { roleId, roleMdPath, actualDir }
   */
  async validateRoleMdFile(extractDir) {
    try {
      let files = await fs.readdir(extractDir, { withFileTypes: true });

      // 首先在根目录查找.role.md文件
      let roleMdFile = files.find(f => f.isFile() && f.name.endsWith('.role.md'));
      let actualDir = extractDir;

      // 如果根目录没有找到，检查是否有单个子目录
      if (!roleMdFile) {
        // 过滤掉系统文件和隐藏文件
        const directories = files.filter(f =>
          f.isDirectory() &&
          !f.name.startsWith('.') &&
          !f.name.startsWith('__MACOSX')
        );

        if (directories.length === 1) {
          // 有且仅有一个子目录，进入该目录查找
          actualDir = path.join(extractDir, directories[0].name);
          console.log(`[RoleUpload] ZIP包包含顶层目录 "${directories[0].name}"，进入子目录查找角色文件`);

          files = await fs.readdir(actualDir, { withFileTypes: true });
          roleMdFile = files.find(f => f.isFile() && f.name.endsWith('.role.md'));
        }
      }

      if (!roleMdFile) {
        // 提供更友好的错误信息
        const availableFiles = files
          .filter(f => f.isFile())
          .map(f => f.name)
          .join(', ');
        throw new Error(
          `无效的角色包：缺少.role.md主文件。` +
          `可用文件: ${availableFiles || '(空)'}`
        );
      }

      // 提取roleId（文件名去除.role.md后缀）
      const roleId = roleMdFile.name.replace('.role.md', '');

      // 验证roleId格式（仅小写字母、数字、连字符）
      const roleIdPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      if (!roleIdPattern.test(roleId)) {
        throw new Error(
          `角色ID格式错误："${roleId}"。仅允许小写字母、数字和连字符，如：legal-advisor`
        );
      }

      // 验证roleId长度
      if (roleId.length < 3 || roleId.length > 50) {
        throw new Error(`角色ID长度必须在3-50字符之间（当前：${roleId.length}）`);
      }

      // 读取.role.md内容验证DPML格式
      const roleMdPath = path.join(actualDir, roleMdFile.name);
      const content = await fs.readFile(roleMdPath, 'utf-8');

      // 简单的DPML标签验证（检查是否包含<role>根标签）
      if (!content.includes('<role>') || !content.includes('</role>')) {
        throw new Error('无效的DPML格式：缺少<role>根标签');
      }

      console.log(`[RoleUpload] 找到角色文件: ${roleMdFile.name}, 角色ID: ${roleId}`);
      return { roleId, roleMdPath, actualDir };
    } catch (error) {
      if (error.message.includes('无效的角色包') || error.message.includes('角色ID格式错误') || error.message.includes('DPML格式')) {
        throw error;
      }
      throw new Error(`角色文件验证失败：${error.message}`);
    }
  }

  /**
   * 验证文件大小（上传大小和解压后大小）
   * @param {string} zipPath - ZIP文件路径
   * @returns {Promise<void>}
   */
  async validateFileSizes(zipPath) {
    try {
      const stats = await fs.stat(zipPath);
      const compressedSize = stats.size;

      // 检查压缩文件大小（10MB限制）
      if (compressedSize > this.maxCompressedSize) {
        throw new Error(
          `文件过大，角色包不应超过10MB（实际：${(compressedSize / 1024 / 1024).toFixed(2)}MB）`
        );
      }

      // 解压后大小检查在detectZipBomb中已包含
      return true;
    } catch (error) {
      if (error.message.includes('文件过大')) {
        throw error;
      }
      throw new Error(`文件大小验证失败：${error.message}`);
    }
  }

  /**
   * 完整验证流程
   * @param {string} zipPath - ZIP文件路径
   * @param {string} targetDir - 目标解压目录
   * @returns {Promise<Object>} 验证结果
   */
  async validatePackage(zipPath, targetDir) {
    try {
      // Step 1: ZIP格式验证
      await this.validateZipFormat(zipPath);

      // Step 2: 文件大小验证
      await this.validateFileSizes(zipPath);

      // Step 3: ZIP炸弹检测
      const sizeCheck = await this.detectZipBomb(zipPath);

      // Step 4: 路径遍历检测
      await this.detectPathTraversal(zipPath, targetDir);

      return {
        valid: true,
        sizeCheck
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = RolePackageValidator;
