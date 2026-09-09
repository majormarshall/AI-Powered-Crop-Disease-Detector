/**
 * camera.js — Manages USB/webcam, MJPEG IP cameras, RTSP (via server), and upload
 */
const Camera = (() => {
  let _cameras = JSON.parse(localStorage.getItem("cameras") || "[]");
  let _streams = {}; // cameraId -> { stream, video, img, socket }
  let _socket = null;
  let _nextId = parseInt(localStorage.getItem("cam_next_id") || "1");
  const _listeners = { added: [], removed: [], frame: [] };

  function on(event, fn) { _listeners[event]?.push(fn); }
  function emit(event, ...args) { _listeners[event]?.forEach(fn => fn(...args)); }

  function save() {
    localStorage.setItem("cameras", JSON.stringify(_cameras));
    localStorage.setItem("cam_next_id", _nextId);
  }

  function getAll() { return [..._cameras]; }

  function getById(id) { return _cameras.find(c => c.id === id); }

  /** Get available media devices */
  async function getDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === "videoinput");
    } catch { return []; }
  }

  /** Add a new camera */
  async function add(config) {
    const cam = { id: _nextId++, ...config, addedAt: new Date().toISOString(), active: false };
    _cameras.push(cam);
    save();
    emit("added", cam);
    await startCamera(cam.id);
    return cam;
  }

  /** Remove a camera */
  function remove(id) {
    stopCamera(id);
    _cameras = _cameras.filter(c => c.id !== id);
    save();
    emit("removed", id);
  }

  /** Start streaming a camera by id */
  async function startCamera(id) {
    const cam = getById(id);
    if (!cam) return;
    const type = cam.type;

    if (type === "usb") {
      try {
        const constraints = { video: { deviceId: cam.deviceId ? { exact: cam.deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        _streams[id] = { stream, type: "usb" };
        cam.active = true; save();
      } catch (err) {
        console.error("USB camera error:", err);
        cam.active = false; save();
        throw err;
      }
    }

    else if (type === "mjpeg") {
      // MJPEG: browser can display via <img src="..."> directly
      _streams[id] = { type: "mjpeg", url: cam.url };
      cam.active = true; save();
    }

    else if (type === "rtsp") {
      // RTSP: relay through server WebSocket
      if (!_socket) _socket = io();
      _socket.emit("start-rtsp", { cameraId: id, rtspUrl: cam.url });
      _socket.on("rtsp-frame", ({ cameraId, frame }) => {
        if (cameraId === id) emit("frame", id, frame);
      });
      _socket.on("rtsp-error", ({ cameraId, error }) => {
        if (cameraId === id) console.warn("RTSP error:", error);
      });
      _streams[id] = { type: "rtsp" };
      cam.active = true; save();
    }

    else if (type === "upload") {
      _streams[id] = { type: "upload" };
      cam.active = true; save();
    }
  }

  /** Stop a camera */
  function stopCamera(id) {
    const s = _streams[id];
    if (!s) return;
    if (s.type === "usb" && s.stream) s.stream.getTracks().forEach(t => t.stop());
    if (s.type === "rtsp" && _socket) _socket.emit("stop-rtsp", { cameraId: id });
    delete _streams[id];
    const cam = getById(id);
    if (cam) { cam.active = false; save(); }
  }

  /** Get the stream for a camera (USB only) */
  function getStream(id) { return _streams[id]?.stream || null; }

  /** Get MJPEG URL */
  function getMjpegUrl(id) { return _streams[id]?.url || null; }

  /** Capture a frame from any camera type for AI analysis */
  function captureBase64(id) {
    const cam = getById(id);
    if (!cam) return null;
    const s = _streams[id];
    if (!s) return null;

    const canvas = document.getElementById("captureCanvas");
    if (!canvas) return null;

    if (s.type === "usb") {
      const video = document.querySelector(`video[data-cam-id="${id}"]`);
      if (!video || !video.readyState >= 2) return null;
      return AI.captureFrame(video);
    }
    if (s.type === "mjpeg") {
      const img = document.querySelector(`img[data-cam-id="${id}"]`);
      if (!img) return null;
      return AI.captureImgFrame(img);
    }
    if (s.type === "rtsp") {
      const cvs = document.querySelector(`canvas[data-cam-id="${id}"]`);
      if (!cvs) return null;
      const dataUrl = cvs.toDataURL("image/jpeg", 0.85);
      return dataUrl.split(",")[1];
    }
    return null;
  }

  /** Attach a USB stream to a video element */
  function attachVideoStream(id, videoEl) {
    const s = _streams[id];
    if (s?.type === "usb" && s.stream) {
      videoEl.srcObject = s.stream;
      videoEl.setAttribute("data-cam-id", id);
    }
  }

  /** Draw an RTSP frame (base64 JPEG) onto a canvas */
  function drawRtspFrame(id, base64Frame) {
    const cvs = document.querySelector(`canvas[data-cam-id="${id}"]`);
    if (!cvs) return;
    const img = new Image();
    img.onload = () => {
      const ctx = cvs.getContext("2d");
      ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
    };
    img.src = "data:image/jpeg;base64," + base64Frame;
  }

  /** Re-initialize cameras from localStorage on page load */
  async function initAll() {
    for (const cam of _cameras) {
      try { await startCamera(cam.id); }
      catch (e) { console.warn(`Failed to start cam ${cam.id}:`, e); }
    }
  }

  return { on, getAll, getById, getDevices, add, remove, startCamera, stopCamera, getStream, getMjpegUrl, captureBase64, attachVideoStream, drawRtspFrame, initAll };
})();
