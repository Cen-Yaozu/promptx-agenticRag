import { API_BASE, fullApiUrl } from "@/utils/constants";
import { baseHeaders, safeJsonParse } from "@/utils/request";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import WorkspaceThread from "@/models/workspaceThread";
import { v4 } from "uuid";
import { ABORT_STREAM_EVENT } from "@/utils/chat";

const Workspace = {
  workspaceOrderStorageKey: "anythingllm-workspace-order",
  /** The maximum percentage of the context window that can be used for attachments */
  maxContextWindowLimit: 0.8,

  new: async function (data = {}) {
    const { workspace, message } = await fetch(`${API_BASE}/workspace/new`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        return { workspace: null, message: e.message };
      });

    return { workspace, message };
  },
  update: async function (slug, data = {}) {
    const { workspace, message } = await fetch(
      `${API_BASE}/workspace/${slug}/update`,
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        return { workspace: null, message: e.message };
      });

    return { workspace, message };
  },
  modifyEmbeddings: async function (slug, changes = {}) {
    const { workspace, message } = await fetch(
      `${API_BASE}/workspace/${slug}/update-embeddings`,
      {
        method: "POST",
        body: JSON.stringify(changes), // contains 'adds' and 'removes' keys that are arrays of filepaths
        headers: baseHeaders(),
      }
    )
      .then((res) => res.json())
      .catch((e) => {
        return { workspace: null, message: e.message };
      });

    return { workspace, message };
  },
  chatHistory: async function (slug) {
    const history = await fetch(`${API_BASE}/workspace/${slug}/chats`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res.history || [])
      .catch(() => []);
    return history;
  },
  updateChatFeedback: async function (chatId, slug, feedback) {
    const result = await fetch(
      `${API_BASE}/workspace/${slug}/chat-feedback/${chatId}`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ feedback }),
      }
    )
      .then((res) => res.ok)
      .catch(() => false);
    return result;
  },

  deleteChats: async function (slug = "", chatIds = []) {
    return await fetch(`${API_BASE}/workspace/${slug}/delete-chats`, {
      method: "DELETE",
      headers: baseHeaders(),
      body: JSON.stringify({ chatIds }),
    })
      .then((res) => {
        if (res.ok) return true;
        throw new Error("Failed to delete chats.");
      })
      .catch((e) => {
        console.log(e);
        return false;
      });
  },
  deleteEditedChats: async function (slug = "", threadSlug = "", startingId) {
    if (!!threadSlug)
      return this.threads._deleteEditedChats(slug, threadSlug, startingId);
    return this._deleteEditedChats(slug, startingId);
  },
  updateChatResponse: async function (
    slug = "",
    threadSlug = "",
    chatId,
    newText
  ) {
    if (!!threadSlug)
      return this.threads._updateChatResponse(
        slug,
        threadSlug,
        chatId,
        newText
      );
    return this._updateChatResponse(slug, chatId, newText);
  },
  /**
   * 🔥 多路复用流式聊天函数
   * 这是前端发起AI对话的核心入口函数!
   * 根据是否有threadSlug来决定调用工作空间聊天还是线程聊天
   *
   * @param {string} workspaceSlug - 工作空间的唯一标识符(slug)
   * @param {string|null} threadSlug - 对话线程的唯一标识符(可选)
   * @param {string} prompt - 用户输入的消息内容
   * @param {Function} chatHandler - SSE流式响应的处理回调函数
   * @param {Array} attachments - 附件文件列表(可选)
   * @returns {Promise<void>}
   *
   * 流程:
   * 1. 如果有threadSlug -> 调用线程聊天API
   * 2. 如果没有threadSlug -> 调用工作空间聊天API
   */
  multiplexStream: async function ({
    workspaceSlug,
    threadSlug = null,
    prompt,
    chatHandler,
    attachments = [],
  }) {
    // 🔥 分支1: 线程聊天(Thread Chat)
    // 线程是对话的子分组,可以在一个工作空间内创建多个独立的对话线程
    if (!!threadSlug)
      return this.threads.streamChat(
        { workspaceSlug, threadSlug },
        prompt,
        chatHandler,
        attachments
      );

    // 🔥 分支2: 工作空间聊天(Workspace Chat)
    // 这是默认的聊天模式,所有消息都在工作空间级别
    return this.streamChat(
      { slug: workspaceSlug },
      prompt,
      chatHandler,
      attachments
    );
  },
  /**
   * 🔥 🔥 🔥 流式聊天核心函数
   * 这是DeeChat前端最重要的函数之一!
   * 负责建立SSE连接,实时接收AI的流式响应
   *
   * @param {Object} params - 参数对象
   * @param {string} params.slug - 工作空间slug标识符
   * @param {string} message - 用户消息内容
   * @param {Function} handleChat - SSE响应处理函数
   * @param {Array} attachments - 附件列表
   * @returns {Promise<void>}
   *
   * 技术要点:
   * 1. 使用fetchEventSource建立SSE(Server-Sent Events)连接
   * 2. SSE是单向通信:服务器->客户端的实时数据推送
   * 3. 使用AbortController支持中断请求
   * 4. 三个核心回调:onopen(连接建立)、onmessage(接收消息)、onerror(错误处理)
   */
  streamChat: async function ({ slug }, message, handleChat, attachments = []) {
    // 🔥 步骤1: 创建中断控制器
    // AbortController用于取消fetch请求,当用户点击"停止生成"按钮时使用
    const ctrl = new AbortController();

    // 🔥 步骤2: 监听中断事件
    // 当用户点击停止按钮时,会触发ABORT_STREAM_EVENT事件
    // 我们捕获这个事件并中断SSE连接
    window.addEventListener(ABORT_STREAM_EVENT, () => {
      ctrl.abort();  // 中断fetch请求
      // 🔥 发送stopGeneration消息给handleChat,让UI知道停止了
      handleChat({ id: v4(), type: "stopGeneration" });
    });

    // 🔥 步骤3: 建立SSE连接
    // fetchEventSource是一个专门用于SSE的库,比原生fetch更易用
    await fetchEventSource(`${API_BASE}/workspace/${slug}/stream-chat`, {
      method: "POST",
      body: JSON.stringify({ message, attachments }),  // 请求体:用户消息+附件
      headers: baseHeaders(),                          // 请求头:包含认证token等
      signal: ctrl.signal,                             // 绑定中断信号
      openWhenHidden: true,                            // 即使页面隐藏也保持连接

      // 🔥 回调1: 连接建立时触发
      // 用于检查HTTP响应状态码,判断连接是否成功
      async onopen(response) {
        if (response.ok) {
          // 连接成功(HTTP 200-299)
          return;
        } else if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          // 🔥 客户端错误(HTTP 400-499)
          // 如:401未授权、403禁止、404未找到等
          handleChat({
            id: v4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `流式响应发生错误。状态码: ${response.status}`,
          });
          ctrl.abort();
          throw new Error("Invalid Status code response.");
        } else {
          // 🔥 其他错误(如HTTP 500+服务器错误)
          handleChat({
            id: v4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `流式响应发生错误。未知错误。`,
          });
          ctrl.abort();
          throw new Error("Unknown error");
        }
      },

      // 🔥 🔥 🔥 回调2: 接收到SSE消息时触发
      // 这是最核心的回调!每次服务器发送数据块都会触发
      // 消息格式: data: {"type":"textResponseChunk","textResponse":"你好"}\n\n
      async onmessage(msg) {
        try {
          // 🔥 解析SSE消息数据(JSON格式)
          const chatResult = JSON.parse(msg.data);

          // 🔥 调用handleChat处理响应块
          // handleChat会根据type字段进行不同的处理
          // 常见type: textResponseChunk(流式块)、finalizeResponseStream(结束)、abort(中断)等
          handleChat(chatResult);
        } catch (error) {
          // JSON解析失败,静默忽略(可能是心跳包或其他非JSON消息)
          console.error("解析SSE消息失败:", error);
        }
      },

      // 🔥 回调3: 发生错误时触发
      // 如:网络中断、服务器崩溃、超时等
      onerror(err) {
        handleChat({
          id: v4(),
          type: "abort",
          textResponse: null,
          sources: [],
          close: true,
          error: `流式响应发生错误: ${err.message}`,
        });
        ctrl.abort();
        throw new Error();
      },
    });
  },
  all: async function () {
    const workspaces = await fetch(`${API_BASE}/workspaces`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res.workspaces || [])
      .catch(() => []);

    return workspaces;
  },
  bySlug: async function (slug = "") {
    const workspace = await fetch(`${API_BASE}/workspace/${slug}`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .then((res) => res.workspace)
      .catch(() => null);
    return workspace;
  },
  delete: async function (slug) {
    const result = await fetch(`${API_BASE}/workspace/${slug}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch(() => false);

    return result;
  },
  wipeVectorDb: async function (slug) {
    return await fetch(`${API_BASE}/workspace/${slug}/reset-vector-db`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch(() => false);
  },
  uploadFile: async function (slug, formData) {
    const response = await fetch(`${API_BASE}/workspace/${slug}/upload`, {
      method: "POST",
      body: formData,
      headers: baseHeaders(),
    });

    const data = await response.json();
    return { response, data };
  },
  parseFile: async function (slug, formData) {
    const response = await fetch(`${API_BASE}/workspace/${slug}/parse`, {
      method: "POST",
      body: formData,
      headers: baseHeaders(),
    });

    const data = await response.json();
    return { response, data };
  },

  getParsedFiles: async function (slug, threadSlug = null) {
    const basePath = new URL(`${fullApiUrl()}/workspace/${slug}/parsed-files`);
    if (threadSlug) basePath.searchParams.set("threadSlug", threadSlug);
    const response = await fetch(basePath, {
      method: "GET",
      headers: baseHeaders(),
    });

    const data = await response.json();
    return data;
  },
  uploadLink: async function (slug, link) {
    const response = await fetch(`${API_BASE}/workspace/${slug}/upload-link`, {
      method: "POST",
      body: JSON.stringify({ link }),
      headers: baseHeaders(),
    });

    const data = await response.json();
    return { response, data };
  },

  getSuggestedMessages: async function (slug) {
    return await fetch(`${API_BASE}/workspace/${slug}/suggested-messages`, {
      method: "GET",
      cache: "no-cache",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not fetch suggested messages.");
        return res.json();
      })
      .then((res) => res.suggestedMessages)
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  setSuggestedMessages: async function (slug, messages) {
    return fetch(`${API_BASE}/workspace/${slug}/suggested-messages`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ messages }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.statusText || "Error setting suggested messages."
          );
        }
        return { success: true, ...res.json() };
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  setPinForDocument: async function (slug, docPath, pinStatus) {
    return fetch(`${API_BASE}/workspace/${slug}/update-pin`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ docPath, pinStatus }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.statusText || "Error setting pin status for document."
          );
        }
        return true;
      })
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
  ttsMessage: async function (slug, chatId) {
    return await fetch(`${API_BASE}/workspace/${slug}/tts/${chatId}`, {
      method: "GET",
      cache: "no-cache",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok && res.status !== 204) return res.blob();
        throw new Error("Failed to fetch TTS.");
      })
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch((e) => {
        return null;
      });
  },
  uploadPfp: async function (formData, slug) {
    return await fetch(`${API_BASE}/workspace/${slug}/upload-pfp`, {
      method: "POST",
      body: formData,
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error uploading pfp.");
        return { success: true, error: null };
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },

  fetchPfp: async function (slug) {
    return await fetch(`${API_BASE}/workspace/${slug}/pfp`, {
      method: "GET",
      cache: "no-cache",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok && res.status !== 204) return res.blob();
        throw new Error("Failed to fetch pfp.");
      })
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch((e) => {
        // console.log(e);
        return null;
      });
  },

  removePfp: async function (slug) {
    return await fetch(`${API_BASE}/workspace/${slug}/remove-pfp`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (res.ok) return { success: true, error: null };
        throw new Error("Failed to remove pfp.");
      })
      .catch((e) => {
        console.log(e);
        return { success: false, error: e.message };
      });
  },
  _updateChatResponse: async function (slug = "", chatId, newText) {
    return await fetch(`${API_BASE}/workspace/${slug}/update-chat`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ chatId, newText }),
    })
      .then((res) => {
        if (res.ok) return true;
        throw new Error("Failed to update chat.");
      })
      .catch((e) => {
        console.log(e);
        return false;
      });
  },
  _deleteEditedChats: async function (slug = "", startingId) {
    return await fetch(`${API_BASE}/workspace/${slug}/delete-edited-chats`, {
      method: "DELETE",
      headers: baseHeaders(),
      body: JSON.stringify({ startingId }),
    })
      .then((res) => {
        if (res.ok) return true;
        throw new Error("Failed to delete chats.");
      })
      .catch((e) => {
        console.log(e);
        return false;
      });
  },
  deleteChat: async (chatId) => {
    return await fetch(`${API_BASE}/workspace/workspace-chats/${chatId}`, {
      method: "PUT",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
  forkThread: async function (slug = "", threadSlug = null, chatId = null) {
    return await fetch(`${API_BASE}/workspace/${slug}/thread/fork`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ threadSlug, chatId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fork thread.");
        return res.json();
      })
      .then((data) => data.newThreadSlug)
      .catch((e) => {
        console.error("Error forking thread:", e);
        return null;
      });
  },
  /**
   * Uploads and embeds a single file in a single call into a workspace
   * @param {string} slug - workspace slug
   * @param {FormData} formData
   * @returns {Promise<{response: {ok: boolean}, data: {success: boolean, error: string|null, document: {id: string, location:string}|null}}>}
   */
  uploadAndEmbedFile: async function (slug, formData) {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/upload-and-embed`,
      {
        method: "POST",
        body: formData,
        headers: baseHeaders(),
      }
    );

    const data = await response.json();
    return { response, data };
  },

  deleteParsedFiles: async function (slug, fileIds = []) {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/delete-parsed-files`,
      {
        method: "DELETE",
        headers: baseHeaders(),
        body: JSON.stringify({ fileIds }),
      }
    );
    return response.ok;
  },

  embedParsedFile: async function (slug, fileId) {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/embed-parsed-file/${fileId}`,
      {
        method: "POST",
        headers: baseHeaders(),
      }
    );

    const data = await response.json();
    return { response, data };
  },

  /**
   * Deletes and un-embeds a single file in a single call from a workspace
   * @param {string} slug - workspace slug
   * @param {string} documentLocation - location of file eg: custom-documents/my-file-uuid.json
   * @returns {Promise<boolean>}
   */
  deleteAndUnembedFile: async function (slug, documentLocation) {
    const response = await fetch(
      `${API_BASE}/workspace/${slug}/remove-and-unembed`,
      {
        method: "DELETE",
        body: JSON.stringify({ documentLocation }),
        headers: baseHeaders(),
      }
    );
    return response.ok;
  },

  /**
   * Reorders workspaces in the UI via localstorage on client side.
   * @param {string[]} workspaceIds - array of workspace ids to reorder
   * @returns {boolean}
   */
  storeWorkspaceOrder: function (workspaceIds = []) {
    try {
      localStorage.setItem(
        this.workspaceOrderStorageKey,
        JSON.stringify(workspaceIds)
      );
      return true;
    } catch (error) {
      console.error("Error reordering workspaces:", error);
      return false;
    }
  },

  /**
   * Orders workspaces based on the order preference stored in localstorage
   * @param {Array} workspaces - array of workspace JSON objects
   * @returns {Array} - ordered workspaces
   */
  orderWorkspaces: function (workspaces = []) {
    const workspaceOrderPreference =
      safeJsonParse(localStorage.getItem(this.workspaceOrderStorageKey)) || [];
    if (workspaceOrderPreference.length === 0) return workspaces;
    const orderedWorkspaces = Array.from(workspaces);
    orderedWorkspaces.sort(
      (a, b) =>
        workspaceOrderPreference.indexOf(a.id) -
        workspaceOrderPreference.indexOf(b.id)
    );
    return orderedWorkspaces;
  },

  /**
   * Searches for workspaces and threads
   * @param {string} searchTerm
   * @returns {Promise<{workspaces: [{slug: string, name: string}], threads: [{slug: string, name: string, workspace: {slug: string, name: string}}]}}>}
   */
  searchWorkspaceOrThread: async function (searchTerm) {
    const response = await fetch(`${API_BASE}/workspace/search`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ searchTerm }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { workspaces: [], threads: [] };
      });
    return response;
  },

  threads: WorkspaceThread,
};

export default Workspace;
