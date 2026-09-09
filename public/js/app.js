/**
 * app.js — Main application controller
 * Wires together Camera, AI, Heatmap, Dashboard, Alerts, Charts
 */
(() => {
  let _activeAnalysisCamId = null;
  let _monitoringActive = false;

  // ── Page navigation ─────────────────────────────────────────────────────
  function initNav() {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        item.classList.add("active");
        const pageEl = document.getElementById(`page-${page}`);
        if (pageEl) pageEl.classList.add("active");
        document.getElementById("pageTitle").textContent = {
          dashboard: "Farm Dashboard",
          cameras: "Camera Management",
          analysis: "Live Analysis",
          history: "Scan History",
          settings: "Settings"
        }[page] || page;

        if (page === "history") Dashboard.renderHistoryTable();
        if (page === "cameras") Dashboard.updateCameraList();
        if (page === "analysis") Dashboard.populateAnalysisCameraSelect();
      });
    });

    document.getElementById("sidebarToggle")?.addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("collapsed");
    });
  }

  // ── Add Camera Modal ─────────────────────────────────────────────────────
  function initAddCameraModal() {
    const modal = document.getElementById("addCameraModal");
    const openModal = async () => {
      modal.classList.add("open");
      // Populate devices
      const devices = await Camera.getDevices();
      const sel = document.getElementById("camDevice");
      sel.innerHTML = devices.length
        ? devices.map((d, i) => `<option value="${d.deviceId}">${d.label || "Camera " + (i+1)}</option>`).join("")
        : `<option value="">No devices found</option>`;
      Dashboard.populateZoneSelect();
    };

    ["addCameraBtn","addCameraBtn2","addFirstCameraBtn"].forEach(id =>
      document.getElementById(id)?.addEventListener("click", openModal)
    );
    document.getElementById("closeModal")?.addEventListener("click", () => modal.classList.remove("open"));
    document.getElementById("cancelAddCamera")?.addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

    // Camera type toggle
    document.getElementById("camType")?.addEventListener("change", (e) => {
      const type = e.target.value;
      const urlGroup = document.getElementById("camUrlGroup");
      const devGroup = document.getElementById("camDeviceGroup");
      const label = document.getElementById("camUrlLabel");
      const hint = document.getElementById("camUrlHint");

      if (type === "mjpeg") {
        urlGroup.style.display = "block"; devGroup.style.display = "none";
        label.textContent = "MJPEG Stream URL";
        hint.textContent = "e.g. http://192.168.1.100/video.mjpg or http://cam_ip/mjpeg";
        document.getElementById("camUrl").placeholder = "http://192.168.1.100/video.mjpg";
      } else if (type === "rtsp") {
        urlGroup.style.display = "block"; devGroup.style.display = "none";
        label.textContent = "RTSP Stream URL";
        hint.textContent = "e.g. rtsp://admin:password@192.168.1.100:554/stream";
        document.getElementById("camUrl").placeholder = "rtsp://admin:password@192.168.1.100:554/stream";
      } else if (type === "usb") {
        urlGroup.style.display = "none"; devGroup.style.display = "block";
      } else {
        urlGroup.style.display = "none"; devGroup.style.display = "none";
      }
    });

    document.getElementById("refreshDevices")?.addEventListener("click", async () => {
      const devices = await Camera.getDevices();
      const sel = document.getElementById("camDevice");
      sel.innerHTML = devices.map((d, i) => `<option value="${d.deviceId}">${d.label || "Camera "+(i+1)}</option>`).join("");
    });

    // Confirm add camera
    document.getElementById("confirmAddCamera")?.addEventListener("click", async () => {
      const type = document.getElementById("camType").value;
      const name = document.getElementById("camName").value || `Camera ${Date.now()}`;
      const url  = document.getElementById("camUrl").value.trim();
      const deviceId = document.getElementById("camDevice").value;
      const zone = document.getElementById("camZone").value;

      if ((type === "mjpeg" || type === "rtsp") && !url) {
        alert("Please enter the stream URL."); return;
      }

      try {
        const cam = await Camera.add({ type, name, url, deviceId, zone });
        modal.classList.remove("open");
        Dashboard.refresh();
        showToast(`✅ Camera "${cam.name}" added!`, "success");

        // Auto-switch to analysis if first camera
        if (Camera.getAll().length === 1) {
          document.querySelector('[data-page="analysis"]')?.click();
          setTimeout(() => {
            const sel = document.getElementById("analysisCameraSelect");
            if (sel) { sel.value = cam.id; sel.dispatchEvent(new Event("change")); }
          }, 300);
        }
      } catch (err) {
        alert("Failed to add camera: " + err.message);
      }
    });
  }

  // ── Analysis page ─────────────────────────────────────────────────────────
  function initAnalysisPage() {
    const camSelect = document.getElementById("analysisCameraSelect");
    const video = document.getElementById("analysisVideo");
    const placeholder = document.getElementById("analysisFeedPlaceholder");

    camSelect?.addEventListener("change", async (e) => {
      const id = parseInt(e.target.value);
      _activeAnalysisCamId = id || null;
      if (!id) { placeholder.style.display = "flex"; return; }
      placeholder.style.display = "none";

      const cam = Camera.getById(id);
      if (!cam) return;

      if (cam.type === "usb") {
        video.style.display = "block";
        Camera.attachVideoStream(id, video);
      } else if (cam.type === "mjpeg") {
        video.style.display = "none";
        let img = document.getElementById("analysisImgFeed");
        if (!img) {
          img = document.createElement("img");
          img.id = "analysisImgFeed";
          img.setAttribute("data-cam-id", id);
          img.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;";
          document.getElementById("analysisFeedWrapper").appendChild(img);
        }
        const url = Camera.getMjpegUrl(id);
        img.src = url + (url.includes("?") ? "&_t=" : "?_t=") + Date.now();
      } else if (cam.type === "rtsp") {
        video.style.display = "none";
        let cvs = document.getElementById("analysisRtspCanvas");
        if (!cvs) {
          cvs = document.createElement("canvas");
          cvs.id = "analysisRtspCanvas";
          cvs.setAttribute("data-cam-id", id);
          cvs.width = 640; cvs.height = 360;
          cvs.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;";
          document.getElementById("analysisFeedWrapper").appendChild(cvs);
        }
      }

      Heatmap.init("heatmapCanvas");
      Heatmap.resize();
    });

    // Heatmap toggle
    document.getElementById("heatmapToggle")?.addEventListener("change", (e) => {
      Heatmap.setEnabled(e.target.checked);
    });

    // Manual scan button
    document.getElementById("manualScanBtn")?.addEventListener("click", () => {
      if (!_activeAnalysisCamId) { showToast("Select a camera first", "error"); return; }
      doSingleScan(_activeAnalysisCamId);
    });

    // RTSP frame relay
    if (typeof io !== "undefined") {
      const socket = io();
      socket.on("rtsp-frame", ({ cameraId, frame }) => {
        Camera.drawRtspFrame(cameraId, frame);
      });
    }
  }

  // ── Monitoring controls ───────────────────────────────────────────────────
  function initMonitoringControls() {
    const startBtn = document.getElementById("startScanBtn");
    const stopBtn = document.getElementById("emergencyStop");
    const timerEl = document.getElementById("nextScanTimer");
    const statusEl = document.getElementById("scanStatus");
    const aiDot = document.getElementById("aiStatusDot");
    const aiText = document.getElementById("aiStatusText");

    startBtn?.addEventListener("click", () => {
      if (_monitoringActive) return;
      if (!AI.getApiKey()) { showToast("Add your Grok API key in Settings first", "error"); return; }
      _monitoringActive = true;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-flex";
      aiDot.classList.add("active"); aiText.textContent = "Scanning...";

      // Show scanning animation on analysis feed
      let scanAnim = document.querySelector(".scanning-overlay");
      if (!scanAnim) {
        scanAnim = document.createElement("div");
        scanAnim.className = "scanning-overlay";
        const line = document.createElement("div"); line.className = "scan-line";
        scanAnim.appendChild(line);
        document.getElementById("analysisFeedWrapper")?.appendChild(scanAnim);
      }
      scanAnim.style.display = "block";

      AI.startScanning(
        () => {
          const camId = _activeAnalysisCamId || Camera.getAll()[0]?.id;
          return camId ? Camera.captureBase64(camId) : null;
        },
        (result, timestamp) => onAnalysisResult(result, timestamp, statusEl),
        (err) => { statusEl.textContent = "Error: " + err; showToast(err, "error"); },
        (countdown) => { if (timerEl) timerEl.textContent = countdown; }
      );
    });

    stopBtn?.addEventListener("click", () => {
      AI.stopScanning();
      _monitoringActive = false;
      startBtn.style.display = "inline-flex";
      stopBtn.style.display = "none";
      aiDot.classList.remove("active"); aiText.textContent = "AI Ready";
      document.querySelector(".scanning-overlay")?.remove();
      if (timerEl) timerEl.textContent = "--";
      if (statusEl) statusEl.textContent = "Stopped";
    });
  }

  async function doSingleScan(camId) {
    const statusEl = document.getElementById("scanStatus");
    if (statusEl) statusEl.textContent = "🔍 Analyzing...";
    try {
      const base64 = Camera.captureBase64(camId);
      if (!base64) { showToast("Could not capture frame", "error"); return; }
      const result = await AI.analyze(base64);
      onAnalysisResult(result, new Date(), statusEl);
    } catch (err) {
      showToast(err.message, "error");
      if (statusEl) statusEl.textContent = "Error";
    }
  }

  function onAnalysisResult(result, timestamp, statusEl) {
    if (!result) return;

    // Update result display
    document.getElementById("resultContent").innerHTML = AI.renderResult(result);

    // Update heatmap
    const zones = result.heatmap_zones || Heatmap.zonesFromRegion(result.affected_region, result.severity);
    Heatmap.animateTo(zones);

    // Add to charts/history
    const entry = Charts.addPoint(result, timestamp);

    // Update stats
    Dashboard.updateStats(result);

    // Fire alert if above threshold
    const thresh = AI.getThreshold();
    if ((result.severity || 0) >= thresh && result.disease_name && result.disease_name !== "None detected") {
      const camId = _activeAnalysisCamId || Camera.getAll()[0]?.id;
      const cam = camId ? Camera.getById(camId) : null;
      Alerts.add({
        disease: result.disease_name,
        severity: result.severity,
        urgency: result.urgency,
        camera: cam?.name || "Camera",
        region: result.affected_region,
        cropType: result.crop_type,
        timestamp
      });
      // Update zone if camera has zone assignment
      if (cam?.zone) Dashboard.updateZone(cam.zone, result.severity, result.disease_name);
    }

    if (statusEl) statusEl.textContent = `✅ Done — ${new Date(timestamp).toLocaleTimeString()}`;
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  function initSettings() {
    const apiKeyInput = document.getElementById("apiKeyInput");
    if (apiKeyInput && AI.getApiKey()) { apiKeyInput.value = AI.getApiKey(); }

    document.getElementById("saveApiKey")?.addEventListener("click", () => {
      const key = apiKeyInput?.value.trim();
      if (!key) { showToast("Enter a valid API key", "error"); return; }
      AI.setApiKey(key);
      showToast("✅ API key saved!", "success");
      document.getElementById("aiStatusDot").classList.add("active");
      document.getElementById("aiStatusText").textContent = "AI Ready";
    });

    document.getElementById("saveSettings")?.addEventListener("click", () => {
      AI.setScanInterval(document.getElementById("scanInterval")?.value || 8);
      AI.setAlertThreshold(document.getElementById("alertThreshold")?.value || 3);
      showToast("✅ Settings saved!", "success");
    });

    // Range buttons for chart
    document.querySelectorAll(".range-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        Charts.refreshChart(btn.dataset.range);
      });
    });

    document.getElementById("clearAlertsBtn")?.addEventListener("click", () => Alerts.clear());
    document.getElementById("exportHistoryBtn")?.addEventListener("click", () => Charts.exportCSV());
    document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
      if (confirm("Clear all scan history?")) { Charts.clearHistory(); Dashboard.renderHistoryTable(); }
    });
  }

  // ── Toast helper ─────────────────────────────────────────────────────────
  window.showToast = function(msg, type = "success") {
    let container = document.querySelector(".toast-container");
    if (!container) { container = document.createElement("div"); container.className = "toast-container"; document.body.appendChild(container); }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity 0.5s"; setTimeout(() => toast.remove(), 500); }, 4000);
  };

  // ── Boot ─────────────────────────────────────────────────────────────────
  async function init() {
    initNav();
    initAddCameraModal();
    initAnalysisPage();
    initMonitoringControls();
    initSettings();

    Dashboard.initZoneGrid();
    Charts.init();

    // Load settings into UI
    const interval = localStorage.getItem("scan_interval");
    if (interval) document.getElementById("scanInterval").value = interval;
    const threshold = localStorage.getItem("alert_threshold");
    if (threshold) document.getElementById("alertThreshold").value = threshold;
    const apiKey = AI.getApiKey();
    if (apiKey) { document.getElementById("aiStatusDot").classList.add("active"); document.getElementById("aiStatusText").textContent = "AI Ready"; }

    // Init cameras from saved state
    await Camera.initAll();
    Dashboard.refresh();

    // RTSP frame relay for camera grid
    if (typeof io !== "undefined") {
      const socket = io();
      socket.on("rtsp-frame", ({ cameraId, frame }) => Camera.drawRtspFrame(cameraId, frame));
    }

    // Resize heatmap on window resize
    window.addEventListener("resize", () => Heatmap.resize());

    console.log("🌿 CropGuard AI initialized");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
