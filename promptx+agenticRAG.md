# **📄 PromptX \+ AnythingLLM Agentic RAG 系统设计文档（最终修订版）**

**版本**：1.0

**日期**：2025-11-24

**状态**：已归档

**适用框架**：PromptX, AnythingLLM

## **1\. 引言：为什么是 Agentic RAG？**

### **1.1 传统 RAG 系统的局限性**

目前的 RAG（检索增强生成）系统大多停留在“资料查询”阶段，存在以下显著短板：

* **处理粗糙**：仅进行简单的 Chunking（切片）→ Embedding（向量化）→ Top-k 检索。  
* **缺乏理解**：模型并不真正理解文档的深层语义和业务逻辑。  
* **无场景感**：不支持复杂的跨段落推理或特定业务场景的判断。  
* **非结构化**：无法将非结构化文档转化为结构化知识，导致检索精度封顶。  
* **被动执行**：缺少智能体的自主行为（Agentic Behavior），只能回答问题，无法执行任务。

### **1.2 企业真实需求**

企业需要的不仅仅是一个问答机器人，而是一个**能自动阅读、理解、拆解文档，将文档转化为知识，并按业务场景执行任务的企业级智能系统**。

这就是 **Agentic RAG（代理式 RAG）** 的核心价值：**从“检索信息”进化为“执行任务”。**

## **2\. 核心设计思想**

Agentic RAG 的核心架构遵循以下公式：

**Workspace \= 领域（Domain）**

* 领域内包含多个 **业务场景（Scenes）**  
* 场景通过 **角色（Roles）** 表达  
* 角色通过 **工具（Tools）** 访问领域知识库（VectorDB）

### **2.1 结构层级定义**

| 层级 | 英文标识 | 定义与职责 |
| :---- | :---- | :---- |
| **Workspace** | Workspace | **最高隔离单位**。代表一个独立的知识领域（Domain）。 |
| **文档** | Document | 该领域的原始资料源（PDF, Word, TXT 等）。 |
| **向量数据库** | VectorDB | 该领域的结构化知识库，存储经过清洗和结构化的数据。 |
| **场景** | Scene | 领域内部的具体业务任务（如：合同审核、财报分析）。 |
| **角色** | Role | 业务场景的智能化实现载体，是具体的 AI Agent。 |
| **工具** | Tool | 连接角色与数据的桥梁，负责向量库的访问、解析与操作。 |
| **调度器** | Orchestrator | Workspace 内的“大脑”，负责分发任务给具体的角色。 |

## **3\. AnythingLLM Workspace：最高隔离单位**

Workspace 在物理与逻辑上提供完全隔离，确保数据安全与领域专业性：

1. **数据隔离**：每个 Workspace 拥有独立的文档集和向量集合（Collection）。  
2. **配置隔离**：独立的 Prompt、温度设置和模型选择。  
3. **原则**：**严禁跨 Workspace 调用**。一个 Workspace 就是一个独立的“专家部门”。

## **4\. 系统中的两类智能体架构**

### **4.1 空间级智能体 (Workspace-Level Orchestrator)**

* **作用范围**：仅限当前 Workspace。  
* **定位**：总调度员 / 前台接待。  
* **核心功能**：  
  * **意图识别 (Intent Recognition)**：分析用户输入，判断用户想要做什么。  
  * **场景路由**：将任务匹配到最适合的“场景角色”。  
  * **结果整合**：汇总角色的输出，统一反馈给用户。

### **4.2 场景角色 (Domain Scene Roles)**

* **定位**：特定业务场景的执行专家。  
* **关键特性**：角色不跨领域，只存在于特定的 Domain 中。

**示例：在“法律合同（Contract）”领域下的角色配置**

| 角色名称 | 英文标识 | 核心职责 |
| :---- | :---- | :---- |
| **风险审查员** | Risk Analyst | 识别合同中的法律陷阱、赔偿上限、违约责任等风险。 |
| **条款提取器** | Clause Extractor | 精准提取付款周期、交付物、验收标准等关键信息。 |
| **合规检察官** | Compliance Checker | 检查内容是否符合 GDPR、公司红线或行业法规。 |
| **谈判策略师** | Negotiation Strategist | 基于条款生成我方的回击话术和谈判筹码。 |
| **知识工程师** | Knowledge Engineer | 负责将非结构化文本转化为 JSON Schema。 |

## **5\. 角色与向量数据库的关系（解耦设计）**

这是本架构最关键的设计之一：**角色不直接操作数据库。**

### **5.1 角色（Role）的视角**

角色只关注业务逻辑，它通过自然语言或参数调用“工具”。

* ❌ **角色不关心**：Embedding 模型是 OpenAI 还是 Bert，向量库是 Milvus 还是 Chroma。  
* ✅ **角色只关心**：调用 vector\_search\_tool(query="付款条款", filter="risk")

### **5.2 工具（Tool）的视角**

工具层封装了所有底层技术细节：

* 负责生成 Embedding。  
* 负责构建 Top-k 查询语句。  
* 负责处理元数据过滤（Metadata Filtering）。  
* 负责将数据库返回的原始 JSON 格式化为角色易读的文本。

**价值**：这种设计使得角色 Prompt 极其轻量、稳定，且更换底层数据库时无需修改角色逻辑。

## **6\. 知识构建流程：从 Chunk 到 Schema**

Agentic RAG 拒绝粗糙的切片，提倡**知识结构化**。

### **流程步骤：**

1. **文档摄入**：上传文档（如 PDF）。  
2. **类型识别**：识别为“服务合同”。  
3. **AI 主动拆解**：调用 Knowledge Engineer 角色，分析文档结构。  
4. **Schema 生成**：将非结构化文本转化为结构化数据。  
   * *示例数据结构：*

{  
  "clause\_type": "payment",  
  "content": "甲方应在收到发票后 30 个工作日内付款。",  
  "risk\_level": "medium",  
  "entities": \["甲方", "30工作日"\],  
  "conditions": \["收到发票"\]  
}

5. **结构化写入**：通过 vector\_insert\_tool 存入向量库。

## **7\. 系统架构图**

graph TD  
    User(\[👤 用户 User\])  
      
    subgraph Workspace \[📦 Workspace: 特定领域 (Domain)\]  
        style Workspace fill:\#f9f9f9,stroke:\#333,stroke-width:2px  
          
        Orch(🤖 调度器 Orchestrator)  
        docs\[📄 原始文档\]  
        VDB\[(🗄️ 向量数据库)\]  
          
        subgraph RoleLayer \[🎭 场景角色层\]  
            R1\[🕵️ 风险审查员\]  
            R2\[⚖️ 合规检察官\]  
            R3\[📝 条款提取器\]  
        end  
          
        subgraph ToolLayer \[🛠️ 统一工具层\]  
            SearchTool\[🔍 向量检索工具\]  
            InsertTool\[💾 知识写入工具\]  
        end  
          
        %% 流程连线  
        User \--\>|输入指令| Orch  
          
        docs \-.-\>|预处理| InsertTool  
        InsertTool \-.-\>|结构化存储| VDB  
          
        Orch \--\>|1. 意图识别 & 路由| R1  
        Orch \--\>|1. 意图识别 & 路由| R2  
        Orch \--\>|1. 意图识别 & 路由| R3  
          
        R1 \--\>|2. 调用| SearchTool  
        R2 \--\>|2. 调用| SearchTool  
        R3 \--\>|2. 调用| SearchTool  
          
        SearchTool \<--\>|3. Embedding & Query| VDB  
          
        SearchTool \--\>|4. 返回上下文| R1  
        SearchTool \--\>|4. 返回上下文| R2  
        SearchTool \--\>|4. 返回上下文| R3  
          
        R1 & R2 & R3 \--\>|5. 业务推理输出| Orch  
        Orch \--\>|6. 最终响应| User  
    end

## **8\. 系统整体工作流 (Workflow)**

1. **用户输入**：用户在聊天框输入“这份合同的付款风险在哪里？”  
2. **Orchestrator 介入**：  
   * 分析意图：识别为“风险分析”场景。  
   * 路由：激活 Risk Analyst 角色。  
3. **角色执行**：  
   * Risk Analyst 思考：“我需要查找与付款相关的条款和限制。”  
   * 调用工具：vector\_search(query="付款条款 违约责任", top\_k=5)  
4. **数据检索**：  
   * 工具层从 VectorDB 中检索出结构化的付款条款（包含之前提取的 risk\_level 元数据）。  
5. **推理与生成**：  
   * Risk Analyst 结合检索到的条款（如“30工作日账期”）和内置的法律知识，推理出风险点（如“账期过长，建议压缩至15天”）。  
6. **反馈**：结果返回给 Orchestrator，最终展示给用户。

## **9\. 商业价值总结**

1. **资产化**：企业的核心竞争力不再是文档本身，而是\*\*“如何处理这些文档的角色库”\*\*。  
2. **专业度**：通过场景分离，每个角色都是该细分领域的专家，幻觉率大幅降低。  
3. **可扩展性**：新增业务需求只需增加一个新的 Prompt 角色，无需重构系统。  
4. **数据护城河**：结构化的向量知识库是企业独有的高价值资产。

*文档生成工具：PromptX System Design Agent*