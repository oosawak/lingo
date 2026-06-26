const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const HEARTBEAT_TIMEOUT_MS = 15000;
const CLEANUP_INTERVAL_MS = 5000;
const MAGIC_WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const clients = new Set();
const rooms = new Map();

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function createSessionId() {
  return crypto.randomUUID();
}

function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = 0x81;
  return Buffer.concat([header, payload]);
}

function sendJSON(client, payload) {
  if (!client?.socket || client.socket.destroyed) {
    return;
  }

  try {
    client.socket.write(encodeFrame(JSON.stringify(payload)));
  } catch (error) {
    console.error('[lingo] websocket send failed:', error);
  }
}

function broadcast(roomId, payload, exceptSessionId = null) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  for (const [sessionId, client] of room.entries()) {
    if (sessionId === exceptSessionId) {
      continue;
    }

    sendJSON(client, payload);
  }
}

function roomParticipants(roomId, exceptSessionId = null) {
  const room = rooms.get(roomId);
  if (!room) {
    return [];
  }

  const list = [];
  for (const [sessionId, client] of room.entries()) {
    if (sessionId === exceptSessionId) {
      continue;
    }

    list.push({
      sessionId: client.sessionId,
      nickname: client.nickname,
      nativeLanguage: client.nativeLanguage,
      lastSeen: client.lastSeen,
      status: 'online',
    });
  }

  return list.sort((a, b) => a.nickname.localeCompare(b.nickname));
}

function removeFromRoom(client) {
  if (!client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (room) {
    room.delete(client.sessionId);
    broadcast(client.roomId, {
      type: 'participant_left',
      sessionId: client.sessionId,
      roomId: client.roomId,
    }, client.sessionId);

    if (room.size === 0) {
      rooms.delete(client.roomId);
    }
  }

  client.roomId = null;
}

function joinRoom(client, roomId) {
  if (!roomId) {
    return;
  }

  if (client.roomId && client.roomId !== roomId) {
    removeFromRoom(client);
  }

  client.roomId = roomId;
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }

  const room = rooms.get(roomId);
  room.set(client.sessionId, client);

  sendJSON(client, {
    type: 'join_success',
    roomId,
    participants: roomParticipants(roomId, client.sessionId),
  });

  broadcast(roomId, {
    type: 'participant_joined',
    participant: {
      sessionId: client.sessionId,
      nickname: client.nickname,
      nativeLanguage: client.nativeLanguage,
      lastSeen: client.lastSeen,
      status: 'online',
    },
  }, client.sessionId);
}

function updateClientPresence(client, payload = {}) {
  if (typeof payload.nickname === 'string' && payload.nickname.trim()) {
    client.nickname = payload.nickname.trim();
  }

  if (payload.nativeLanguage === 'en' || payload.nativeLanguage === 'ja') {
    client.nativeLanguage = payload.nativeLanguage;
  }

  client.lastSeen = Date.now();
}

function handleLogin(client, payload) {
  client.token = randomToken();
  client.sessionId = typeof payload.sessionId === 'string' && payload.sessionId.trim()
    ? payload.sessionId.trim()
    : createSessionId();
  client.nickname = typeof payload.username === 'string' && payload.username.trim()
    ? payload.username.trim()
    : 'Guest';
  client.nativeLanguage = payload.nativeLanguage === 'en' ? 'en' : 'ja';
  client.lastSeen = Date.now();

  sendJSON(client, {
    type: 'login_success',
    token: client.token,
    sessionId: client.sessionId,
  });
}

function handlePresence(client, payload) {
  if (!client.token || payload.token !== client.token) {
    return;
  }

  updateClientPresence(client, payload);

  if (client.roomId) {
    broadcast(client.roomId, {
      type: 'participant_updated',
      participant: {
        sessionId: client.sessionId,
        nickname: client.nickname,
        nativeLanguage: client.nativeLanguage,
        lastSeen: client.lastSeen,
        status: 'online',
      },
    }, client.sessionId);
  }
}

function handleChat(client, payload) {
  if (!client.token || payload.token !== client.token) {
    return;
  }

  if (!client.roomId || payload.roomId !== client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    return;
  }

  const target = room.get(payload.toSessionId);
  if (!target) {
    sendJSON(client, {
      type: 'error',
      message: 'Target participant is not in the room.',
    });
    return;
  }

  sendJSON(target, {
    type: 'chat',
    roomId: client.roomId,
    fromSessionId: client.sessionId,
    fromNickname: client.nickname,
    fromLanguage: client.nativeLanguage,
    toSessionId: target.sessionId,
    toNickname: target.nickname,
    originalText: payload.originalText ?? '',
    translatedText: payload.translatedText ?? '',
    targetLanguage: payload.targetLanguage ?? target.nativeLanguage,
    engineUsed: payload.engineUsed ?? 'Transformers.js',
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
  });
}

function handleRtcRelay(client, payload, type) {
  if (!client.token || payload.token !== client.token) {
    return;
  }

  if (!client.roomId || payload.roomId !== client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    return;
  }

  const target = room.get(payload.toSessionId);
  if (!target) {
    return;
  }

  sendJSON(target, {
    type,
    roomId: client.roomId,
    fromSessionId: client.sessionId,
    toSessionId: target.sessionId,
    sdp: payload.sdp ?? null,
    candidate: payload.candidate ?? null,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
  });
}

function handleDraw(client, payload) {
  if (!client.token || payload.token !== client.token) {
    return;
  }

  if (!client.roomId || payload.roomId !== client.roomId) {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    return;
  }

  const target = room.get(payload.toSessionId);
  if (!target) {
    return;
  }

  sendJSON(target, {
    type: 'draw',
    roomId: client.roomId,
    fromSessionId: client.sessionId,
    toSessionId: target.sessionId,
    kind: payload.kind ?? 'segment',
    x1: payload.x1 ?? null,
    y1: payload.y1 ?? null,
    x2: payload.x2 ?? null,
    y2: payload.y2 ?? null,
    x: payload.x ?? null,
    y: payload.y ?? null,
    color: payload.color ?? '#ffffff',
    size: payload.size ?? 4,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
  });
}

function handleLogout(client) {
  removeFromRoom(client);
  if (client.socket && !client.socket.destroyed) {
    client.socket.end();
  }
}

function handleSocketData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) {
        return;
      }
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) {
        return;
      }
      const bigLength = client.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        client.socket.destroy();
        return;
      }
      length = Number(bigLength);
      offset += 8;
    }

    let mask;
    if (masked) {
      if (client.buffer.length < offset + 4) {
        return;
      }
      mask = client.buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (client.buffer.length < offset + length) {
      return;
    }

    const payload = client.buffer.subarray(offset, offset + length);
    client.buffer = client.buffer.subarray(offset + length);

    if (opcode === 0x8) {
      client.socket.end();
      return;
    }

    if (opcode === 0x9) {
      const pong = Buffer.alloc(2 + payload.length);
      pong[0] = 0x8a;
      pong[1] = payload.length;
      payload.copy(pong, 2);
      client.socket.write(pong);
      continue;
    }

    if (opcode !== 0x1 && opcode !== 0x2) {
      continue;
    }

    let data = payload;
    if (masked && mask) {
      data = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    let message;
    try {
      message = JSON.parse(data.toString('utf8'));
    } catch {
      continue;
    }

    switch (message.type) {
      case 'login':
        handleLogin(client, message);
        break;
      case 'join':
        if (client.token && message.token === client.token && typeof message.roomId === 'string' && message.roomId.trim()) {
          joinRoom(client, message.roomId.trim());
        }
        break;
      case 'presence':
        handlePresence(client, message);
        break;
      case 'chat':
        handleChat(client, message);
        break;
      case 'offer':
      case 'answer':
      case 'ice':
      case 'hangup':
        handleRtcRelay(client, message, message.type);
        break;
      case 'draw':
        handleDraw(client, message);
        break;
      case 'logout':
        handleLogout(client);
        break;
      default:
        break;
    }
  }
}

function cleanupStaleClients() {
  const now = Date.now();

  for (const client of [...clients]) {
    if (!client.socket || client.socket.destroyed) {
      removeClient(client);
      continue;
    }

    if (!client.lastSeen || now - client.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      removeClient(client);
    }
  }
}

function removeClient(client) {
  removeFromRoom(client);
  clients.delete(client);

  if (client.socket && !client.socket.destroyed) {
    client.socket.destroy();
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('WebSocket endpoint only.');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();

  if (!key || upgrade !== 'websocket') {
    socket.destroy();
    return;
  }

  const accept = crypto.createHash('sha1').update(`${key}${MAGIC_WS_GUID}`).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  const client = {
    socket,
    buffer: Buffer.alloc(0),
    token: null,
    sessionId: null,
    nickname: 'Guest',
    nativeLanguage: 'ja',
    roomId: null,
    lastSeen: Date.now(),
  };

  clients.add(client);

  socket.on('data', (chunk) => handleSocketData(client, chunk));
  socket.on('close', () => removeClient(client));
  socket.on('error', () => removeClient(client));
});

setInterval(cleanupStaleClients, CLEANUP_INTERVAL_MS).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[lingo] signaling server listening on ws://0.0.0.0:${PORT}`);
});
