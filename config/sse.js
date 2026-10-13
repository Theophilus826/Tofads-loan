
const User = require("../model/UserModel");

/* =========================================================
   NOTIFICATION SSE CONNECTIONS
========================================================= */

const notificationClients = new Map();

/* =========================================================
   SAFE SSE WRITER
========================================================= */

function safeWrite(res, data) {
  if (!res || res.writableEnded || res.destroyed) {
    return false;
  }

  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error("SSE write failed:", error.message);
    return false;
  }
}

/* =========================================================
   REGISTER NOTIFICATION CLIENT
========================================================= */

function addNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients.has(id)) {
    notificationClients.set(id, new Set());
  }

  notificationClients.get(id).add(res);
}

/* =========================================================
   REMOVE NOTIFICATION CLIENT
========================================================= */

function removeNotificationClient(userId, res) {
  const id = String(userId);
  const clients = notificationClients.get(id);

  if (!clients) return;

  clients.delete(res);

  if (clients.size === 0) {
    notificationClients.delete(id);
  }
}

/* =========================================================
   PUSH NOTIFICATION TO CONNECTED CLIENTS
========================================================= */

function pushNotification(userId, notification) {
  const id = String(userId);
  const clients = notificationClients.get(id);

  if (!clients || clients.size === 0) {
    return false;
  }

  const payload = {
    type: "notification",
    scope: "notification",
    notification,
  };

  let delivered = false;

  for (const res of clients) {
    const success = safeWrite(res, payload);

    if (success) {
      delivered = true;
    } else {
      removeNotificationClient(id, res);
    }
  }

  return delivered;
}

/* =========================================================
   AUTHENTICATED NOTIFICATION STREAM
========================================================= */

function subscribeNotifications(req, res) {
  const userId = req.user?._id || req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const id = String(userId);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Do not set Access-Control-Allow-Origin to "*" here.
  // Configure CORS centrally for your frontend origin.
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  addNotificationClient(id, res);

  safeWrite(res, {
    type: "connected",
    scope: "notification",
  });

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      removeNotificationClient(id, res);
      return;
    }

    try {
      res.write(": ping\n\n");
    } catch (error) {
      clearInterval(heartbeat);
      removeNotificationClient(id, res);
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    removeNotificationClient(id, res);
  };

  req.on("close", cleanup);
  res.on("error", cleanup);
}

/* =========================================================
   CONNECTION STATUS
========================================================= */

function isNotificationConnected(userId) {
  return (notificationClients.get(String(userId))?.size || 0) > 0;
}

function disconnectNotifications(userId) {
  const id = String(userId);
  const clients = notificationClients.get(id);

  if (!clients) return;

  for (const res of clients) {
    try {
      res.end();
    } catch (error) {
      console.error("SSE disconnect failed:", error.message);
    }
  }

  notificationClients.delete(id);
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  safeWrite,
  addNotificationClient,
  removeNotificationClient,
  pushNotification,
  subscribeNotifications,
  isNotificationConnected,
  disconnectNotifications,
};
