import React from "react";
import { Check, Triangle, X, Info, Clock } from "@phosphor-icons/react";

/**
 * 配置状态显示组件
 * 显示当前配置状态和保存结果
 */
const ConfigStatus = ({ lastSaveResult = null }) => {
  const getStatusIcon = (type) => {
    switch (type) {
      case 'success':
        return <Check size={20} className="text-green-500" />;
      case 'warning':
        return <Triangle size={20} className="text-yellow-500" />;
      case 'error':
        return <X size={20} className="text-red-500" />;
      case 'info':
      default:
        return <Info size={20} className="text-blue-500" />;
    }
  };

  const getStatusType = (result) => {
    if (!result) return 'info';
    if (result.success) {
      return result.warnings?.length > 0 ? 'warning' : 'success';
    }
    return 'error';
  };

  const getStatusMessage = (result) => {
    if (!result) return '准备就绪，可以进行配置';

    if (result.success) {
      if (result.warnings?.length > 0) {
        return `配置已保存，但有 ${result.warnings.length} 个警告`;
      }
      return '配置保存成功！';
    }

    return result.error || '保存失败';
  };

  const getDetailsMessage = (result) => {
    if (!result || !result.success) return null;

    const details = [];

    if (result.appliedChanges?.systemSettings?.length > 0) {
      details.push(`系统配置更新: ${result.appliedChanges.systemSettings.length} 项`);
    }

    if (result.appliedChanges?.workspaceSettings?.length > 0) {
      details.push(`工作空间配置更新: ${result.appliedChanges.workspaceSettings.length} 项`);
    }

    if (result.duration) {
      details.push(`处理时间: ${result.duration}ms`);
    }

    return details.length > 0 ? details.join(' | ') : null;
  };

  const statusType = getStatusType(lastSaveResult);
  const statusMessage = getStatusMessage(lastSaveResult);
  const detailsMessage = getDetailsMessage(lastSaveResult);

  return (
    <div className={`p-4 rounded-lg border ${
      statusType === 'success' ? 'border-green-500/20 bg-green-500/5' :
      statusType === 'warning' ? 'border-yellow-500/20 bg-yellow-500/5' :
      statusType === 'error' ? 'border-red-500/20 bg-red-500/5' :
      'border-blue-500/20 bg-blue-500/5'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getStatusIcon(statusType)}
        </div>

        <div className="flex-1 min-w-0">
          <div className={`font-medium ${
            statusType === 'success' ? 'text-green-400' :
            statusType === 'warning' ? 'text-yellow-400' :
            statusType === 'error' ? 'text-red-400' :
            'text-blue-400'
          }`}>
            {statusMessage}
          </div>

          {detailsMessage && (
            <div className="mt-1 text-sm text-gray-400 flex items-center gap-1">
              <Clock size={14} />
              {detailsMessage}
            </div>
          )}

          {lastSaveResult?.warnings?.length > 0 && (
            <div className="mt-3 space-y-1">
              {lastSaveResult.warnings.map((warning, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-yellow-400">
                  <Triangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfigStatus;