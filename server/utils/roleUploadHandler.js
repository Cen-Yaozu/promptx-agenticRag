const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');
const RolePackageValidator = require('./rolePackageValidator');
const fileSystemHandler = require('./fileSystemHandler');
const roleMetadataWriter = require('./roleMetadataWriter');

/**
 * PromptX角色上传核心处理器
 * 功能：接收→验证→解压→复制→启用
 *
 * 基于data-model.md的上传流程设计
 */

class RoleUploadHandler {
  constructor() {
    this.validator = new RolePackageValidator();
    this.roleResourceDir = path.join(os.homedir(), '.promptx', 'resource', 'role');
  }

  /**
   * 完整的角色上传处理流程
   * @param {Object} options - 上传选项
   * @param {string} options.zipPath - 上传的ZIP文件路径
   * @param {number} options.workspaceId - 工作区ID
   * @param {string} options.customName - 自定义角色名称（可选）
   * @param {string} options.customDescription - 自定义角色描述（可选）
   * @param {string} options.customId - 自定义角色ID（用于解决冲突，可选）
   * @param {number} options.userId - 上传用户ID
   * @returns {Promise<Object>} 上传结果 { success, roleId, rolePath, metadata }
   */
  async processUpload(options) {
    const { zipPath, workspaceId, customName, customDescription, customId, userId } = options;

    let tempExtractDir = null;
    let finalRoleId = null;

    try {
      // Step 1: 生成临时解压目录
      const tempBaseDir = path.dirname(zipPath);
      tempExtractDir = fileSystemHandler.generateTempDirName(tempBaseDir, 'role-extract');

      console.log(`[RoleUpload] Step 1: 开始验证ZIP文件`);
      // Step 2: 完整验证ZIP包（格式、大小、路径遍历）
      await this.validator.validatePackage(zipPath, tempExtractDir);

      console.log(`[RoleUpload] Step 2: 解压ZIP到临时目录`);
      // Step 3: 安全解压ZIP到临时目录
      const zip = new AdmZip(zipPath);
      await fileSystemHandler.safeExtractZip(zip, tempExtractDir);

      console.log(`[RoleUpload] Step 3: 验证.role.md文件`);
      // Step 4: 验证DPML格式并提取roleId（返回actualDir用于处理嵌套结构）
      const { roleId, roleMdPath, actualDir } = await this.validator.validateRoleMdFile(tempExtractDir);

      // Step 5: 确定最终roleId（如果提供了customId则使用）
      finalRoleId = customId || roleId;

      console.log(`[RoleUpload] Step 4: 检查角色冲突 (roleId: ${finalRoleId})`);
      // Step 6: 检查角色冲突
      const { Workspace } = require('../models/workspace');
      const conflictCheck = await Workspace.checkRoleConflict(workspaceId, finalRoleId);

      if (conflictCheck.conflict) {
        const error = new Error('角色ID已存在');
        error.code = 'ROLE_CONFLICT';
        error.conflictInfo = conflictCheck;
        throw error;
      }

      console.log(`[RoleUpload] Step 5: 复制角色文件到目标目录`);
      // Step 7: 复制到目标目录 (~/.promptx/resource/role/{roleId}/)
      const targetRoleDir = path.join(this.roleResourceDir, finalRoleId);

      // 确保父目录存在
      await fileSystemHandler.checkWritePermission(this.roleResourceDir);

      // 原子性复制（使用actualDir而不是tempExtractDir，以支持嵌套ZIP结构）
      await fileSystemHandler.atomicMoveDirectory(actualDir, targetRoleDir);
      tempExtractDir = null; // 移动后不再需要清理

      console.log(`[RoleUpload] Step 6: 写入metadata.json`);
      // Step 8: 写入metadata.json
      const metadata = roleMetadataWriter.generateMetadata({
        roleId: finalRoleId,
        customName,
        customDescription,
        userId,
        overwrite: false
      });

      await roleMetadataWriter.writeMetadata(targetRoleDir, metadata);

      console.log(`[RoleUpload] Step 7: 清理临时文件`);
      // Step 9: 清理上传的ZIP文件
      await fileSystemHandler.cleanupTempFiles(zipPath);

      console.log(`[RoleUpload] 上传完成: ${finalRoleId}`);
      return {
        success: true,
        roleId: finalRoleId,
        rolePath: targetRoleDir,
        metadata
      };

    } catch (error) {
      console.error(`[RoleUpload] 上传失败:`, error);

      // 清理所有临时文件和部分写入的数据
      await this.cleanup(zipPath, tempExtractDir, finalRoleId);

      throw error;
    }
  }

  /**
   * 清理临时文件和失败的上传数据
   * @param {string} zipPath - ZIP文件路径
   * @param {string} tempExtractDir - 临时解压目录
   * @param {string} roleId - 角色ID（如果已复制到目标目录）
   */
  async cleanup(zipPath, tempExtractDir, roleId) {
    console.log(`[RoleUpload] 开始清理临时文件`);

    try {
      // 清理临时文件
      await fileSystemHandler.cleanupTempFiles(zipPath, tempExtractDir);

      // 如果已复制到目标目录但后续步骤失败，也清理目标目录
      if (roleId) {
        const targetRoleDir = path.join(this.roleResourceDir, roleId);
        await fileSystemHandler.cleanupTempFiles(targetRoleDir);
      }

      console.log(`[RoleUpload] 临时文件清理完成`);
    } catch (cleanupError) {
      console.error(`[RoleUpload] 清理失败:`, cleanupError.message);
      // 清理错误不应阻止主要错误的抛出
    }
  }

  /**
   * 覆盖现有角色（User Story 2）
   * @param {Object} options - 覆盖选项
   * @returns {Promise<Object>} 覆盖结果
   */
  async overwriteExistingRole(options) {
    const { zipPath, workspaceId, roleId, customName, customDescription, userId } = options;

    let tempExtractDir = null;

    try {
      console.log(`[RoleUpload] 开始覆盖角色: ${roleId}`);

      // Step 1: 验证和解压新的ZIP包
      const tempBaseDir = path.dirname(zipPath);
      tempExtractDir = fileSystemHandler.generateTempDirName(tempBaseDir, 'role-overwrite');

      await this.validator.validatePackage(zipPath, tempExtractDir);

      const zip = new AdmZip(zipPath);
      await fileSystemHandler.safeExtractZip(zip, tempExtractDir);

      // 验证并获取实际的角色目录（支持嵌套结构）
      const { actualDir } = await this.validator.validateRoleMdFile(tempExtractDir);

      // Step 2: 备份旧角色目录
      const targetRoleDir = path.join(this.roleResourceDir, roleId);
      const backupDir = `${targetRoleDir}.backup-${Date.now()}`;

      try {
        await fs.rename(targetRoleDir, backupDir);
        console.log(`[RoleUpload] 已备份旧角色到: ${backupDir}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // 旧目录不存在，继续
      }

      // Step 3: 复制新角色文件（使用actualDir支持嵌套ZIP结构）
      await fileSystemHandler.atomicMoveDirectory(actualDir, targetRoleDir);
      tempExtractDir = null;

      // Step 4: 写入metadata.json
      const metadata = roleMetadataWriter.generateMetadata({
        roleId,
        customName,
        customDescription,
        userId,
        overwrite: true
      });

      await roleMetadataWriter.writeMetadata(targetRoleDir, metadata);

      // Step 5: 清理临时文件和备份
      await fileSystemHandler.cleanupTempFiles(zipPath, backupDir);

      console.log(`[RoleUpload] 角色覆盖完成: ${roleId}`);
      return {
        success: true,
        roleId,
        rolePath: targetRoleDir,
        metadata,
        overwritten: true
      };

    } catch (error) {
      console.error(`[RoleUpload] 覆盖失败:`, error);
      await this.cleanup(zipPath, tempExtractDir, null);
      throw error;
    }
  }
}

module.exports = new RoleUploadHandler();
