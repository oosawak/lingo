const chatLog = document.getElementById('chat-log');
const messageInput = document.getElementById('message-input');
const translateBtn = document.getElementById('translate-btn');
const loadWasmBtn = document.getElementById('load-wasm-btn');
const lobbySection = document.getElementById('lobby');
const roomSection = document.getElementById('translator');
const nicknameInput = document.getElementById('nickname-input');
const nativeLangSelect = document.getElementById('entry-lang');
const enterRoomBtn = document.getElementById('enter-room-btn');
const logoutBtn = document.getElementById('logout-btn');
const participantList = document.getElementById('participant-list');
const roomTitle = document.getElementById('room-title');
const sessionNickname = document.getElementById('session-nickname');
const sessionLanguage = document.getElementById('session-language');
const sessionRoute = document.getElementById('session-route');
const callStatus = document.getElementById('call-status');
const engineStatus = document.getElementById('engine-status');
const transformersStatus = document.getElementById('transformers-status');
const wasmStatus = document.getElementById('wasm-status');
const signalStatus = document.getElementById('signal-status');
const callBtn = document.getElementById('call-btn');
const hangupBtn = document.getElementById('hangup-btn');
const remoteAudio = document.getElementById('remote-audio');
const drawCanvasElement = document.getElementById('draw-canvas');
const drawClearBtn = document.getElementById('draw-clear-btn');

const STORAGE_KEYS = {
  profile: 'lingo.user.profile',
  engine: 'lingo.translation.engine',
  signalUrl: 'lingo.signal.url',
};

const DEFAULT_ENGINE = 'transformers';
const DEFAULT_ROOM_ID = 'main';
const DEFAULT_SIGNAL_URL = window.location.protocol === 'https:'
  ? 'wss://lyre3.com:8080'
  : 'ws://localhost:8080';
const PARTICIPANT_STALE_MS = 15000;
const PARTICIPANT_REFRESH_MS = 2000;
const HEARTBEAT_MS = 5000;

const MODEL_BY_ROUTE = {
  'ja|en': 'Xenova/nllb-200-distilled-600M',
  'en|ja': 'Xenova/nllb-200-distilled-600M',
};

let wasmModule = null;
let transformersWorker = null;
let transformersReadyModelIds = new Set();
let transformersInitPromises = new Map();
let transformersRequestSeq = 0;
let transformersPending = new Map();

let signalingSocket = null;
let signalToken = null;
let signalRoomId = null;
let signalHeartbeatTimer = null;
let participantRefreshTimer = null;
let peerConnection = null;
let localAudioStream = null;
let activeCallTargetSessionId = null;
let pendingRemoteCandidates = [];
let drawCanvas = null;
let drawIsSyncing = false;

const localSessionId = createSessionId();
const localProfile = loadSavedProfile();

const roomState = {
  nickname: localProfile.nickname,
  nativeLanguage: localProfile.nativeLanguage,
  activeParticipantId: null,
  chats: new Map(),
  participants: new Map(),
  drawings: new Map(),
};

function createSessionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function loadSavedProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.profile);
    if (!raw) {
      return { nickname: '', nativeLanguage: 'ja' };
    }

    const parsed = JSON.parse(raw);
    return {
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '',
      nativeLanguage: parsed.nativeLanguage === 'en' ? 'en' : 'ja',
    };
  } catch {
    return { nickname: '', nativeLanguage: 'ja' };
  }
}

function saveProfile() {
  window.localStorage.setItem(
    STORAGE_KEYS.profile,
    JSON.stringify({
      nickname: roomState.nickname,
      nativeLanguage: roomState.nativeLanguage,
    }),
  );
}

function saveSignalUrl(url) {
  window.localStorage.setItem(STORAGE_KEYS.signalUrl, url);
}

function resolveSignalUrl() {
  const query = new URLSearchParams(window.location.search);
  const fromQuery = query.get('signal');
  if (fromQuery) {
    return fromQuery;
  }

  const saved = window.localStorage.getItem(STORAGE_KEYS.signalUrl);
  if (saved) {
    return saved;
  }

  return DEFAULT_SIGNAL_URL;
}

function resolveInitialEngine() {
  const saved = window.localStorage.getItem(STORAGE_KEYS.engine);
  return saved === 'wasm' ? 'wasm' : DEFAULT_ENGINE;
}

function langLabel(code) {
  return code === 'ja' ? '日本語' : 'English';
}

function langTitleLabel(code) {
  return code === 'ja' ? '日本語' : 'ENGLISH';
}

function displayNickname() {
  const value = roomState.nickname || 'You';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function routeLabel(from, to) {
  return `${langLabel(from)} → ${langLabel(to)}`;
}

function getOppositeLanguage(code) {
  return code === 'ja' ? 'en' : 'ja';
}

function setRoomVisible(visible) {
  lobbySection.hidden = visible;
  roomSection.hidden = !visible;
}

function setSignalStatus(text) {
  signalStatus.textContent = text;
}

function setEngineStatus(text) {
  engineStatus.textContent = text;
}

function setTransformersStatus(text) {
  transformersStatus.textContent = text;
}

function setCallStatus(text) {
  callStatus.textContent = text;
}

function updateCallButtons() {
  const active = Boolean(peerConnection);
  callBtn.disabled = active || !getActiveParticipant();
  hangupBtn.disabled = !active;
  if (drawClearBtn) {
    drawClearBtn.disabled = !getActiveParticipant();
  }
}

function getRoute(from, to) {
  return MODEL_BY_ROUTE[`${from}|${to}`] ?? null;
}

function getTranslationOptions(modelId, from, to) {
  if (modelId === 'Xenova/nllb-200-distilled-600M') {
    return {
      srcLang: from === 'ja' ? 'jpn_Jpan' : 'eng_Latn',
      tgtLang: to === 'ja' ? 'jpn_Jpan' : 'eng_Latn',
    };
  }

  return {};
}

function getConversationMessages(participantId) {
  if (!roomState.chats.has(participantId)) {
    roomState.chats.set(participantId, []);
  }

  return roomState.chats.get(participantId);
}

function getParticipants() {
  return [...roomState.participants.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));
}

function getActiveParticipant() {
  if (!roomState.activeParticipantId) {
    return null;
  }

  return roomState.participants.get(roomState.activeParticipantId) ?? null;
}

function getDrawingEvents(participantId) {
  if (!roomState.drawings.has(participantId)) {
    roomState.drawings.set(participantId, []);
  }

  return roomState.drawings.get(participantId);
}

function ensureFabricCanvas() {
  if (drawCanvas) {
    return drawCanvas;
  }

  if (!window.fabric?.Canvas) {
    throw new Error('Fabric.js is not available');
  }

  drawCanvas = new window.fabric.Canvas(drawCanvasElement, {
    isDrawingMode: true,
    selection: false,
    preserveObjectStacking: true,
    stopContextMenu: true,
  });
  drawCanvas.freeDrawingBrush.color = '#78d3ff';
  drawCanvas.freeDrawingBrush.width = 4;
  drawCanvas.on('path:created', handleLocalPathCreated);
  resizeDrawingCanvas();
  return drawCanvas;
}

function resizeDrawingCanvas() {
  if (!drawCanvas || !drawCanvasElement) {
    return;
  }

  const rect = drawCanvasElement.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height));
  drawCanvas.setDimensions({ width, height });
  drawCanvas.calcOffset();
  redrawDrawingCanvas();
}

function redrawDrawingCanvas() {
  if (!drawCanvas) {
    return;
  }

  const participant = getActiveParticipant();
  drawIsSyncing = true;
  drawCanvas.clear();

  if (participant) {
    for (const entry of getDrawingEvents(participant.sessionId)) {
      applyDrawingEntry(entry);
    }
  }

  drawCanvas.renderAll();
  drawIsSyncing = false;
  updateCallButtons();
}

function applyDrawingEntry(entry) {
  if (!drawCanvas) {
    return;
  }

  if (entry.kind === 'clear') {
    drawCanvas.clear();
    return;
  }

  if (entry.kind === 'path' && entry.object?.path) {
    const path = new window.fabric.Path(entry.object.path, entry.object);
    drawCanvas.add(path);
  }
}

function handleLocalPathCreated(event) {
  if (drawIsSyncing) {
    return;
  }

  const participant = getActiveParticipant();
  if (!participant) {
    drawCanvas?.clear();
    return;
  }

  const object = event.path?.toObject?.();
  if (!object) {
    return;
  }

  getDrawingEvents(participant.sessionId).push({ kind: 'path', object });
  sendSignalMessage({
    type: 'draw',
    toSessionId: participant.sessionId,
    kind: 'path',
    object,
  });
}

function handleRemoteDraw(message) {
  const participantId = message.fromSessionId;
  if (!participantId) {
    return;
  }

  if (message.kind === 'clear') {
    roomState.drawings.set(participantId, []);
  } else if (message.kind === 'path' && message.object) {
    getDrawingEvents(participantId).push({ kind: 'path', object: message.object });
  }

  if (roomState.activeParticipantId === participantId) {
    redrawDrawingCanvas();
  }
}

function clearDrawingCanvas(sendRemote = true) {
  const participant = getActiveParticipant();
  if (!participant) {
    return;
  }

  roomState.drawings.set(participant.sessionId, []);
  redrawDrawingCanvas();

  if (sendRemote) {
    sendSignalMessage({
      type: 'draw',
      toSessionId: participant.sessionId,
      kind: 'clear',
    });
  }
}

function ensureSelection() {
  const participants = getParticipants();
  if (participants.length === 0) {
    roomState.activeParticipantId = null;
    messageInput.placeholder = '入室中の人がいません';
    translateBtn.disabled = true;
    updateCallButtons();
    redrawDrawingCanvas();
    return;
  }

  const exists = participants.some((participant) => participant.sessionId === roomState.activeParticipantId);
  if (!exists) {
    roomState.activeParticipantId = participants[0].sessionId;
  }

  translateBtn.disabled = false;
  messageInput.placeholder = `${getActiveParticipant()?.nickname ?? '相手'} へ送るメッセージを入力`;
  updateCallButtons();
  redrawDrawingCanvas();
}

function addBubble(text, side, label) {
  const row = document.createElement('div');
  row.className = `bubble-row ${side}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${side}`;

  const meta = document.createElement('span');
  meta.className = 'bubble-meta';
  meta.textContent = label;

  const body = document.createElement('div');
  body.textContent = text;

  bubble.append(meta, body);
  row.appendChild(bubble);
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderChat() {
  chatLog.innerHTML = '';

  const participant = getActiveParticipant();
  if (!participant) {
    addBubble('入室中の人を待っています。', 'left', 'System');
    return;
  }

  const messages = getConversationMessages(participant.sessionId);
  if (messages.length === 0) {
    addBubble(`${participant.nickname} と会話を開始できます。`, 'left', 'System');
    addBubble(`設定: ${routeLabel(roomState.nativeLanguage, participant.nativeLanguage)}`, 'left', 'System');
    return;
  }

  for (const message of messages) {
    addBubble(message.text, message.side, message.label);
  }
}

function renderParticipants() {
  participantList.innerHTML = '';

  const participants = getParticipants();
  if (participants.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'participant-empty';
    empty.textContent = '入室中の人はいません。';
    participantList.appendChild(empty);
    return;
  }

  for (const participant of participants) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `participant-item${participant.sessionId === roomState.activeParticipantId ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(participant.sessionId === roomState.activeParticipantId));
    button.innerHTML = `
      <strong>${participant.nickname}</strong>
      <span>${langLabel(participant.nativeLanguage)} / ${participant.status}</span>
    `;

    button.addEventListener('click', () => {
      roomState.activeParticipantId = participant.sessionId;
      roomTitle.textContent = `${roomState.nickname} · ${participant.nickname}`;
      sessionRoute.textContent = `route: ${routeLabel(roomState.nativeLanguage, participant.nativeLanguage)}`;
      messageInput.placeholder = `${participant.nickname} へ送るメッセージを入力`;
      renderParticipants();
      renderChat();
      redrawDrawingCanvas();
      updateCallButtons();
    });

    participantList.appendChild(button);
  }
}

function updateSessionHeader() {
  sessionNickname.textContent = `nickname: ${roomState.nickname || '-'}`;
  sessionLanguage.textContent = `language: ${langLabel(roomState.nativeLanguage)}`;
  const active = getActiveParticipant();
  sessionRoute.textContent = active
    ? `route: ${routeLabel(roomState.nativeLanguage, active.nativeLanguage)}`
    : 'route: -';
}

function syncParticipant(participant) {
  if (!participant || participant.sessionId === localSessionId) {
    return;
  }

  roomState.participants.set(participant.sessionId, {
    sessionId: participant.sessionId,
    nickname: participant.nickname || 'Guest',
    nativeLanguage: participant.nativeLanguage === 'en' ? 'en' : 'ja',
    lastSeen: typeof participant.lastSeen === 'number' ? participant.lastSeen : Date.now(),
    status: participant.status || 'online',
  });

  ensureSelection();
  updateSessionHeader();
  renderParticipants();
}

function connectSignaling() {
  const url = resolveSignalUrl();
  saveSignalUrl(url);
  setSignalStatus(`signal: connecting (${url})`);

  try {
    signalingSocket = new WebSocket(url);
  } catch (error) {
    console.error('[lingo] WebSocket creation failed:', error);
    setSignalStatus('signal: unavailable');
    return;
  }

  signalingSocket.addEventListener('open', () => {
    setSignalStatus('signal: connected');
    signalingSocket.send(JSON.stringify({
      type: 'login',
      username: roomState.nickname,
      nativeLanguage: roomState.nativeLanguage,
      sessionId: localSessionId,
    }));
  });

  signalingSocket.addEventListener('message', async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === 'login_success') {
      signalToken = msg.token;
      signalRoomId = msg.roomId || DEFAULT_ROOM_ID;
      signalingSocket.send(JSON.stringify({
        type: 'join',
        roomId: signalRoomId,
        token: signalToken,
        nickname: roomState.nickname,
        nativeLanguage: roomState.nativeLanguage,
        sessionId: localSessionId,
      }));
      if (signalHeartbeatTimer) {
        window.clearInterval(signalHeartbeatTimer);
      }
      signalHeartbeatTimer = window.setInterval(() => {
        if (signalingSocket?.readyState === WebSocket.OPEN && signalToken) {
          signalingSocket.send(JSON.stringify({
            type: 'presence',
            roomId: signalRoomId,
            token: signalToken,
            sessionId: localSessionId,
            nickname: roomState.nickname,
            nativeLanguage: roomState.nativeLanguage,
            lastSeen: Date.now(),
          }));
        }
      }, HEARTBEAT_MS);
      return;
    }

    if (msg.type === 'join_success' && Array.isArray(msg.participants)) {
      roomState.participants.clear();
      for (const participant of msg.participants) {
        if (participant.sessionId !== localSessionId) {
          syncParticipant(participant);
        }
      }
      renderParticipants();
      ensureSelection();
      updateSessionHeader();
      renderChat();
      return;
    }

    if (msg.type === 'participant_joined' || msg.type === 'participant_updated') {
      syncParticipant(msg.participant || msg);
      return;
    }

    if (msg.type === 'participant_left') {
      roomState.participants.delete(msg.sessionId);
      if (roomState.activeParticipantId === msg.sessionId) {
        roomState.activeParticipantId = null;
      }
      if (activeCallTargetSessionId === msg.sessionId) {
        cleanupCall(false);
      }
      ensureSelection();
      updateSessionHeader();
      renderParticipants();
      renderChat();
      updateCallButtons();
      return;
    }

    if (msg.type === 'offer') {
      await acceptCall(msg);
      return;
    }

    if (msg.type === 'answer') {
      await handleRemoteAnswer(msg);
      return;
    }

    if (msg.type === 'ice') {
      await handleRemoteIce(msg);
      return;
    }

    if (msg.type === 'hangup') {
      if (msg.fromSessionId === activeCallTargetSessionId) {
        cleanupCall(false);
      }
      return;
    }

    if (msg.type === 'draw' && msg.toSessionId === localSessionId) {
      handleRemoteDraw(msg);
      return;
    }

    if (msg.type === 'chat' && msg.toSessionId === localSessionId) {
      const sender = roomState.participants.get(msg.fromSessionId);
      const senderName = sender?.nickname ?? msg.fromNickname ?? 'Guest';
      const senderLanguage = msg.fromLanguage === 'en' ? 'en' : 'ja';
      const messages = getConversationMessages(msg.fromSessionId);
      messages.push({
        text: msg.originalText,
        side: 'left',
        label: `${senderName}・${langTitleLabel(senderLanguage)}`,
      });
      messages.push({
        text: msg.translatedText,
        side: 'left',
        label: `${senderName}・${langTitleLabel(roomState.nativeLanguage)}`,
      });
      if (roomState.activeParticipantId === msg.fromSessionId) {
        renderChat();
      }
    }
  });

  signalingSocket.addEventListener('close', () => {
    setSignalStatus('signal: disconnected');
  });

  signalingSocket.addEventListener('error', () => {
    setSignalStatus('signal: error');
  });
}

function disconnectSignaling(sendLogout = true) {
  if (signalHeartbeatTimer) {
    window.clearInterval(signalHeartbeatTimer);
    signalHeartbeatTimer = null;
  }

  if (signalingSocket && sendLogout && signalToken && signalRoomId && signalingSocket.readyState === WebSocket.OPEN) {
    signalingSocket.send(JSON.stringify({
      type: 'logout',
      roomId: signalRoomId,
      token: signalToken,
      sessionId: localSessionId,
    }));
  }

  signalingSocket?.close();
  signalingSocket = null;
  signalToken = null;
  signalRoomId = null;
}

function sendSignalMessage(payload) {
  if (signalingSocket?.readyState === WebSocket.OPEN && signalToken && signalRoomId) {
    signalingSocket.send(JSON.stringify({
      ...payload,
      roomId: signalRoomId,
      token: signalToken,
      timestamp: Date.now(),
    }));
  }
}

function getActiveCallTarget() {
  return getActiveParticipant();
}

async function ensureLocalAudio() {
  if (localAudioStream) {
    return localAudioStream;
  }

  localAudioStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  return localAudioStream;
}

function getRtcConfig() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };
}

function cleanupCall(sendHangup = false) {
  if (sendHangup && activeCallTargetSessionId) {
    sendSignalMessage({
      type: 'hangup',
      toSessionId: activeCallTargetSessionId,
    });
  }

  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }

  if (localAudioStream) {
    for (const track of localAudioStream.getTracks()) {
      track.stop();
    }
    localAudioStream = null;
  }

  pendingRemoteCandidates = [];
  activeCallTargetSessionId = null;
  remoteAudio.srcObject = null;
  setCallStatus('call: idle');
  updateCallButtons();
}

async function startCall() {
  const target = getActiveCallTarget();
  if (!target) {
    addBubble('通話相手がいません。', 'left', 'System');
    return;
  }

  if (peerConnection) {
    return;
  }

  try {
    setCallStatus(`call: connecting ${target.nickname}`);
    activeCallTargetSessionId = target.sessionId;
    const stream = await ensureLocalAudio();
    const pc = new RTCPeerConnection(getRtcConfig());
    peerConnection = pc;
    updateCallButtons();

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    pc.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
      void remoteAudio.play().catch(() => {});
      setCallStatus(`call: connected ${target.nickname}`);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      sendSignalMessage({
        type: 'ice',
        toSessionId: target.sessionId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      if (!peerConnection) {
        return;
      }
      if (pc.connectionState === 'connected') {
        setCallStatus(`call: connected ${target.nickname}`);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        cleanupCall(false);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignalMessage({
      type: 'offer',
      toSessionId: target.sessionId,
      sdp: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription,
    });
  } catch (error) {
    console.error('[lingo] startCall failed:', error);
    setCallStatus('call: error');
    cleanupCall(false);
    addBubble(`通話を開始できませんでした。${error instanceof Error ? error.message : ''}`, 'left', 'System');
  }
}

async function acceptCall(message) {
  if (peerConnection) {
    cleanupCall(false);
  }

  activeCallTargetSessionId = message.fromSessionId;
  setCallStatus(`call: incoming ${roomState.participants.get(message.fromSessionId)?.nickname ?? 'Guest'}`);

  try {
    const stream = await ensureLocalAudio();
    const pc = new RTCPeerConnection(getRtcConfig());
    peerConnection = pc;
    updateCallButtons();

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    pc.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
      void remoteAudio.play().catch(() => {});
      setCallStatus(`call: connected ${roomState.participants.get(message.fromSessionId)?.nickname ?? 'Guest'}`);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      sendSignalMessage({
        type: 'ice',
        toSessionId: message.fromSessionId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      if (!peerConnection) {
        return;
      }
      if (pc.connectionState === 'connected') {
        setCallStatus(`call: connected ${roomState.participants.get(message.fromSessionId)?.nickname ?? 'Guest'}`);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        cleanupCall(false);
      }
    };

    await pc.setRemoteDescription(message.sdp);
    for (const candidate of pendingRemoteCandidates) {
      await pc.addIceCandidate(candidate);
    }
    pendingRemoteCandidates = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignalMessage({
      type: 'answer',
      toSessionId: message.fromSessionId,
      sdp: pc.localDescription?.toJSON ? pc.localDescription.toJSON() : pc.localDescription,
    });
  } catch (error) {
    console.error('[lingo] acceptCall failed:', error);
    setCallStatus('call: error');
    cleanupCall(false);
  }
}

async function handleRemoteAnswer(message) {
  if (!peerConnection) {
    return;
  }

  try {
    await peerConnection.setRemoteDescription(message.sdp);
    for (const candidate of pendingRemoteCandidates) {
      await peerConnection.addIceCandidate(candidate);
    }
    pendingRemoteCandidates = [];
    setCallStatus(`call: connected ${roomState.participants.get(message.fromSessionId)?.nickname ?? 'Guest'}`);
  } catch (error) {
    console.error('[lingo] handleRemoteAnswer failed:', error);
    cleanupCall(false);
  }
}

async function handleRemoteIce(message) {
  const candidate = message.candidate;
  if (!candidate) {
    return;
  }

  if (!peerConnection?.remoteDescription) {
    pendingRemoteCandidates.push(candidate);
    return;
  }

  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (error) {
    console.error('[lingo] handleRemoteIce failed:', error);
  }
}

function autoEnterIfSaved() {
  if (!roomState.nickname) {
    return;
  }

  nicknameInput.value = roomState.nickname;
  nativeLangSelect.value = roomState.nativeLanguage;
  enterRoom();
}

async function ensureTransformersReady(from, to) {
  const modelId = getRoute(from, to);
  if (!modelId) {
    throw new Error(`Unsupported language pair: ${from} -> ${to}`);
  }

  if (transformersReadyModelIds.has(modelId)) {
    return modelId;
  }

  if (transformersInitPromises.has(modelId)) {
    return transformersInitPromises.get(modelId);
  }

  setTransformersStatus(`transformers: loading ${modelId}`);
  const promise = postTransformersMessage({
    type: 'init',
    modelId,
    ...getTranslationOptions(modelId, from, to),
  })
    .then(() => {
      transformersReadyModelIds.add(modelId);
      return modelId;
    })
    .finally(() => {
      transformersInitPromises.delete(modelId);
    });

  transformersInitPromises.set(modelId, promise);
  return promise;
}

function ensureTransformersWorker() {
  if (transformersWorker) {
    return transformersWorker;
  }

  const worker = new Worker(new URL('./transformers/translation.worker.js', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event) => {
    const msg = event.data;
    const pending = transformersPending.get(msg.requestId);
    if (!pending) {
      return;
    }

    transformersPending.delete(msg.requestId);

    if (msg.type === 'error') {
      pending.reject(new Error(msg.error));
      return;
    }

    if (msg.type === 'ready') {
      transformersReadyModelIds.add(msg.modelId);
      setEngineStatus(`engine: Transformers.js (${Math.round(msg.loadTimeMs)}ms)`);
      setTransformersStatus(`transformers: ready ${msg.modelId}`);
    }

    pending.resolve(msg);
  };

  worker.onerror = (event) => {
    const error = event.error ?? new Error(event.message || 'Transformers worker failed');
    console.error('[lingo] Transformers worker error:', error);
    setEngineStatus('engine: error');
    setTransformersStatus(`transformers: error`);

    for (const [, pending] of transformersPending) {
      pending.reject(error);
    }
    transformersPending.clear();
  };

  transformersWorker = worker;
  return worker;
}

function postTransformersMessage(message) {
  const worker = ensureTransformersWorker();
  const requestId = ++transformersRequestSeq;

  return new Promise((resolve, reject) => {
    transformersPending.set(requestId, { resolve, reject });
    worker.postMessage({ ...message, requestId });
  });
}

async function preloadTransformers(from, to, detail) {
  void detail;
  await ensureTransformersReady(from, to);
}

async function loadWasm() {
  if (wasmModule) {
    wasmStatus.textContent = 'WASM: ready';
    return wasmModule;
  }

  wasmStatus.textContent = 'WASM: loading...';
  try {
    const mod = await import('./wasm/lingo_wasm.js');
    if (typeof mod.default === 'function') {
      await mod.default();
    }
    wasmModule = mod;
    wasmStatus.textContent = 'WASM: ready';
    return wasmModule;
  } catch (error) {
    console.error('[lingo] WASM module load failed:', error);
    wasmStatus.textContent = 'WASM: unavailable';
    throw error;
  }
}

async function translateWithTransformers(text, from, to) {
  const modelId = await ensureTransformersReady(from, to);
  const result = await postTransformersMessage({
    type: 'translate',
    text,
    ...getTranslationOptions(modelId, from, to),
  });
  return result.translatedText;
}

async function translateWithWasm(text, from, to) {
  const mod = await loadWasm();
  if (typeof mod.translate !== 'function') {
    throw new Error('WASM translation export not found');
  }
  return await mod.translate(text, from, to);
}

async function translate(text, from, to) {
  setEngineStatus('engine: Transformers.js');
  setTransformersStatus('transformers: translating');
  return {
    text: await translateWithTransformers(text, from, to),
    engineUsed: 'Transformers.js',
  };
}

function saveMessage(participantId, message) {
  const messages = getConversationMessages(participantId);
  messages.push(message);
}

function enterRoom() {
  const nickname = nicknameInput.value.trim() || 'You';
  const nativeLanguage = nativeLangSelect.value === 'en' ? 'en' : 'ja';

  roomState.nickname = nickname;
  roomState.nativeLanguage = nativeLanguage;
  saveProfile();

  nicknameInput.value = nickname;
  nativeLangSelect.disabled = true;
  roomTitle.textContent = displayNickname();
  updateSessionHeader();
  setRoomVisible(true);
  setSignalStatus('signal: connecting');
  if (drawCanvas) {
    window.requestAnimationFrame(() => {
      resizeDrawingCanvas();
    });
  }

  if (signalingSocket?.readyState === WebSocket.OPEN || signalingSocket?.readyState === WebSocket.CONNECTING) {
    disconnectSignaling(false);
  }

  connectSignaling();
  renderParticipants();
  renderChat();

  if (resolveInitialEngine() !== 'wasm') {
    setTransformersStatus('transformers: idle');
  }
}

function logoutRoom() {
  cleanupCall(true);
  disconnectSignaling(true);
  roomState.activeParticipantId = null;
  roomState.participants.clear();
  roomState.chats.clear();
  roomState.drawings.clear();
  nativeLangSelect.disabled = false;
  roomTitle.textContent = 'Room';
  sessionNickname.textContent = 'nickname: -';
  sessionLanguage.textContent = 'language: -';
  sessionRoute.textContent = 'route: -';
  messageInput.placeholder = '例: こんにちは、WASM で翻訳したい';
  setRoomVisible(false);
  renderParticipants();
  renderChat();
  if (drawCanvas) {
    drawCanvas.clear();
  }
  setSignalStatus('signal: disconnected');
}

async function handleTranslate() {
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  const participant = getActiveParticipant();
  if (!participant) {
    addBubble('入室中の人がいません。', 'left', 'System');
    return;
  }

  const from = roomState.nativeLanguage;
  const to = participant.nativeLanguage;
  messageInput.value = '';

  try {
    const translated = await translate(text, from, to);
    const sourceLabel = `${displayNickname()}・${langTitleLabel(from)}`;
    const label = `${displayNickname()}・${langTitleLabel(to)}`;
    addBubble(text, 'right', sourceLabel);
    addBubble(translated.text, 'right', label);

    saveMessage(participant.sessionId, {
      text,
      side: 'right',
      label: sourceLabel,
    });
    saveMessage(participant.sessionId, {
      text: translated.text,
      side: 'right',
      label,
    });

    if (signalingSocket?.readyState === WebSocket.OPEN && signalToken && signalRoomId) {
      signalingSocket.send(JSON.stringify({
        type: 'chat',
        roomId: signalRoomId,
        token: signalToken,
        fromSessionId: localSessionId,
        fromNickname: roomState.nickname,
        fromLanguage: from,
        toSessionId: participant.sessionId,
        toNickname: participant.nickname,
        originalText: text,
        translatedText: translated.text,
        targetLanguage: to,
        engineUsed: translated.engineUsed,
        timestamp: Date.now(),
      }));
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '翻訳に失敗しました。';
    setTransformersStatus('transformers: error');
    addBubble(`翻訳に失敗しました。${message ? ` ${message}` : ''}`, 'left', 'System');
    console.error(error);
  }
}

function refreshStaleParticipants() {
  const now = Date.now();
  const participants = [...roomState.participants.values()];
  for (const participant of participants) {
    if (now - (participant.lastSeen ?? 0) > PARTICIPANT_STALE_MS) {
      roomState.participants.delete(participant.sessionId);
    }
  }
  ensureSelection();
  updateSessionHeader();
  renderParticipants();
  renderChat();
}

function startTimers() {
  if (participantRefreshTimer) {
    window.clearInterval(participantRefreshTimer);
  }
  participantRefreshTimer = window.setInterval(() => {
    refreshStaleParticipants();
  }, PARTICIPANT_REFRESH_MS);
}

function stopTimers() {
  if (participantRefreshTimer) {
    window.clearInterval(participantRefreshTimer);
    participantRefreshTimer = null;
  }
}

translateBtn.addEventListener('click', () => {
  void handleTranslate();
});

enterRoomBtn.addEventListener('click', () => {
  enterRoom();
});

logoutBtn.addEventListener('click', () => {
  logoutRoom();
});

callBtn.addEventListener('click', () => {
  void startCall();
});

hangupBtn.addEventListener('click', () => {
  cleanupCall(true);
});

loadWasmBtn.addEventListener('click', () => {
  setTransformersStatus('transformers: idle');
});

if (drawClearBtn) {
  drawClearBtn.addEventListener('click', () => {
    clearDrawingCanvas(true);
  });
}

messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    void handleTranslate();
  }
});

nicknameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    enterRoom();
  }
});

nativeLangSelect.addEventListener('change', () => {
  roomState.nativeLanguage = nativeLangSelect.value === 'en' ? 'en' : 'ja';
  saveProfile();
});

window.addEventListener('beforeunload', () => {
  cleanupCall(true);
  disconnectSignaling(true);
  stopTimers();
});

window.addEventListener('resize', () => {
  if (drawCanvas) {
    resizeDrawingCanvas();
  }
});

setRoomVisible(false);
sessionNickname.textContent = 'nickname: -';
sessionLanguage.textContent = 'language: -';
sessionRoute.textContent = 'route: -';
setSignalStatus('signal: disconnected');
setCallStatus('call: idle');
setEngineStatus('engine: Transformers.js');
setTransformersStatus('transformers: idle');
addBubble('ここが lingo の公開ページです。', 'left', 'System');
addBubble('入室すると、実際に入っている人だけが一覧に出ます。', 'left', 'System');
updateCallButtons();

window.addEventListener('load', () => {
  if (roomState.nickname) {
    nicknameInput.value = roomState.nickname;
    nativeLangSelect.value = roomState.nativeLanguage;
  }

  if (drawCanvasElement) {
    try {
      ensureFabricCanvas();
      window.requestAnimationFrame(() => {
        resizeDrawingCanvas();
      });
    } catch (error) {
      console.warn('[lingo] Fabric.js drawing board unavailable:', error);
    }
  }

  renderParticipants();
  renderChat();
  startTimers();

  window.requestAnimationFrame(() => {
    if (roomState.nickname) {
      enterRoom();
    }
  });
});
