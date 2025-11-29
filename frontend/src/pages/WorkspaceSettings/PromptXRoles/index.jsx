import React from "react";
import PromptXRoleManager from "@/components/WorkspaceSettings/PromptXRoleManager";

export default function PromptXRoles({ slug, workspace }) {
  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          PromptX 角色管理
        </h1>
        <p className="text-white/70">
          配置工作区中可用的PromptX AI角色，控制用户可以使用的AI功能
        </p>
      </div>

      <div className="bg-theme-bg-secondary rounded-lg border border-theme-modal-border p-6">
        <PromptXRoleManager workspaceId={workspace?.id} />
      </div>
    </div>
  );
}