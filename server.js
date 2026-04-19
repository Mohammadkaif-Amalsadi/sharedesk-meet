const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 25000,
  pingTimeout: 60000,
  cors: {
    origin: process.env.CORS_ORIGIN || "*"
  }
});

const PORT = process.env.PORT || 3000;
const EMPTY_ROOM_TTL_MS = Number(process.env.EMPTY_ROOM_TTL_MS || 30 * 60 * 1000);
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostId: null,
      hostName: null,
      sessionStartAt: null,
      participants: new Map(),
      controlPermissions: new Map(),
      screenSharers: new Set(),
      cleanupTimer: null,
      createdAt: Date.now()
    });
  }

  return rooms.get(roomId);
}

function scheduleRoomCleanup(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.cleanupTimer) {
    return;
  }

  room.cleanupTimer = setTimeout(() => {
    const latestRoom = rooms.get(roomId);
    if (latestRoom?.participants.size === 0) {
      rooms.delete(roomId);
    }
  }, EMPTY_ROOM_TTL_MS);
}

function cancelRoomCleanup(room) {
  if (!room?.cleanupTimer) {
    return;
  }

  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
}

function publicParticipants(room) {
  return Array.from(room.participants.entries()).map(([id, participant]) => ({
    id,
    name: participant.name,
    isHost: id === room.hostId,
    control: room.controlPermissions.get(id) || emptyControlPermissions()
  }));
}

function emptyControlPermissions() {
  return {
    pointer: false,
    space: false,
    arrows: false
  };
}

function fullControlPermissions() {
  return {
    pointer: true,
    space: true,
    arrows: true
  };
}

function normalizeControlPermissions(value) {
  if (value === true) {
    return fullControlPermissions();
  }

  return {
    pointer: Boolean(value?.pointer),
    space: Boolean(value?.space),
    arrows: Boolean(value?.arrows)
  };
}

function hasAnyControl(permissions) {
  return Boolean(permissions?.pointer || permissions?.space || permissions?.arrows);
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  io.to(roomId).emit("room-state", {
    hostId: room.hostId,
    participants: publicParticipants(room),
    screenSharers: Array.from(room.screenSharers),
    sessionStartAt: room.sessionStartAt
  });
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name, sessionStartAt, mode }, ack) => {
    const cleanRoomId = String(roomId || "").trim().slice(0, 64);
    const cleanName = String(name || "Guest").trim().slice(0, 40) || "Guest";

    if (!cleanRoomId) {
      ack?.({ ok: false, error: "Room name is required." });
      return;
    }

    if (!rooms.has(cleanRoomId) && mode !== "host") {
      ack?.({ ok: false, error: "Room not found. Check the code or ask the host to initialize the session." });
      return;
    }

    const room = getRoom(cleanRoomId);
    cancelRoomCleanup(room);
    socket.join(cleanRoomId);
    socket.data.roomId = cleanRoomId;
    socket.data.name = cleanName;

    if (!room.hostId && (!room.hostName || room.hostName === cleanName || mode === "host")) {
      room.hostId = socket.id;
      room.hostName = cleanName;
      if (!room.sessionStartAt) {
        room.sessionStartAt = Number.isFinite(Number(sessionStartAt))
          ? Number(sessionStartAt)
          : Date.now();
      }
    }

    room.participants.set(socket.id, { name: cleanName, joinedAt: Date.now() });
    room.controlPermissions.set(socket.id, socket.id === room.hostId ? fullControlPermissions() : emptyControlPermissions());

    const existingPeers = publicParticipants(room).filter((participant) => participant.id !== socket.id);

    ack?.({
      ok: true,
      selfId: socket.id,
      hostId: room.hostId,
      isHost: socket.id === room.hostId,
      screenSharers: Array.from(room.screenSharers),
      sessionStartAt: room.sessionStartAt,
      peers: existingPeers
    });

    socket.to(cleanRoomId).emit("peer-joined", {
      id: socket.id,
      name: cleanName,
      isHost: socket.id === room.hostId,
      control: room.controlPermissions.get(socket.id) || emptyControlPermissions()
    });

    broadcastRoomState(cleanRoomId);
  });

  socket.on("signal", ({ to, description, candidate }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !to) {
      return;
    }

    io.to(to).emit("signal", {
      from: socket.id,
      description,
      candidate
    });
  });

  socket.on("request-control", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room || socket.id === room.hostId) {
      return;
    }

    io.to(room.hostId).emit("control-request", {
      requesterId: socket.id,
      requesterName: socket.data.name || "Guest"
    });
  });

  socket.on("screen-share-state", ({ sharing }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    if (sharing) {
      room.screenSharers.add(socket.id);
    } else {
      room.screenSharers.delete(socket.id);
    }

    io.to(roomId).emit("screen-share-state", {
      sharing: Boolean(sharing),
      sharerId: socket.id
    });
  });

  socket.on("set-control-permission", ({ participantId, control }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room || socket.id !== room.hostId || !room.participants.has(participantId)) {
      return;
    }

    const permissions = normalizeControlPermissions(control);
    room.controlPermissions.set(participantId, permissions);
    io.to(participantId).emit("control-permission", { control: permissions });
    broadcastRoomState(roomId);
  });

  socket.on("control-event", (event) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    const permissions = room?.controlPermissions.get(socket.id) || emptyControlPermissions();
    const isAllowedPointer = ["pointermove", "click"].includes(event?.type) && permissions.pointer;
    const isAllowedSpace = event?.type === "key" && event.key === " " && permissions.space;
    const isAllowedArrow = event?.type === "key" && /^Arrow(Up|Down|Left|Right)$/.test(event.key || "") && permissions.arrows;

    if (!room || socket.id === room.hostId || !hasAnyControl(permissions) || !(isAllowedPointer || isAllowedSpace || isAllowedArrow)) {
      return;
    }

    io.to(room.hostId).emit("control-event", {
      ...event,
      from: socket.id,
      fromName: socket.data.name || "Guest",
      at: Date.now()
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    room.participants.delete(socket.id);
    room.controlPermissions.delete(socket.id);
    room.screenSharers.delete(socket.id);
    socket.to(roomId).emit("peer-left", { id: socket.id });

    if (room.hostId === socket.id) {
      const nextHostId = room.participants.keys().next().value || null;
      room.hostId = nextHostId;
      room.hostName = nextHostId ? room.participants.get(nextHostId)?.name : room.hostName;

      if (nextHostId) {
        room.controlPermissions.set(nextHostId, fullControlPermissions());
        io.to(nextHostId).emit("host-changed", { hostId: nextHostId });
      }
    }

    if (room.participants.size === 0) {
      room.hostId = null;
      room.screenSharers.clear();
      scheduleRoomCleanup(roomId);
      return;
    }

    broadcastRoomState(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`ShareDesk Meet is listening on ${PORT}`);
});
