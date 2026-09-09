/**
 * dashboard.js — Multi-camera grid, zone map, and history table
 */
const Dashboard = (() => {
  // Farm zone grid: 4x4 = 16 zones A1-D4
  const ZONES = [];
  const COLS = ["A","B","C","D"];
  for (let r = 1; r <= 4; r++) for (const c of COLS) ZONES.push(`${c}${r}`);
  let _zoneHealth = {}; // zone -> { severity, disease }
  ZONES.forEach(z => { _zoneHealth[z] = { severity: 0, disease: "Unknown" }; });

  function initZoneGrid() {
    const grid = document.getElementById("zoneGrid");
    if (!grid) return;
    grid.innerHTML = ZONES.map(z => `
      <div class="zone-cell zone-unknown" id="zone-${z}" title="Zone ${z}">
        <span>${z}</span>
      </div>
    `).join("");
  }

  function updateZone(zone, severity, disease) {
    _zoneHealth[zone] = { severity, disease };
    const el = document.getElementById(`zone-${zone}`);
    if (!el) return;
    el.className = "zone-cell " + (
      severity === 0 ? "zone-healthy" :
      severity <= 2  ? "zone-warning" :
      severity <= 3  ? "zone-danger" :
                       "zone-critical"
    );
    el.title = `Zone ${zone}: ${disease || "No disease"} (Sev ${severity})`;
  }

  function refreshCameraGrid() {
    const grid = document.getElementById("cameraGrid");
    if (!grid) return;
    const cameras = Camera.getAll();
    const noCamMsg = document.getElementById("noCameraMsg");

    if (cameras.length === 0) {
      if (noCamMsg) noCamMsg.style.display = "flex";
      return;
    }
    if (noCamMsg) noCamMsg.style.display = "none";

    // Only add cells for cameras not already in grid
    cameras.forEach(cam => {
      let cell = document.getElementById(`cam-cell-${cam.id}`);
      if (!cell) {
        cell = createCameraCell(cam);
        grid.appendChild(cell);
      }
    });

    // Remove cells for deleted cameras
    grid.querySelectorAll(".camera-cell").forEach(cell => {
      const id = parseInt(cell.id.replace("cam-cell-", ""));
      if (!cameras.find(c => c.id === id)) cell.remove();
    });
  }

  function createCameraCell(cam) {
    const cell = document.createElement("div");
    cell.className = "camera-cell";
    cell.id = `cam-cell-${cam.id}`;

    if (cam.type === "usb") {
      const video = document.createElement("video");
      video.autoplay = true; video.muted = true; video.playsInline = true;
      video.setAttribute("data-cam-id", cam.id);
      cell.appendChild(video);
      setTimeout(() => Camera.attachVideoStream(cam.id, video), 300);

    } else if (cam.type === "mjpeg") {
      const img = document.createElement("img");
      const url = Camera.getMjpegUrl(cam.id);
      img.src = url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
      img.setAttribute("data-cam-id", cam.id);
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      cell.appendChild(img);

    } else if (cam.type === "rtsp") {
      const cvs = document.createElement("canvas");
      cvs.width = 640; cvs.height = 360;
      cvs.setAttribute("data-cam-id", cam.id);
      cvs.style.cssText = "width:100%;height:100%;";
      cell.appendChild(cvs);

    } else {
      const ph = document.createElement("div");
      ph.style.cssText = "display:flex;align-items:center;justify-content:center;color:#8b949e;font-size:13px;";
      ph.textContent = "📁 Upload mode";
      cell.appendChild(ph);
    }

    // Label
    const label = document.createElement("div");
    label.className = "cam-label";
    label.textContent = cam.name || `Camera ${cam.id}`;
    cell.appendChild(label);

    // Status dot
    const dot = document.createElement("div");
    dot.className = "cam-status";
    dot.id = `cam-dot-${cam.id}`;
    cell.appendChild(dot);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "cam-remove";
    removeBtn.textContent = "✕";
    removeBtn.onclick = (e) => { e.stopPropagation(); if (confirm(`Remove "${cam.name}"?`)) { Camera.remove(cam.id); refreshCameraGrid(); } };
    cell.appendChild(removeBtn);

    return cell;
  }

  function updateCameraList() {
    const list = document.getElementById("cameraList");
    if (!list) return;
    const cameras = Camera.getAll();
    if (cameras.length === 0) {
      list.innerHTML = `<div style="padding:20px;text-align:center;color:#8b949e;">No cameras added yet.</div>`;
      return;
    }
    const TYPE_ICON = { usb: "🖥️", mjpeg: "🌐", rtsp: "📡", upload: "📁" };
    const TYPE_LABEL = { usb: "USB/Webcam", mjpeg: "IP Camera (MJPEG)", rtsp: "CCTV (RTSP)", upload: "Manual Upload" };
    list.innerHTML = cameras.map(cam => `
      <div class="camera-list-item">
        <div class="cam-list-icon">${TYPE_ICON[cam.type] || "📷"}</div>
        <div class="cam-list-info">
          <div class="cam-list-name">${cam.name || "Camera " + cam.id}</div>
          <div class="cam-list-type">${TYPE_LABEL[cam.type] || cam.type} ${cam.url ? "• " + cam.url : ""} ${cam.zone ? "• Zone " + cam.zone : ""}</div>
        </div>
        <div class="cam-list-actions">
          <button class="btn btn-secondary btn-sm" onclick="Dashboard.focusCamera(${cam.id})">🔬 Analyze</button>
          <button class="btn btn-danger btn-sm" onclick="if(confirm('Remove?')){Camera.remove(${cam.id});Dashboard.refresh();}">🗑</button>
        </div>
      </div>
    `).join("");
  }

  function renderHistoryTable() {
    const container = document.getElementById("historyTable");
    if (!container) return;
    const history = Charts.getHistory();
    if (history.length === 0) {
      container.innerHTML = `<div class="history-empty">No scans yet. Start monitoring to collect data.</div>`;
      return;
    }
    container.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Time</th><th>Disease</th><th>Crop</th>
            <th>Severity</th><th>Urgency</th><th>Spoilage</th><th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          ${history.slice(0, 100).map(e => `
            <tr>
              <td>${new Date(e.timestamp).toLocaleString()}</td>
              <td>${e.disease}</td>
              <td>${e.cropType}</td>
              <td>${e.severity}/5</td>
              <td><span class="urgency-tag urgency-${e.urgency}">${(e.urgency||"").toUpperCase()}</span></td>
              <td>${e.spoilage}</td>
              <td>${Math.round((e.confidence||0)*100)}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function updateStats(result) {
    const history = Charts.getHistory();
    document.getElementById("statTotalScans").textContent = history.length;
    const diseases = history.filter(e => e.severity > 0).length;
    document.getElementById("statDiseasesFound").textContent = diseases;
    const healthy = history.filter(e => e.severity === 0).length;
    const pct = history.length > 0 ? Math.round((healthy / history.length) * 100) : 0;
    document.getElementById("statHealthyPct").textContent = pct + "%";
    const critical = history.filter(e => e.severity >= 4).length;
    document.getElementById("statCritical").textContent = critical;
  }

  function focusCamera(id) {
    // Switch to analysis page and select this camera
    const select = document.getElementById("analysisCameraSelect");
    if (select) { select.value = id; select.dispatchEvent(new Event("change")); }
    document.querySelector('[data-page="analysis"]')?.click();
  }

  function populateAnalysisCameraSelect() {
    const select = document.getElementById("analysisCameraSelect");
    if (!select) return;
    const cameras = Camera.getAll();
    select.innerHTML = `<option value="">-- Select Camera --</option>` +
      cameras.map(c => `<option value="${c.id}">${c.name || "Camera " + c.id}</option>`).join("");
  }

  function populateZoneSelect() {
    const sel = document.getElementById("camZone");
    if (!sel) return;
    sel.innerHTML = `<option value="">None</option>` + ZONES.map(z => `<option value="${z}">Zone ${z}</option>`).join("");
  }

  function refresh() {
    refreshCameraGrid();
    updateCameraList();
    populateAnalysisCameraSelect();
    renderHistoryTable();
  }

  return { initZoneGrid, updateZone, refreshCameraGrid, updateCameraList, renderHistoryTable, updateStats, focusCamera, populateAnalysisCameraSelect, populateZoneSelect, refresh };
})();
