const express = require("express");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const port = process.env.PORT || 8080;
const WS_PORT = process.env.PORT || 8080;
const DEV_MODE = process.env.NODE_ENV !== "production";

// 提供静态文件服务
app.use(express.static(path.join(__dirname, "public")));

// 创建 HTTP 服务器
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server });

// 存储客服和用户的连接
const clients = new Map();
const customerService = new Map();

// 开发环境的错误处理
if (DEV_MODE) {
  process.on("uncaughtException", (err) => {
    console.error("未捕获的异常:", err);
  });

  process.on("unhandledRejection", (err) => {
    console.error("未处理的 Promise 拒绝:", err);
  });
}

// 监听连接事件
wss.on("connection", function connection(ws, req) {
  // 生成唯一的用户ID
  const userId = Math.random().toString(36).substring(7);
  ws.userId = userId; // 立即设置 userId，不要等到 init 消息

  // 初始化连接类型（客服或访客）
  ws.on("message", function incoming(message) {
    const data = JSON.parse(message);
    console.log("收到消息:", data); // 添加日志

    if (data.type === "init") {
      if (data.role === "customer_service") {
        customerService.set(userId, ws);
        ws.role = "customer_service";
        console.log("客服登录:", userId); // 添加日志
        ws.send(
          JSON.stringify({
            type: "system",
            message: "您已作为客服登录",
          })
        );
      } else {
        clients.set(userId, ws);
        ws.role = "client";
        console.log("访客登录:", userId); // 添加日志
        // 分配一个在线客服
        assignCustomerService(ws, userId);
      }
    } else {
      // 处理聊天消息
      handleChatMessage(ws, data);
    }
  });

  // 处理断开连接
  ws.on("close", () => {
    if (ws.role === "customer_service") {
      customerService.delete(ws.userId);
    } else {
      clients.delete(ws.userId);
    }
  });
});

// 分配客服
function assignCustomerService(clientWs, clientId) {
  // 找到当前接待量最少的客服
  let assignedCs = null;
  let minClients = Infinity;

  for (let [csId, csWs] of customerService) {
    console.log("检查客服:", csId); // 添加日志
    const clientCount = [...clients.values()].filter(
      (c) => c.assignedCs === csId
    ).length;
    if (clientCount < minClients) {
      minClients = clientCount;
      assignedCs = csWs;
      assignedCs.userId = csId; // 确保客服的 userId 被正确设置
    }
  }

  if (assignedCs) {
    console.log("分配客服:", assignedCs.userId, "给访客:", clientId); // 添加日志
    clientWs.assignedCs = assignedCs.userId;
    // 通知客服有新用户
    assignedCs.send(
      JSON.stringify({
        type: "new_client",
        clientId: clientId,
      })
    );
    // 通知用户已接入客服
    clientWs.send(
      JSON.stringify({
        type: "system",
        message: "已为您接入客服，请开始咨询",
      })
    );
  } else {
    console.log("没有可用的客服"); // 添加日志
    clientWs.send(
      JSON.stringify({
        type: "system",
        message: "当前无在线客服，请稍后再试",
      })
    );
  }
}

// 处理聊天消息
function handleChatMessage(ws, data) {
  console.log("处理消息:", ws.role, data); // 添加日志

  if (ws.role === "customer_service") {
    // 客服发送给指定用户
    const clientWs = clients.get(data.to);
    console.log("客服发送给访客:", data.to, !!clientWs); // 添加日志
    if (clientWs) {
      clientWs.send(
        JSON.stringify({
          type: "message",
          from: "customer_service",
          message: data.message,
        })
      );
    }
  } else {
    // 用户发送给指定客服
    console.log("访客消息，assigned客服:", ws.assignedCs); // 添加日志
    for (let [csId, csWs] of customerService) {
      console.log("检查客服:", csId, csId === ws.assignedCs); // 添加日志
      if (csId === ws.assignedCs) {
        csWs.send(
          JSON.stringify({
            type: "message",
            from: ws.userId,
            message: data.message,
          })
        );
        console.log("消息已发送给客服"); // 添加日志
        break;
      }
    }
  }
}
