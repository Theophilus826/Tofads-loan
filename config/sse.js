const User = require("../model/UserModel");

// =========================================================
// CLIENT STORES
// =========================================================

// Private DM connections
const dmClients = {};

// Group chat connections
const groupClients = {};

// Notification connections
const notificationClients = {};

// Online users
const onlineUsers = new Set();


// =========================================================
// CHAT KEY
// =========================================================

function getKey(userId, otherUserId) {
  return `${String(userId)}-${String(otherUserId)}`;
}


// =========================================================
// SAFE SSE WRITE
// =========================================================

function safeWrite(res, data) {
  try {
    if (!res || res.writableEnded || res.destroyed) {
      return false;
    }

    res.write(`data: ${JSON.stringify(data)}\n\n`);

    return true;
  } catch (err) {
    console.error("SSE WRITE ERROR:", err.message);

    return false;
  }
}


// =========================================================
// DM CLIENTS
// =========================================================

function addClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!dmClients[key]) {
    dmClients[key] = new Set();
  }

  dmClients[key].add(res);

  safeWrite(res, {
    type: "connected",
    scope: "chat",
  });
}


function removeClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!dmClients[key]) return;

  dmClients[key].delete(res);

  if (dmClients[key].size === 0) {
    delete dmClients[key];
  }
}


// =========================================================
// GROUP CLIENTS
// =========================================================

function addGroupClient(groupId, userId, res) {
  const group = String(groupId);
  const user = String(userId);

  if (!groupClients[group]) {
    groupClients[group] = {};
  }

  if (!groupClients[group][user]) {
    groupClients[group][user] = new Set();
  }

  groupClients[group][user].add(res);

  setOnline(user);

  safeWrite(res, {
    type: "connected",
    scope: "group",
    groupId: group,
    userId: user,
  });

  broadcastGroupOnlineMembers(group);
}


function removeGroupClient(groupId, userId, res) {
  const group = String(groupId);
  const user = String(userId);

  if (!groupClients[group]) return;
  if (!groupClients[group][user]) return;

  groupClients[group][user].delete(res);

  if (groupClients[group][user].size === 0) {
    delete groupClients[group][user];
    setOffline(user);
  }

  if (Object.keys(groupClients[group]).length === 0) {
    delete groupClients[group];
  }

  broadcastGroupOnlineMembers(group);
}


function getOnlineGroupMembers(groupId) {
  const group = String(groupId);

  if (!groupClients[group]) {
    return [];
  }

  return Object.keys(groupClients[group]);
}


function broadcastGroupOnlineMembers(groupId) {
  const group = String(groupId);

  if (!groupClients[group]) return;

  const members = getOnlineGroupMembers(group);

  Object.values(groupClients[group]).forEach((set) => {
    for (const res of [...set]) {
      const ok = safeWrite(res, {
        type: "online_members",
        scope: "group",
        groupId: group,
        members,
      });

      if (!ok) {
        set.delete(res);
      }
    }
  });
}


// =========================================================
// GROUP MESSAGES
// =========================================================

function pushGroupMessage(groupId, payload) {
  const group = String(groupId);

  if (!groupClients[group]) {
    return;
  }

  Object.values(groupClients[group]).forEach((set) => {
    for (const res of [...set]) {
      const ok = safeWrite(res, {
        scope: "group",
        groupId: group,
        ...payload,
      });

      if (!ok) {
        set.delete(res);
      }
    }
  });
}


// =========================================================
// NOTIFICATIONS
// =========================================================

function addNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) {
    notificationClients[id] = new Set();
  }

  notificationClients[id].add(res);

  console.log(`🔔 Notification connected: ${id}`);

  safeWrite(res, {
    type: "connected",
    scope: "notification",
  });
}


function removeNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) {
    return;
  }

  notificationClients[id].delete(res);

  if (notificationClients[id].size === 0) {
    delete notificationClients[id];
  }

  console.log(`🔕 Notification disconnected: ${id}`);
}


// =========================================================
// PUSH NOTIFICATION
// =========================================================

function pushNotification(userId, notification) {
  const id = String(userId);

  if (!notificationClients[id]) {
    console.log(
      `Notification user ${id} is not connected`
    );

    return;
  }

  for (const res of [...notificationClients[id]]) {
    const ok = safeWrite(res, {
      type: "notification",
      scope: "notification",
      notification,
    });

    if (!ok) {
      notificationClients[id].delete(res);
    }
  }

  console.log(`🔔 Notification sent to user ${id}`);
}




// =========================================================
// DM MESSAGES
// =========================================================

function pushMessage(userId, otherUserId, message) {
  const keys = [
    getKey(userId, otherUserId),
    getKey(otherUserId, userId),
  ];

  keys.forEach((key) => {
    dmClients[key]?.forEach((res) => {
      const ok = safeWrite(res, {
        type: "new_message",
        scope: "dm",
        message,
      });

      if (!ok) {
        dmClients[key].delete(res);
      }
    });
  });
}


function pushMessageEvent(userId, otherUserId, payload) {
  const keys = [
    getKey(userId, otherUserId),
    getKey(otherUserId, userId),
  ];

  keys.forEach((key) => {
    dmClients[key]?.forEach((res) => {
      const ok = safeWrite(res, payload);

      if (!ok) {
        dmClients[key].delete(res);
      }
    });
  });
}


// =========================================================
// TYPING
// =========================================================

function sendTyping(fromUser, toUser, status) {
  const key = getKey(fromUser, toUser);

  dmClients[key]?.forEach((res) => {
    safeWrite(res, {
      type: status,
      scope: "dm",
      fromUser,
    });
  });
}


function sendGroupTyping(groupId, fromUser, status) {
  const group = String(groupId);

  if (!groupClients[group]) return;

  Object.values(groupClients[group]).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: status,
        scope: "group",
        groupId: group,
        fromUser,
      });
    });
  });
}


// =========================================================
// ONLINE STATUS
// =========================================================

function setOnline(userId) {
  const id = String(userId);

  if (onlineUsers.has(id)) {
    return;
  }

  onlineUsers.add(id);

  User.findByIdAndUpdate(
    id,
    {
      online: true,
    },
    {
      returnDocument: "after",
    }
  )
    .then(() => {
      broadcastStatus(id, "online");
    })
    .catch((err) => {
      console.error(
        "setOnline DB error:",
        err.message
      );
    });
}


function setOffline(userId) {
  const id = String(userId);

  if (!onlineUsers.has(id)) {
    return;
  }

  onlineUsers.delete(id);

  User.findByIdAndUpdate(
    id,
    {
      online: false,
      lastActive: Date.now(),
    },
    {
      returnDocument: "after",
    }
  )
    .then(() => {
      broadcastStatus(id, "offline");
    })
    .catch((err) => {
      console.error(
        "setOffline DB error:",
        err.message
      );
    });
}


function isOnline(userId) {
  return onlineUsers.has(String(userId));
}


function broadcastStatus(userId, status) {
  const payload = {
    type: "status",
    userId,
    status,
  };

  // DM clients
  Object.values(dmClients).forEach((set) => {
    set.forEach((res) => {
      const ok = safeWrite(res, payload);

      if (!ok) {
        set.delete(res);
      }
    });
  });

  // Notification clients
  Object.values(notificationClients).forEach((set) => {
    set.forEach((res) => {
      const ok = safeWrite(res, payload);

      if (!ok) {
        set.delete(res);
      }
    });
  });
}


// =========================================================
// NOTIFICATION SSE SUBSCRIBE
// =========================================================

const subscribeNotifications = (req, res) => {
  const userId = req.user._id.toString();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  addNotificationClient(userId, res);

  // Initial event
  safeWrite(res, {
    type: "connected",
    scope: "notification",
    userId,
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(": ping\n\n");
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);

    removeNotificationClient(userId, res);

    if (!res.writableEnded) {
      res.end();
    }
  });
};


// =========================================================
// CHAT SSE SUBSCRIBE
// =========================================================

const subscribeChat = (req, res) => {
  const userId = req.user._id.toString();

  const { otherUserId } = req.query;

  if (!otherUserId) {
    return res.status(400).json({
      success: false,
      message: "otherUserId is required",
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  addClient(
    userId,
    otherUserId,
    res
  );

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(": ping\n\n");
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);

    removeClient(
      userId,
      otherUserId,
      res
    );

    if (!res.writableEnded) {
      res.end();
    }
  });
};


// =========================================================
// HEARTBEAT
// =========================================================

setInterval(() => {
  // DM
  Object.values(dmClients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: "ping",
        scope: "chat",
      });
    });
  });

  // Groups
  Object.values(groupClients).forEach((users) => {
    Object.values(users).forEach((set) => {
      set.forEach((res) => {
        safeWrite(res, {
          type: "ping",
          scope: "group",
        });
      });
    });
  });

  // Notifications
  Object.values(notificationClients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: "ping",
        scope: "notification",
      });
    });
  });
}, 25000);


// =========================================================
// OPTIONAL HELPERS
// =========================================================

const isNotificationConnected = (userId) => {
  return Boolean(
    notificationClients[String(userId)]
  );
};


const disconnectNotifications = (userId) => {
  const id = String(userId);

  const connections = notificationClients[id];

  if (!connections) {
    return;
  }

  connections.forEach((res) => {
    try {
      res.end();
    } catch (error) {
      console.error(
        "Notification disconnect error:",
        error.message
      );
    }
  });

  delete notificationClients[id];
};


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // DM
  addClient,
  removeClient,
  pushMessage,
  pushMessageEvent,

  // Groups
  addGroupClient,
  removeGroupClient,
  getOnlineGroupMembers,
  broadcastGroupOnlineMembers,
  pushGroupMessage,

  // Notifications
  addNotificationClient,
  removeNotificationClient,
  pushNotification,
  subscribeNotifications,
  isNotificationConnected,
  disconnectNotifications,

  // Typing
  sendTyping,
  sendGroupTyping,

  // Online
  broadcastStatus,
  setOnline,
  setOffline,
  isOnline,

  // Chat SSE
  subscribeChat,
};