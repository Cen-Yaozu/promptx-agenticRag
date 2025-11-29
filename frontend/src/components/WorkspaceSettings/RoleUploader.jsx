import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, UploadSimple, FileZip, Check, Warning } from "@phosphor-icons/react";
import WorkspacePromptXRoles from "@/models/workspacePromptXRoles";

/**
 * PromptX角色上传组件
 * 支持ZIP文件拖拽/选择上传，自定义名称和描述
 */
const RoleUploader = ({ workspaceId, isOpen, onClose, onUploadSuccess }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 重置表单
  const resetForm = () => {
    setSelectedFile(null);
    setCustomName('');
    setCustomDescription('');
    setUploadProgress(0);
    setError(null);
    setSuccess(false);
  };

  // 处理文件选择
  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 处理文件拖放
  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  // 验证和处理文件
  const processFile = (file) => {
    setError(null);

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('仅支持ZIP格式的角色包文件');
      return;
    }

    // 验证文件大小（10MB）
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`文件过大（${(file.size / 1024 / 1024).toFixed(2)}MB），最大支持10MB`);
      return;
    }

    setSelectedFile(file);
  };

  // 处理上传
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('请先选择一个角色包文件');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      setUploadProgress(30);

      const result = await WorkspacePromptXRoles.uploadRolePackage(
        workspaceId,
        selectedFile,
        customName,
        customDescription
      );

      setUploadProgress(90);

      if (result.error) {
        throw new Error(result.error);
      }

      setUploadProgress(100);
      setSuccess(true);

      // 成功后延迟关闭对话框
      setTimeout(() => {
        if (onUploadSuccess) {
          onUploadSuccess(result.data);
        }
        handleClose();
      }, 1500);

    } catch (err) {
      console.error('角色上传失败:', err);
      setError(err.message || '上传失败，请重试');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  // 关闭对话框
  const handleClose = () => {
    if (!uploading) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            上传自定义角色
          </h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-4">
          {/* 文件上传区域 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              选择角色包文件
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-zinc-600 hover:border-gray-400'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />

              {selectedFile ? (
                <div className="space-y-2">
                  <FileZip size={48} className="mx-auto text-blue-600" />
                  <p className="text-gray-900 dark:text-white font-medium">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                  {!uploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      更换文件
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <UploadSimple size={48} className="mx-auto text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400">
                    拖拽ZIP文件到此处，或点击选择文件
                  </p>
                  <p className="text-xs text-gray-500">
                    支持.zip格式，最大10MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 自定义名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              自定义名称（可选）
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              disabled={uploading}
              placeholder="例如：我的法律顾问"
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg
                         bg-white dark:bg-zinc-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* 自定义描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              自定义描述（可选）
            </label>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              disabled={uploading}
              placeholder="例如：专门用于合同审查的定制化法律顾问角色"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg
                         bg-white dark:bg-zinc-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          {/* 上传进度 */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>上传中...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <Warning size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <Check size={20} className="text-green-600" />
              <p className="text-sm text-green-600 dark:text-green-400">
                角色上传成功！
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-zinc-700">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700
                       rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading || success}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                上传中...
              </>
            ) : (
              <>
                <UploadSimple size={18} />
                开始上传
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleUploader;
