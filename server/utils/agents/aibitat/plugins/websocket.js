const chalk = require("chalk");
const { Telemetry } = require("../../../../models/telemetry");
const SOCKET_TIMEOUT_MS = 30 * 60 * 1_000; // 30 mins - 增加到30分钟
const HEARTBEAT_INTERVAL_MS = 30 * 1_000; // 30 seconds - 无感心跳间隔
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
        // 🚀 无感心跳机制 - 使用原生WebSocket ping/pong
        let heartbeatInterval = null;
        let isConnectionAlive = true;

        const heartbeat = () => {
          isConnectionAlive = true;
          console.log(chalk.green("[WebSocket无感心跳] 收到pong响应，连接存活"));
        };

        const startHeartbeat = () => {
          // 清除可能存在的旧定时器
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
          }

          // 标记连接为存活状态
          isConnectionAlive = true;
          socket.isAlive = true;

          // 设置pong监听器
          socket.on('pong', heartbeat);

          heartbeatInterval = setInterval(() => {
            try {
              if (!socket || socket.readyState !== 1) { // 1 = WebSocket.OPEN
                console.log(chalk.yellow("[WebSocket无感心跳] Socket未打开，停止心跳"));
                clearInterval(heartbeatInterval);
                return;
              }

              // 检查连接是否存活
              if (!socket.isAlive) {
                console.log(chalk.red("[WebSocket无感心跳] 连接已死亡，主动关闭"));
                socket.terminate();
                clearInterval(heartbeatInterval);
                return;
              }

              // 重置存活状态，发送原生ping
              socket.isAlive = false;
              socket.ping(); // 🎯 关键：使用原生ping，客户端自动pong，不会进入onmessage
              console.log(chalk.cyan(`[WebSocket无感心跳] 发送原生ping`));

            } catch (error) {
              console.error(chalk.red("[WebSocket无感心跳] 发送ping失败:"), error.message);
              clearInterval(heartbeatInterval);
            }
          }, HEARTBEAT_INTERVAL_MS);

          console.log(chalk.green(`[WebSocket无感心跳] 已启动，间隔${HEARTBEAT_INTERVAL_MS / 1000}秒`));
        };

        const stopHeartbeat = () => {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
            console.log(chalk.yellow("[WebSocket无感心跳] 已停止"));
          }
          // 移除pong监听器
          if (socket) {
            socket.removeListener('pong', heartbeat);
          }
        };

        // 启动无感心跳
        startHeartbeat();

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
