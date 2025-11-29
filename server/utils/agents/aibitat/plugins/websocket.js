const chalk = require("chalk");
const { Telemetry } = require("../../../../models/telemetry");
const SOCKET_TIMEOUT_MS = 30 * 60 * 1_000; // 30 mins - 增加到30分钟
const HEARTBEAT_INTERVAL_MS = 15 * 1_000; // 15 seconds - balanced heartbeat interval
const CONNECTION_TIMEOUT_MS = 60 * 1_000; // 60 seconds - no response timeout

/**
 * Websocket Interface plugin. It prints the messages on the console and asks for feedback
 * while the conversation is running in the background.
 */

// export interface AIbitatWebSocket extends ServerWebSocket<unknown> {
//   askForFeedback?: any
//   awaitResponse?: any
//   handleFeedback?: (message: string) => void;
// }

const WEBSOCKET_BAIL_COMMANDS = [
  "exit",
  "/exit",
  "stop",
  "/stop",
  "halt",
  "/halt",
  "/reset", // Will not reset but will bail. Powerusers always do this and the LLM responds.
];
const websocket = {
  name: "websocket",
  startupConfig: {
    params: {
      socket: {
        required: true,
      },
      muteUserReply: {
        required: false,
        default: true,
      },
      introspection: {
        required: false,
        default: true,
      },
    },
  },
  plugin: function ({
    socket, // @type AIbitatWebSocket
    muteUserReply = true, // Do not post messages to "USER" back to frontend.
    introspection = false, // when enabled will attach socket to Aibitat object with .introspect method which reports status updates to frontend.
  }) {
    return {
      name: this.name,
      setup(aibitat) {
        // 统一心跳机制 - 双向通信和连接健康检测
        let heartbeatInterval = null;
        let lastPongReceived = Date.now();
        let heartbeatCounter = 0;
        let isConnectionHealthy = true;

        const startHeartbeat = () => {
          // 清除可能存在的旧定时器
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }

          lastPongReceived = Date.now();
          heartbeatCounter = 0;
          isConnectionHealthy = true;

          heartbeatInterval = setInterval(() => {
            try {
              if (!socket || socket.readyState !== 1) { // 1 = WebSocket.OPEN
                console.log(chalk.yellow("[WebSocket心跳] Socket未打开，停止心跳"));
                clearInterval(heartbeatInterval);
                return;
              }

              heartbeatCounter++;

              // 检查连接健康状态
              const timeSinceLastPong = Date.now() - lastPongReceived;
              if (timeSinceLastPong > CONNECTION_TIMEOUT_MS) {
                console.log(chalk.red(`[WebSocket心跳] 连接不健康，${timeSinceLastPong}ms未收到pong，标记为不健康`));
                isConnectionHealthy = false;
              }

              // 发送心跳消息
              const heartbeatMessage = {
                type: "heartbeat",
                timestamp: Date.now(),
                counter: heartbeatCounter,
                status: isConnectionHealthy ? "healthy" : "unhealthy",
                server: true
              };

              socket.send(JSON.stringify(heartbeatMessage));
              console.log(chalk.cyan(`[WebSocket心跳] 发送heartbeat #${heartbeatCounter}, 状态: ${isConnectionHealthy ? "健康" : "不健康"}`));

              // 如果连接不健康超过2倍超时时间，主动关闭
              if (timeSinceLastPong > CONNECTION_TIMEOUT_MS * 2) {
                console.log(chalk.red("[WebSocket心跳] 连接超时，主动关闭连接"));
                socket.close(1000, "Connection timeout due to missing pong responses");
                clearInterval(heartbeatInterval);
              }

            } catch (error) {
              console.error(chalk.red("[WebSocket心跳] 发送heartbeat失败:"), error.message);
              clearInterval(heartbeatInterval);
            }
          }, HEARTBEAT_INTERVAL_MS);

          console.log(chalk.green(`[WebSocket心跳] 已启动，间隔${HEARTBEAT_INTERVAL_MS / 1000}秒，超时${CONNECTION_TIMEOUT_MS / 1000}秒`));
        };

        const stopHeartbeat = () => {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
            console.log(chalk.yellow("[WebSocket心跳] 已停止"));
          }
        };

        // 处理客户端的pong响应
        const handlePongResponse = (data) => {
          lastPongReceived = Date.now();
          if (!isConnectionHealthy) {
            isConnectionHealthy = true;
            console.log(chalk.green("[WebSocket心跳] 连接恢复健康状态"));
          }
        };

        // 启动心跳
        startHeartbeat();

        // 拦截socket的消息处理，添加pong响应处理
        const originalMessageHandler = socket.onmessage;
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // 处理pong响应
            if (data.type === "pong" && data.client) {
              handlePongResponse(data);
              console.log(chalk.green(`[WebSocket心跳] 收到客户端pong响应 #${data.counter}`));
              return; // pong消息不需要进一步处理
            }
          } catch (e) {
            // 非JSON消息，继续原始处理流程
          }

          // 调用原始消息处理器
          if (originalMessageHandler) {
            originalMessageHandler.call(socket, event);
          }
        };

        aibitat.onError(async (error) => {
          let errorMessage =
            error?.message || "An error occurred while running the agent.";
          console.error(chalk.red(`   error: ${errorMessage}`), error);
          aibitat.introspect(
            `Error encountered while running: ${errorMessage}`
          );
          socket.send(
            JSON.stringify({ type: "wssFailure", content: errorMessage })
          );
          aibitat.terminate();
        });

        aibitat.introspect = (messageText) => {
          if (!introspection) return; // Dump thoughts when not wanted.
          socket.send(
            JSON.stringify({
              type: "statusResponse",
              content: messageText,
              animate: true,
            })
          );
        };

        // expose function for sockets across aibitat
        // type param must be set or else msg will not be shown or handled in UI.
        aibitat.socket = {
          send: (type = "__unhandled", content = "") => {
            socket.send(JSON.stringify({ type, content }));
          },
        };

        // aibitat.onStart(() => {
        //   console.log("🚀 starting chat ...");
        // });

        aibitat.onMessage((message) => {
          if (message.from !== "USER")
            Telemetry.sendTelemetry("agent_chat_sent");
          if (message.from === "USER" && muteUserReply) return;
          socket.send(JSON.stringify(message));
        });

        aibitat.onTerminate(() => {
          // console.log("🚀 chat finished");
          stopHeartbeat(); // 停止心跳
          socket.close();
        });

        aibitat.onInterrupt(async (node) => {
          const feedback = await socket.askForFeedback(socket, node);
          if (WEBSOCKET_BAIL_COMMANDS.includes(feedback)) {
            socket.close();
            return;
          }

          await aibitat.continue(feedback);
        });

        /**
         * Socket wait for feedback on socket
         *
         * @param socket The content to summarize. // AIbitatWebSocket & { receive: any, echo: any }
         * @param node The chat node // { from: string; to: string }
         * @returns The summarized content.
         */
        socket.askForFeedback = (socket, node) => {
          socket.awaitResponse = (question = "waiting...") => {
            socket.send(JSON.stringify({ type: "WAITING_ON_INPUT", question }));

            return new Promise(function (resolve) {
              let socketTimeout = null;
              socket.handleFeedback = (message) => {
                const data = JSON.parse(message);
                if (data.type !== "awaitingFeedback") return;
                delete socket.handleFeedback;
                clearTimeout(socketTimeout);
                resolve(data.feedback);
                return;
              };

              socketTimeout = setTimeout(() => {
                // 检查WebSocket连接是否还活跃，如果活跃就不自动断开
                if (socket && socket.readyState === 1) { // WebSocket.OPEN = 1
                  console.log(
                    chalk.yellow(
                      `Client未响应，但WebSocket连接仍活跃，延长等待时间 (${SOCKET_TIMEOUT_MS}ms)`
                    )
                  );
                  // 重置定时器，继续等待
                  socketTimeout = setTimeout(arguments.callee, SOCKET_TIMEOUT_MS);
                  return;
                } else {
                  console.log(
                    chalk.red(
                      `Client took too long to respond and connection is dead, ending chat after ${SOCKET_TIMEOUT_MS}ms`
                    )
                  );
                  resolve("exit");
                  return;
                }
              }, SOCKET_TIMEOUT_MS);
            });
          };

          return socket.awaitResponse(`Provide feedback to ${chalk.yellow(
            node.to
          )} as ${chalk.yellow(node.from)}.
           Press enter to skip and use auto-reply, or type 'exit' to end the conversation: \n`);
        };
        // console.log("🚀 WS plugin is complete.");
      },
    };
  },
};

module.exports = {
  websocket,
  WEBSOCKET_BAIL_COMMANDS,
};
