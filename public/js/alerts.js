/**
 * alerts.js — Real-time alert system for disease detections
 */
const Alerts = (() => {
  let _alerts = [];
  const MAX_ALERTS = 50;
  const URGENCY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
  const URGENCY_ICONS = { none: "✅", low: "🟡", medium: "🟠", high: "🔴", critical: "🚨" };

  function alertClass(urgency) {
    if (urgency === "critical") return "alert-critical";
    if (urgency === "high") return "alert-high";
    if (urgency === "medium") return "alert-medium";
    return "alert-low";
  }

  function add({ disease, severity, urgency, camera, region, cropType, timestamp }) {
    const alert = {
      id: Date.now() + Math.random(),
      disease, severity, urgency: urgency || "low",
      camera: camera || "Unknown camera",
      region: region || "Unknown region",
      cropType: cropType || "Unknown",
      timestamp: timestamp || new Date()
    };
    _alerts.unshift(alert);
    if (_alerts.length > MAX_ALERTS) _alerts.pop();
    renderAlerts();
    showToast(alert);
    return alert;
  }

  function clear() {
    _alerts = [];
    renderAlerts();
  }

  function renderAlerts() {
    const list = document.getElementById("alertsList");
    if (!list) return;
    if (_alerts.length === 0) {
      list.innerHTML = `<div class="no-alerts">No alerts — all clear 🌿</div>`;
      return;
    }
    list.innerHTML = _alerts.map(a => `
      <div class="alert-item ${alertClass(a.urgency)}">
        <div class="alert-icon">${URGENCY_ICONS[a.urgency] || "⚠️"}</div>
        <div class="alert-body">
          <div class="alert-title">${a.disease}</div>
          <div class="alert-meta">
            📷 ${a.camera} • 🌱 ${a.cropType} • Sev ${a.severity}/5<br>
            🕐 ${new Date(a.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    `).join("");
  }

  function showToast(alert) {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${alert.urgency === "critical" || alert.urgency === "high" ? "error" : "warning"}`;
    toast.innerHTML = `
      <strong>${URGENCY_ICONS[alert.urgency]} ${alert.disease}</strong><br>
      <span style="font-size:11px;color:#8b949e">${alert.camera} • Severity ${alert.severity}/5 • ${new Date(alert.timestamp).toLocaleTimeString()}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity 0.5s"; setTimeout(() => toast.remove(), 500); }, 5000);
  }

  function getAll() { return [..._alerts]; }

  return { add, clear, getAll, renderAlerts };
})();
