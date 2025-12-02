// 🛡️ 防御性编程: chromadb包已移除,使用时动态检查
let CloudClient;
try {
  CloudClient = require("chromadb").CloudClient;
} catch (error) {
  console.warn(
    "⚠️  ChromaDB package not installed. ChromaCloud vector database will not be available."
  );
  console.warn(
    "💡 To use ChromaCloud, install it with: npm install chromadb"
  );
  CloudClient = null;
}

const { Chroma } = require("../chroma");

// ChromaCloud works exactly the same as Chroma so we can just extend the
// Chroma class and override the connect method to use CloudClient

const ChromaCloud = {
  ...Chroma,
  name: "ChromaCloud",
  connect: async function () {
    // 🛡️ 检查chromadb包是否可用
    if (!CloudClient) {
      throw new Error(
        "ChromaCloud::ChromaDB package not installed. Please install 'chromadb' package to use this vector database, or switch to another vector database (e.g., LanceDB, Qdrant)."
      );
    }

    if (process.env.VECTOR_DB !== "chromacloud")
      throw new Error("ChromaCloud::Invalid ENV settings");

    const client = new CloudClient({
      apiKey: process.env.CHROMACLOUD_API_KEY,
      tenant: process.env.CHROMACLOUD_TENANT,
      database: process.env.CHROMACLOUD_DATABASE,
    });

    const isAlive = await client.heartbeat();
    if (!isAlive)
      throw new Error(
        "ChromaCloud::Invalid Heartbeat received - is the instance online?"
      );
    return { client };
  },
};

module.exports.ChromaCloud = ChromaCloud;
