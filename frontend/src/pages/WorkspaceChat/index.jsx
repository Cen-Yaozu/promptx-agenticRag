import React, { useEffect, useState } from "react";
import { default as WorkspaceChatContainer } from "@/components/WorkspaceChat";
import Sidebar from "@/components/Sidebar";
import { useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import { FullScreenLoader } from "@/components/Preloader";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";

export default function WorkspaceChat() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return <ShowWorkspaceChat />;
}

function ShowWorkspaceChat() {
  const { slug } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getWorkspace() {
      if (!slug) return;
      console.log(`[WorkspaceChat] 开始加载工作区: ${slug}`);
      const _workspace = await Workspace.bySlug(slug);
      if (!_workspace) {
        console.log(`[WorkspaceChat] 工作区不存在: ${slug}`);
        setLoading(false);
        return;
      }

      const suggestedMessages = await Workspace.getSuggestedMessages(slug);
      const pfpUrl = await Workspace.fetchPfp(slug);
      console.log(`[WorkspaceChat] ✅ 工作区加载成功: ${_workspace.name}`);
      setWorkspace({
        ..._workspace,
        suggestedMessages,
        pfpUrl,
      });
      setLoading(false);
      localStorage.setItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({
          slug: _workspace.slug,
          name: _workspace.name,
        })
      );
    }
    getWorkspace();
  }, [slug]); // 🔥 添加slug依赖，工作区切换时重新加载

  return (
    <>
      <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
        {!isMobile && <Sidebar />}
        <WorkspaceChatContainer loading={loading} workspace={workspace} />
      </div>
    </>
  );
}
