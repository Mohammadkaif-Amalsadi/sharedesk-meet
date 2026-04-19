const socket = io();

const hostForm = document.querySelector("#hostForm");
const joinForm = document.querySelector("#joinForm");
const homeActions = document.querySelector("#homeActions");
const showHostBtn = document.querySelector("#showHostBtn");
const showJoinBtn = document.querySelector("#showJoinBtn");
const hostBackBtn = document.querySelector("#hostBackBtn");
const joinBackBtn = document.querySelector("#joinBackBtn");
const hostNameInput = document.querySelector("#hostNameInput");
const hostRoomInput = document.querySelector("#hostRoomInput");
const delayedStartInput = document.querySelector("#delayedStartInput");
const hostStartNote = document.querySelector("#hostStartNote");
const homeMessage = document.querySelector("#homeMessage");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const welcome = document.querySelector("#welcome");
const meeting = document.querySelector("#meeting");
const roomTitle = document.querySelector("#roomTitle");
const rolePill = document.querySelector("#rolePill");
const startStatus = document.querySelector("#startStatus");
const cameraBtn = document.querySelector("#cameraBtn");
const micBtn = document.querySelector("#micBtn");
const shareBtn = document.querySelector("#shareBtn");
const requestControlBtn = document.querySelector("#requestControlBtn");
const screenMuteBtn = document.querySelector("#screenMuteBtn");
const screenVolumeInput = document.querySelector("#screenVolumeInput");
const directVoiceInput = document.querySelector("#directVoiceInput");
const pushToTalkInput = document.querySelector("#pushToTalkInput");
const pushKeyInput = document.querySelector("#pushKeyInput");
const pushStatus = document.querySelector("#pushStatus");
const videoGrid = document.querySelector("#videoGrid");
const screenVideo = document.querySelector("#screenVideo");
const screenPlaceholder = document.querySelector("#screenPlaceholder");
const shareStrip = document.querySelector("#shareStrip");
const hostPanel = document.querySelector("#hostPanel");
const participantList = document.querySelector("#participantList");
const controlRequests = document.querySelector("#controlRequests");
const activityLog = document.querySelector("#activityLog");
const remoteCursor = document.querySelector("#remoteCursor");

const peerConnections = new Map();
const remoteStreams = new Map();
const screenShareStreams = new Map();
const knownScreenSharers = new Set();
const participants = new Map();
const pendingCandidates = new Map();
const voiceMeters = new Map();

let selfId = null;
let roomId = null;
let displayName = null;
let hostId = null;
let isHost = false;
let localCameraStream = null;
let localScreenStream = null;
let activeShareId = null;
let sessionStartAt = null;
let sessionStarted = true;
let sessionTimer = null;
let cameraEnabled = false;
let micEnabled = true;
let audioMode = "direct";
let pushKey = "U";
let isPushKeyDown = false;
let audioContext = null;

const localControl = {
  pointer: false,
  space: false,
  arrows: false
};

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

showHostBtn.addEventListener("click", () => showHomeMode("host"));
showJoinBtn.addEventListener("click", () => showHomeMode("join"));
hostBackBtn.addEventListener("click", () => showHomeMode("home"));
joinBackBtn.addEventListener("click", () => showHomeMode("home"));

delayedStartInput.addEventListener("change", () => {
  hostStartNote.textContent = delayedStartInput.checked
    ? "Session starts 15 minutes after initialization."
    : "Session starts immediately unless delayed.";
});

hostForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const startAt = delayedStartInput.checked ? Date.now() + 15 * 60 * 1000 : Date.now();
  await joinRoom(hostNameInput.value.trim(), hostRoomInput.value.trim(), startAt, "host");
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await joinRoom(nameInput.value.trim(), roomInput.value.trim(), null, "join");
});

screenMuteBtn.addEventListener("click", () => {
  screenVideo.muted = !screenVideo.muted;
  screenMuteBtn.textContent = screenVideo.muted ? "Screen sound off" : "Screen sound on";
  screenMuteBtn.classList.toggle("danger", screenVideo.muted);
});

screenVolumeInput.addEventListener("input", () => {
  screenVideo.volume = Number(screenVolumeInput.value);
  if (screenVideo.volume > 0 && screenVideo.muted) {
    screenVideo.muted = false;
    screenMuteBtn.textContent = "Screen sound on";
    screenMuteBtn.classList.remove("danger");
  }
});

showHomeMode(location.hash === "#join" ? "join" : location.hash === "#host" ? "host" : "home");

async function joinRoom(name, code, startAt, mode) {
  displayName = name || "Guest";
  roomId = code;
  homeMessage.textContent = "";

  if (!roomId) {
    return;
  }

  await startLocalMedia();

  socket.emit("join-room", { roomId, name: displayName, sessionStartAt: startAt, mode }, async (response) => {
    if (!response?.ok) {
      homeMessage.textContent = response?.error || "Could not join the room.";
      return;
    }

    selfId = response.selfId;
    hostId = response.hostId;
    isHost = response.isHost;
    sessionStartAt = response.sessionStartAt || Date.now();
    setLocalControl(isHost ? { pointer: true, space: true, arrows: true } : {});

    welcome.classList.add("hidden");
    meeting.classList.remove("hidden");
    roomTitle.textContent = roomId;
    upsertParticipant({
      id: selfId,
      name: `${displayName} (you)`,
      isHost,
      control: { ...localControl }
    });
    addVideoTile(selfId, displayName, localCameraStream, true);
    startVoiceMeter(selfId, localCameraStream);

    response.peers.forEach((peer) => {
      upsertParticipant(peer);
      createPeerConnection(peer.id, true);
    });

    response.screenSharers.forEach((sharerId) => {
      knownScreenSharers.add(sharerId);
      if (sharerId !== selfId) {
        logActivity(`${participantName(sharerId)} is sharing a screen.`);
      }
    });

    renderRole();
    updateSessionStartState();
    renderParticipants();
    renderShareStrip();
    logActivity(isHost ? "You are the host." : "Joined the room.");
  });
}

cameraBtn.addEventListener("click", () => {
  if (cameraEnabled) {
    stopCamera();
  } else {
    startCamera();
  }
});

micBtn.addEventListener("click", () => {
  micEnabled = !micEnabled;
  applyAudioMode();
  micBtn.textContent = micEnabled ? "Mic on" : "Mic off";
  micBtn.classList.toggle("secondary", !micEnabled);
});

directVoiceInput.addEventListener("change", () => {
  audioMode = "direct";
  applyAudioMode();
});

pushToTalkInput.addEventListener("change", () => {
  audioMode = "push";
  applyAudioMode();
});

pushKeyInput.addEventListener("keydown", (event) => {
  event.preventDefault();

  if (event.key.length === 1) {
    pushKey = event.key.toUpperCase();
    pushKeyInput.value = pushKey;
    applyAudioMode();
  }
});

shareBtn.addEventListener("click", async () => {
  if (!sessionStarted) {
    logActivity("The session has not started yet.");
    return;
  }

  if (localScreenStream) {
    stopScreenShare();
    return;
  }

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
        displaySurface: "monitor",
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    localScreenStream.getVideoTracks().forEach((track) => {
      track.contentHint = "detail";
    });
    localScreenStream.getAudioTracks().forEach((track) => {
      track.contentHint = "music";
    });
    screenShareStreams.set(selfId, localScreenStream);
    setActiveShare(selfId);
    shareBtn.textContent = "Stop sharing";
    shareBtn.classList.add("danger");
    logActivity("Screen sharing started.");
    logActivity("Keep the shared source visible. Browsers may pause hidden or minimized captured windows.");
    if (isHost) {
      logActivity("The shared image is a browser capture. Clicking it cannot control the external window without a native helper app.");
    }
    socket.emit("screen-share-state", { sharing: true });

    localScreenStream.getTracks().forEach((track) => {
      track.addEventListener("ended", stopScreenShare, { once: true });
      peerConnections.forEach((pc) => addTrackWithQuality(pc, track, localScreenStream, "screen"));
    });

    await renegotiateAllPeers();
    renderShareStrip();
  } catch (error) {
    logActivity("Screen sharing was cancelled.");
  }
});

requestControlBtn.addEventListener("click", () => {
  if (!sessionStarted) {
    logActivity("Control requests open when the session starts.");
    return;
  }

  if (isHost) {
    logActivity("You already control shared screens.");
    return;
  }

  socket.emit("request-control");
  logActivity("Control request sent to the host.");
});

screenVideo.addEventListener("pointermove", (event) => {
  if (!canSendPointer()) {
    return;
  }

  socket.emit("control-event", { type: "pointermove", shareId: activeShareId, point: relativePoint(event) });
});

screenVideo.addEventListener("click", (event) => {
  if (!canSendPointer()) {
    return;
  }

  socket.emit("control-event", {
    type: "click",
    shareId: activeShareId,
    point: relativePoint(event),
    button: event.button
  });
  logActivity("Pointer click sent.");
});

document.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  handlePushToTalkKey(event, true);
  handleControlKey(event);
});

document.addEventListener("keyup", (event) => {
  if (isEditableTarget(event.target)) {
    return;
  }

  handlePushToTalkKey(event, false);
});

socket.on("peer-joined", (peer) => {
  upsertParticipant(peer);
  renderParticipants();
  createPeerConnection(peer.id, false);
  logActivity(`${peer.name} joined.`);
});

socket.on("peer-left", ({ id }) => {
  participants.delete(id);
  removePeer(id);
  renderParticipants();
  logActivity("A participant left.");
});

socket.on("signal", async ({ from, description, candidate }) => {
  const pc = createPeerConnection(from, false);

  if (description) {
    await pc.setRemoteDescription(description);
    await flushPendingCandidates(from);

    if (description.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, description: pc.localDescription });
    }
  }

  if (candidate) {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate);
    } else {
      const queue = pendingCandidates.get(from) || [];
      queue.push(candidate);
      pendingCandidates.set(from, queue);
    }
  }
});

socket.on("room-state", ({ hostId: nextHostId, participants: nextParticipants, screenSharers = [], sessionStartAt: nextStartAt }) => {
  hostId = nextHostId;
  isHost = selfId === hostId;
  sessionStartAt = nextStartAt || sessionStartAt;
  knownScreenSharers.clear();
  screenSharers.forEach((sharerId) => knownScreenSharers.add(sharerId));

  participants.clear();
  nextParticipants.forEach(upsertParticipant);

  const self = nextParticipants.find((participant) => participant.id === selfId);
  setLocalControl(isHost ? { pointer: true, space: true, arrows: true } : self?.control);

  Array.from(screenShareStreams.keys()).forEach((sharerId) => {
    if (sharerId !== selfId && !screenSharers.includes(sharerId)) {
      removeScreenShare(sharerId);
    }
  });

  renderRole();
  updateSessionStartState();
  renderParticipants();
  renderShareStrip();
});

socket.on("screen-share-state", ({ sharing, sharerId }) => {
  if (sharing) {
    knownScreenSharers.add(sharerId);
    logActivity(`${participantName(sharerId)} started screen sharing.`);
  } else {
    knownScreenSharers.delete(sharerId);
    removeScreenShare(sharerId);
    logActivity(`${participantName(sharerId)} stopped screen sharing.`);
  }
});

socket.on("control-request", ({ requesterId, requesterName }) => {
  if (!isHost) {
    return;
  }

  const row = document.createElement("div");
  row.className = "request-row";
  row.dataset.requesterId = requesterId;
  row.innerHTML = `
    <div>
      <div class="participant-name"></div>
      <div class="participant-meta">Wants limited control permissions</div>
    </div>
    <button type="button">Review</button>
  `;
  row.querySelector(".participant-name").textContent = requesterName;
  row.querySelector("button").addEventListener("click", () => {
    const participant = participants.get(requesterId);
    socket.emit("set-control-permission", {
      participantId: requesterId,
      control: {
        pointer: true,
        space: true,
        arrows: true
      }
    });
    row.remove();
    logActivity(`Control permissions granted to ${participant?.name || requesterName}.`);
  });
  controlRequests.prepend(row);
  logActivity(`${requesterName} requested control.`);
});

socket.on("control-permission", ({ control }) => {
  setLocalControl(control);
  renderRole();
  logActivity(describeControl(control) || "The host revoked control.");
});

socket.on("control-event", (event) => {
  if (!isHost) {
    return;
  }

  if (event.type === "pointermove" || event.type === "click") {
    showRemoteCursor(event.point);
  }

  if (event.type === "click") {
    logActivity(`${event.fromName} clicked ${participantName(event.shareId)}'s shared screen.`);
  }

  if (event.type === "key") {
    const keyName = event.key === " " ? "Space" : event.key;
    logActivity(`${event.fromName} sent ${keyName} to the presentation layer.`);
  }
});

socket.on("host-changed", ({ hostId: nextHostId }) => {
  hostId = nextHostId;
  isHost = selfId === hostId;
  setLocalControl(isHost ? { pointer: true, space: true, arrows: true } : {});
  renderRole();
  renderParticipants();
  logActivity(isHost ? "You are now the host." : "The host changed.");
});

function showHomeMode(mode) {
  const roomCode = generateRoomCode();
  hostRoomInput.value = hostRoomInput.value || roomCode;
  homeMessage.textContent = "";
  welcome.dataset.mode = mode;
  homeActions.classList.toggle("hidden", mode !== "home");
  hostForm.classList.toggle("hidden", mode !== "host");
  joinForm.classList.toggle("hidden", mode !== "join");

  if (mode === "host") {
    history.replaceState(null, "", "#host");
    hostNameInput.focus();
  } else if (mode === "join") {
    history.replaceState(null, "", "#join");
    nameInput.focus();
  } else {
    history.replaceState(null, "", location.pathname);
  }
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const parts = [];

  for (let group = 0; group < 3; group += 1) {
    let value = "";
    for (let index = 0; index < 3; index += 1) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    parts.push(value);
  }

  return parts.join("-");
}

function updateSessionStartState() {
  clearInterval(sessionTimer);

  const refresh = () => {
    const remaining = Math.max(0, Number(sessionStartAt || 0) - Date.now());
    sessionStarted = remaining === 0;

    if (sessionStarted) {
      startStatus.textContent = "Session live";
      document.querySelector(".screen-stage")?.classList.remove("waiting");
      clearInterval(sessionTimer);
      renderRole();
      return;
    }

    startStatus.textContent = `Starts in ${formatDuration(remaining)}`;
    document.querySelector(".screen-stage")?.classList.add("waiting");
    shareBtn.disabled = true;
    requestControlBtn.disabled = true;
  };

  refresh();
  if (!sessionStarted) {
    sessionTimer = setInterval(refresh, 1000);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function startLocalMedia() {
  if (localCameraStream) {
    return;
  }

  try {
    localCameraStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    localCameraStream.getAudioTracks().forEach((track) => {
      track.contentHint = "speech";
    });
    applyAudioMode();
  } catch (error) {
    localCameraStream = new MediaStream();
    logActivity("Camera or microphone permission was not granted.");
  }
}

async function startCamera() {
  try {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });

    const [videoTrack] = cameraStream.getVideoTracks();
    if (!videoTrack) {
      return;
    }

    videoTrack.contentHint = "motion";
    localCameraStream.addTrack(videoTrack);
    peerConnections.forEach((pc) => addTrackWithQuality(pc, videoTrack, localCameraStream, "camera"));
    cameraEnabled = true;
    cameraBtn.textContent = "Camera on";
    cameraBtn.classList.remove("secondary");
    renegotiateAllPeers();
  } catch (error) {
    logActivity("Camera permission was not granted.");
  }
}

function stopCamera() {
  localCameraStream.getVideoTracks().forEach((track) => {
    track.stop();
    localCameraStream.removeTrack(track);
    peerConnections.forEach((pc) => {
      pc.getSenders()
        .filter((sender) => sender.track === track)
        .forEach((sender) => pc.removeTrack(sender));
    });
  });

  cameraEnabled = false;
  cameraBtn.textContent = "Camera off";
  cameraBtn.classList.add("secondary");
  renegotiateAllPeers();
}

function createPeerConnection(peerId, shouldOffer) {
  if (peerConnections.has(peerId)) {
    return peerConnections.get(peerId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections.set(peerId, pc);

  localCameraStream?.getTracks().forEach((track) => addTrackWithQuality(pc, track, localCameraStream, "camera"));
  localScreenStream?.getTracks().forEach((track) => addTrackWithQuality(pc, track, localScreenStream, "screen"));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: peerId, candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (!stream) {
      return;
    }

    if (isScreenTrack(peerId, stream, event.track)) {
      screenShareStreams.set(peerId, stream);
      if (!activeShareId || peerId === hostId) {
        setActiveShare(peerId);
      }
      renderShareStrip();
      return;
    }

    remoteStreams.set(peerId, stream);
    addVideoTile(peerId, participantName(peerId), stream, false);
    startVoiceMeter(peerId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
      removePeer(peerId);
    }
  };

  pc.onnegotiationneeded = async () => {
    if (shouldOffer) {
      await sendOffer(peerId, pc);
    }
  };

  if (shouldOffer) {
    queueMicrotask(() => sendOffer(peerId, pc));
  }

  return pc;
}

function addTrackWithQuality(pc, track, stream, kind) {
  const sender = pc.addTrack(track, stream);

  if (track.kind === "video") {
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = kind === "screen" ? 3_500_000 : 1_800_000;
    parameters.encodings[0].maxFramerate = kind === "screen" ? 30 : 30;
    sender.setParameters(parameters).catch(() => {});
  }

  if (track.kind === "audio") {
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = kind === "screen" ? 192_000 : 64_000;
    sender.setParameters(parameters).catch(() => {});
  }

  return sender;
}

function isScreenTrack(peerId, stream, track) {
  if (track.kind !== "video") {
    return false;
  }

  const labels = stream.getVideoTracks().map((videoTrack) => videoTrack.label.toLowerCase()).join(" ");
  const labelLooksLikeScreen = /screen|window|display|monitor/.test(labels);
  const participantAlreadyHasCamera = remoteStreams.has(peerId);
  const senderIsKnownSharer = screenShareStreams.has(peerId) || (knownScreenSharers.has(peerId) && participantAlreadyHasCamera);

  return labelLooksLikeScreen || senderIsKnownSharer || participantAlreadyHasCamera;
}

async function sendOffer(peerId, pc) {
  if (pc.signalingState !== "stable") {
    return;
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: peerId, description: pc.localDescription });
}

async function renegotiateAllPeers() {
  await Promise.all(Array.from(peerConnections.entries()).map(([peerId, pc]) => sendOffer(peerId, pc)));
}

async function flushPendingCandidates(peerId) {
  const pc = peerConnections.get(peerId);
  const queue = pendingCandidates.get(peerId) || [];
  pendingCandidates.delete(peerId);

  for (const candidate of queue) {
    await pc.addIceCandidate(candidate);
  }
}

function stopScreenShare() {
  if (!localScreenStream) {
    return;
  }

  const stoppedStream = localScreenStream;
  localScreenStream = null;
  screenShareStreams.delete(selfId);

  stoppedStream.getTracks().forEach((track) => {
    track.stop();
    peerConnections.forEach((pc) => {
      pc.getSenders()
        .filter((sender) => sender.track === track)
        .forEach((sender) => pc.removeTrack(sender));
    });
  });

  if (activeShareId === selfId) {
    activeShareId = null;
    showNextAvailableShare();
  }

  shareBtn.textContent = "Share screen";
  shareBtn.classList.remove("danger");
  logActivity("Screen sharing stopped.");
  socket.emit("screen-share-state", { sharing: false });
  renderShareStrip();
  renegotiateAllPeers();
}

function setActiveShare(sharerId) {
  const stream = screenShareStreams.get(sharerId);
  if (!stream) {
    return;
  }

  activeShareId = sharerId;
  screenVideo.srcObject = stream;
  screenVideo.tabIndex = 0;
  screenPlaceholder.classList.add("hidden");
  renderShareStrip();
}

function removeScreenShare(sharerId) {
  screenShareStreams.delete(sharerId);
  knownScreenSharers.delete(sharerId);
  document.querySelector(`[data-share-id="${sharerId}"]`)?.remove();

  if (activeShareId === sharerId) {
    activeShareId = null;
    screenVideo.srcObject = null;
    remoteCursor.classList.add("hidden");
    showNextAvailableShare();
  }

  renderShareStrip();
}

function showNextAvailableShare() {
  const nextShareId = screenShareStreams.keys().next().value;
  if (nextShareId) {
    setActiveShare(nextShareId);
  } else {
    screenPlaceholder.classList.remove("hidden");
  }
}

function renderShareStrip() {
  shareStrip.innerHTML = "";
  const secondaryShares = Array.from(screenShareStreams.entries()).filter(([sharerId]) => sharerId !== activeShareId);
  shareStrip.classList.toggle("hidden", secondaryShares.length === 0);

  secondaryShares.forEach(([sharerId, stream]) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "share-card";
    card.dataset.shareId = sharerId;
    card.innerHTML = `
      <video autoplay playsinline muted></video>
      <div class="share-name"></div>
    `;
    card.querySelector("video").srcObject = stream;
    card.querySelector(".share-name").textContent = `${participantName(sharerId)}'s screen`;
    card.addEventListener("click", () => setActiveShare(sharerId));
    shareStrip.append(card);
  });
}

function addVideoTile(id, name, stream, muted) {
  let tile = document.querySelector(`[data-video-id="${id}"]`);

  if (!tile) {
    tile = document.createElement("div");
    tile.className = "participant-card";
    tile.dataset.videoId = id;
    tile.innerHTML = `
      <div class="participant-avatar"></div>
      <div class="participant-info">
        <div class="participant-name-line"></div>
        <div class="participant-role-line"></div>
      </div>
      <audio autoplay playsinline></audio>
    `;
    videoGrid.append(tile);
  }

  const audio = tile.querySelector("audio");
  audio.srcObject = stream;
  audio.muted = muted;
  renderVideoLabel(id, name);
}

function renderVideoLabel(id, name) {
  const tile = document.querySelector(`[data-video-id="${id}"]`);
  if (!tile) {
    return;
  }

  const avatar = tile.querySelector(".participant-avatar");
  const nameLine = tile.querySelector(".participant-name-line");
  const roleLine = tile.querySelector(".participant-role-line");
  avatar.textContent = initialsFor(name);
  avatar.querySelector(".host-badge")?.remove();
  nameLine.textContent = name;
  tile.classList.toggle("host-tile", id === hostId);

  if (id === hostId) {
    const badge = document.createElement("span");
    badge.className = "host-badge";
    badge.textContent = "H";
    avatar.append(badge);
  }

  const participant = participants.get(id);
  roleLine.textContent = id === hostId
    ? "Host"
    : describeControl(participant?.control) || "Participant";
}

function removePeer(peerId) {
  peerConnections.get(peerId)?.close();
  peerConnections.delete(peerId);
  remoteStreams.delete(peerId);
  removeScreenShare(peerId);
  stopVoiceMeter(peerId);
  document.querySelector(`[data-video-id="${peerId}"]`)?.remove();
}

function upsertParticipant(participant) {
  participants.set(participant.id, {
    ...participants.get(participant.id),
    ...participant,
    control: normalizeControl(participant.control)
  });
}

function renderRole() {
  rolePill.textContent = isHost ? "Host" : describeControl(localControl) || "Participant";
  hostPanel.classList.toggle("hidden", !isHost);
  shareBtn.disabled = !sessionStarted;
  requestControlBtn.disabled = !sessionStarted || isHost || hasAnyControl(localControl);
  requestControlBtn.textContent = hasAnyControl(localControl) && !isHost ? "Control granted" : "Request control";
}

function renderParticipants() {
  participantList.innerHTML = "";
  participants.forEach((participant) => {
    renderVideoLabel(participant.id, participant.id === selfId ? displayName : participant.name);
  });

  Array.from(participants.values()).forEach((participant) => {
    if (participant.id === selfId) {
      return;
    }

    const control = normalizeControl(participant.control);
    const row = document.createElement("div");
    row.className = "participant-row";
    row.innerHTML = `
      <div>
        <div class="participant-name"></div>
        <div class="participant-meta"></div>
      </div>
      <div class="permission-grid">
        <label><input type="checkbox" data-permission="pointer" /> Pointer</label>
        <label><input type="checkbox" data-permission="space" /> Space</label>
        <label><input type="checkbox" data-permission="arrows" /> Arrows</label>
      </div>
    `;
    row.querySelector(".participant-name").textContent = participant.name;
    row.querySelector(".participant-meta").textContent = participant.isHost ? "Host badge shown in yellow" : describeControl(control) || "View only";

    row.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = control[input.dataset.permission];
      input.disabled = participant.isHost;
      input.addEventListener("change", () => {
        const nextControl = { ...control };
        row.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
          nextControl[checkbox.dataset.permission] = checkbox.checked;
        });
        socket.emit("set-control-permission", {
          participantId: participant.id,
          control: nextControl
        });
      });
    });

    participantList.append(row);
  });
}

function normalizeControl(control) {
  return {
    pointer: Boolean(control?.pointer),
    space: Boolean(control?.space),
    arrows: Boolean(control?.arrows)
  };
}

function setLocalControl(control) {
  const normalized = normalizeControl(control);
  localControl.pointer = normalized.pointer;
  localControl.space = normalized.space;
  localControl.arrows = normalized.arrows;
}

function hasAnyControl(control) {
  return Boolean(control?.pointer || control?.space || control?.arrows);
}

function describeControl(control) {
  const parts = [];
  if (control?.pointer) {
    parts.push("Pointer");
  }
  if (control?.space) {
    parts.push("Space");
  }
  if (control?.arrows) {
    parts.push("Arrows");
  }

  return parts.length ? `${parts.join(", ")} control` : "";
}

function relativePoint(event) {
  const rect = screenVideo.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  };
}

function showRemoteCursor(point) {
  const rect = screenVideo.getBoundingClientRect();
  const stageRect = screenVideo.parentElement.getBoundingClientRect();
  remoteCursor.classList.remove("hidden");
  remoteCursor.style.left = `${rect.left + point.x * rect.width - stageRect.left}px`;
  remoteCursor.style.top = `${rect.top + point.y * rect.height - stageRect.top}px`;
}

function canSendPointer() {
  return sessionStarted && !isHost && localControl.pointer && activeShareId && screenVideo.srcObject;
}

function handleControlKey(event) {
  if (!sessionStarted || isHost || !activeShareId || event.repeat) {
    return;
  }

  const isSpace = event.key === " " && localControl.space;
  const isArrow = /^Arrow(Up|Down|Left|Right)$/.test(event.key) && localControl.arrows;

  if (!isSpace && !isArrow) {
    return;
  }

  event.preventDefault();
  socket.emit("control-event", {
    type: "key",
    shareId: activeShareId,
    key: event.key
  });

  logActivity(`${event.key === " " ? "Space" : event.key} sent.`);
}

function applyAudioMode() {
  const shouldEnableAudio = micEnabled && (audioMode === "direct" || isPushKeyDown);
  localCameraStream?.getAudioTracks().forEach((track) => {
    track.enabled = shouldEnableAudio;
  });

  pushStatus.textContent = audioMode === "direct"
    ? "Mic opens automatically."
    : `Hold ${pushKey} to speak.`;
}

function handlePushToTalkKey(event, pressed) {
  if (audioMode !== "push" || event.key.toUpperCase() !== pushKey) {
    return;
  }

  if (pressed && event.repeat) {
    return;
  }

  event.preventDefault();
  isPushKeyDown = pressed;
  applyAudioMode();
  pushStatus.textContent = pressed ? "Speaking now." : `Hold ${pushKey} to speak.`;
}

function startVoiceMeter(id, stream) {
  stopVoiceMeter(id);

  const audioTracks = stream?.getAudioTracks() || [];
  if (!audioTracks.length) {
    return;
  }

  audioContext ||= new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;

  const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
  source.connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);
  let animationFrame = null;

  const tick = () => {
    analyser.getByteTimeDomainData(samples);

    let sum = 0;
    for (const value of samples) {
      const centered = value - 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    setSpeaking(id, rms > 12);
    animationFrame = requestAnimationFrame(tick);
  };

  tick();
  voiceMeters.set(id, {
    stop: () => {
      cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      setSpeaking(id, false);
    }
  });
}

function stopVoiceMeter(id) {
  voiceMeters.get(id)?.stop();
  voiceMeters.delete(id);
}

function setSpeaking(id, speaking) {
  document.querySelector(`[data-video-id="${id}"]`)?.classList.toggle("speaking", speaking);
}

function participantName(id) {
  if (id === selfId) {
    return displayName || "You";
  }

  return participants.get(id)?.name || "Guest";
}

function initialsFor(name) {
  return String(name || "G")
    .replace(/\(you\)/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "G";
}

function isEditableTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
}

function logActivity(message) {
  const row = document.createElement("div");
  row.className = "log-row";
  row.textContent = message;
  activityLog.prepend(row);

  while (activityLog.children.length > 30) {
    activityLog.lastElementChild.remove();
  }
}
