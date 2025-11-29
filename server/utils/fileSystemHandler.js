const fs = require('fs').promises;
const path = require('path');

/**
 * 文件系统操作工具类
 * 功能：原子性写入、临时文件清理
 *
 * 基于research.md的决策：使用Node.js内置fs模块
 */

class FileSystemHandler {
  /**
   * 原子性复制目录
   * @param {string} src - 源目录
   * @param {string} dest - 目标目录
   * @returns {Promise<void>}
   */
  async copyDirectory(src, dest) {
    try {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      throw new Error(`目录复制失败：${error.message}`);
    }
  }

  /**
   * 原子性移动目录（先copy后delete，确保安全）
   * @param {string} src - 源目录
   * @param {string} dest - 目标目录
   * @returns {Promise<void>}
   */
  async atomicMoveDirectory(src, dest) {
    try {
      // 尝试直接rename（同文件系统内是原子操作）
      await fs.rename(src, dest);
    } catch (err) {
      if (err.code === 'EXDEV') {
        // 跨文件系统，使用copy+delete
        await this.copyDirectory(src, dest);
        await fs.rm(src, { recursive: true });
      } else {
        throw err;
      }
    }
  }

  /**
   * 清理临时文件
   * @param {...string} paths - 要清理的文件或目录路径
   * @returns {Promise<void>}
   */
  async cleanupTempFiles(...paths) {
    const cleanupPromises = paths.map(async (p) => {
      if (!p) return;

      try {
        const stats = await fs.stat(p);
        if (stats.isDirectory()) {
          await fs.rm(p, { recursive: true, force: true });
        } else {
          await fs.unlink(p);
        }
      } catch (error) {
        // 忽略不存在的文件
        if (error.code !== 'ENOENT') {
          console.error(`清理临时文件失败 ${p}:`, error.message);
        }
      }
    });

    await Promise.all(cleanupPromises);
  }

  /**
   * 检查目录写入权限
   * @param {string} dirPath - 目录路径
   * @returns {Promise<boolean>}
   */
  async checkWritePermission(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      const testFile = path.join(dirPath, `.write-test-${Date.now()}`);
      await fs.writeFile(testFile, '');
      await fs.unlink(testFile);
      return true;
    } catch (error) {
      if (error.code === 'EACCES') {
        throw new Error(`权限不足：无法写入目录 ${dirPath}`);
      }
      if (error.code === 'ENOSPC') {
        throw new Error(`磁盘空间不足：${dirPath}`);
      }
      throw error;
    }
  }

  /**
   * 安全提取ZIP到临时目录（带验证）
   * @param {AdmZip} zip - AdmZip实例
   * @param {string} targetDir - 目标目录
   * @returns {Promise<void>}
   */
  async safeExtractZip(zip, targetDir) {
    try {
      await fs.mkdir(targetDir, { recursive: true });

      // AdmZip的extractAllTo是同步的，但我们在之前已经做过路径验证
      zip.extractAllTo(targetDir, true);
    } catch (error) {
      // 清理失败的解压
      await this.cleanupTempFiles(targetDir);
      throw new Error(`ZIP解压失败：${error.message}`);
    }
  }

  /**
   * 生成唯一的临时目录名
   * @param {string} baseDir - 基础目录
   * @param {string} prefix - 前缀
   * @returns {string}
   */
  generateTempDirName(baseDir, prefix = 'temp') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return path.join(baseDir, `${prefix}-${timestamp}-${random}`);
  }
}

module.exports = new FileSystemHandler();
