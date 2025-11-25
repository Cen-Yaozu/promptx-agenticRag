import React, { useEffect, useState } from "react";
import System from "@/models/system";
import PreLoader from "@/components/Preloader";

export default function GenericOpenAiOptions({ settings }) {
  const [customModels, setCustomModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const fetchModels = async () => {
    const input = document.querySelector('input[name="GenericOpenAiBasePath"]');
    const keyInput = document.querySelector('input[name="GenericOpenAiKey"]');
    const basePath = input?.value || settings?.GenericOpenAiBasePath || '';

    // 处理 API Key：如果输入框显示的是星号，则使用已保存的密钥；否则使用输入值
    let apiKey = '';
    if (keyInput?.value && !keyInput.value.startsWith('*')) {
      // 用户输入了新的密钥
      apiKey = keyInput.value;
    } else {
      // 使用已保存的密钥
      apiKey = settings?.GenericOpenAiKey || '';
    }

    console.log('Fetching models for:', {
      basePath,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey.length,
      inputExists: !!input,
      keyInputExists: !!keyInput
    });

    if (!basePath) {
      setCustomModels([]);
      return;
    }

    setLoadingModels(true);
    try {
      // 使用实际的 API 地址和密钥获取模型列表
      const response = await System.customModels("generic-openai", apiKey, basePath);
      console.log('Fetched models response:', response);
      const { models } = response;
      setCustomModels(models || []);
    } catch (error) {
      console.error("Failed to fetch custom models:", error);
      setCustomModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  // 组件加载时如果有配置好的 basePath，自动获取模型
  useEffect(() => {
    if (settings?.GenericOpenAiBasePath) {
      fetchModels();
    }
  }, []);

  return (
    <div className="w-full flex flex-col gap-y-7">
      <div className="w-full flex items-start gap-[36px] mt-1.5">
        <div className="flex flex-col w-60">
          <div className="flex justify-between items-center mb-2">
            <label className="text-white text-sm font-semibold">
              Base URL
            </label>
            <button
              onClick={fetchModels}
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded"
              disabled={loadingModels}
            >
              测试
            </button>
          </div>
          <input
            type="url"
            name="GenericOpenAiBasePath"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="http://localhost:8000/v1"
            defaultValue={settings?.GenericOpenAiBasePath}
            required={true}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
            输入中转站地址，点击"测试"按钮获取模型列表
          </p>
        </div>
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            API Key (可选)
          </label>
          <input
            type="password"
            name="GenericOpenAiKey"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="API Key (如果需要，很多中转站不需要)"
            defaultValue={settings?.GenericOpenAiKey ? "*".repeat(20) : ""}
            required={false}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col w-60">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-white text-sm font-semibold">
              Chat Model
            </label>
            <div className="flex items-center gap-1">
              {loadingModels && (
                <>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-400">获取模型中...</span>
                </>
              )}
              <button
                onClick={fetchModels}
                className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded"
                disabled={loadingModels}
              >
                刷新
              </button>
            </div>
          </div>
          {loadingModels ? (
            <div className="flex items-center justify-center h-[42px]">
              <PreLoader size="6" />
            </div>
          ) : (
            <>
              <select
                name="GenericOpenAiModelPref"
                className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                defaultValue={settings?.GenericOpenAiModelPref}
                required={true}
              >
                <option value="">选择一个模型...</option>
                {customModels.length > 0 ? (
                  customModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id} {model.owned_by ? `(${model.owned_by})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    {settings?.GenericOpenAiBasePath ? '未找到可用模型' : '请先输入 API 地址'}
                  </option>
                )}
              </select>
              <p className="text-xs leading-[18px] font-base text-white text-opacity-60 mt-2">
                {customModels.length > 0
                  ? `找到 ${customModels.length} 个可用模型`
                  : '系统会从中转站获取可用模型'
                }
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-[36px] flex-wrap">
        <div className="flex flex-col w-60">
          <label className="text-white text-sm font-semibold block mb-3">
            Max Tokens per Request
          </label>
          <input
            type="number"
            name="GenericOpenAiMaxTokens"
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="Max tokens per request (eg: 1024)"
            min={1}
            defaultValue={settings?.GenericOpenAiMaxTokens || 1024}
            required={true}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
