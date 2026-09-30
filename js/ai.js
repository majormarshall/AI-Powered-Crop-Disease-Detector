/**
 * ai.js — Grok Vision AI integration for live crop disease analysis
 */
const AI = (() => {
  const API_URL = "/api/analyze"; // Routes through our Node.js server

  let _apiKey = localStorage.getItem("grok_api_key") || "";
  let _scanInterval = parseInt(localStorage.getItem("scan_interval") || "8");
  let _alertThreshold = parseInt(localStorage.getItem("alert_threshold") || "3");
  let _scanning = false;
  let _scanTimer = null;
  let _timerCountdown = null;
  let _nextScanIn = 0;

  const SEVERITY_LABELS = ["None", "Minimal", "Low", "Moderate", "High", "Critical"];
  const URGENCY_ICONS = { none: "✅", low: "🟡", medium: "🟠", high: "🔴", critical: "🚨" };

  function setApiKey(key) {
    _apiKey = key.trim();
    localStorage.setItem("grok_api_key", _apiKey);
  }

  function getApiKey() { return _apiKey; }

  function setScanInterval(s) {
    _scanInterval = parseInt(s);
    localStorage.setItem("scan_interval", _scanInterval);
  }

  function setAlertThreshold(t) {
    _alertThreshold = parseInt(t);
    localStorage.setItem("alert_threshold", _alertThreshold);
  }

  /**
   * Capture a frame from a video element and convert to base64 JPEG
   */
  function captureFrame(videoEl, width = 640, height = 480) {
    const canvas = document.getElementById("captureCanvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return dataUrl.split(",")[1]; // strip data:image/jpeg;base64,
  }

  /**
   * Capture a frame from an <img> element (MJPEG stream)
   */
  function captureImgFrame(imgEl, width = 640, height = 480) {
    const canvas = document.getElementById("captureCanvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    try { ctx.drawImage(imgEl, 0, 0, width, height); }
    catch { return null; }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return dataUrl.split(",")[1];
  }

  /**
   * Send image to Grok for analysis
   */
  async function analyze(base64Image) {
    if (!base64Image) throw new Error("No image data");
    if (!_apiKey) throw new Error("No API key. Please add your Grok API key in Settings.");

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64Image, mimeType: "image/jpeg", apiKey: _apiKey })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.result;
  }

  /**
   * Start live scanning loop
   */
  function startScanning(getFrameFn, onResult, onError, onCountdown) {
    if (_scanning) return;
    if (!_apiKey) { onError("Please add your Grok API key in Settings first."); return; }
    _scanning = true;

    const doScan = async () => {
      if (!_scanning) return;
      try {
        const base64 = getFrameFn();
        if (!base64) { scheduleNext(doScan, onCountdown); return; }
        const result = await analyze(base64);
        onResult(result, new Date());
      } catch (err) {
        onError(err.message);
      }
      scheduleNext(doScan, onCountdown);
    };

    const scheduleNext = (fn, onCountdown) => {
      if (!_scanning) return;
      _nextScanIn = _scanInterval;
      if (_timerCountdown) clearInterval(_timerCountdown);
      _timerCountdown = setInterval(() => {
        _nextScanIn--;
        if (onCountdown) onCountdown(_nextScanIn);
        if (_nextScanIn <= 0) { clearInterval(_timerCountdown); }
      }, 1000);
      _scanTimer = setTimeout(fn, _scanInterval * 1000);
    };

    doScan();
  }

  function stopScanning() {
    _scanning = false;
    if (_scanTimer) clearTimeout(_scanTimer);
    if (_timerCountdown) clearInterval(_timerCountdown);
  }

  function isScanning() { return _scanning; }

  /**
   * Format a result object into HTML
   */
  function renderResult(result) {
    if (!result || result.error) {
      return `<div class="result-empty">⚠️ ${result?.error || "Analysis failed"}</div>`;
    }
    const sev = result.severity || 0;
    const conf = Math.round((result.confidence || 0) * 100);
    const urgIcon = URGENCY_ICONS[result.urgency] || "🟢";

    const symptoms = (result.symptoms || []).map(s => `<li>${s}</li>`).join("");
    const treatment = (result.treatment || []).map(t => `<li>${t}</li>`).join("");
    const prevention = (result.prevention || []).map(p => `<li>${p}</li>`).join("");
    const additional = (result.additional_issues || []).map(a => `<li>${a}</li>`).join("");

    return `
      <div class="result-header">
        <div>
          <div class="result-disease">${urgIcon} ${result.disease_name || "No Disease"}</div>
          <div class="result-crop">Crop: ${result.crop_type || "Unknown"} • Affected: ${result.affected_percentage || 0}%</div>
        </div>
        <div class="severity-badge sev-${sev}">SEV ${sev}/5 — ${SEVERITY_LABELS[sev] || ""}</div>
      </div>
      <div class="result-section">
        <h4>Confidence</h4>
        <div>${conf}%</div>
        <div class="confidence-bar"><div class="confidence-fill" style="width:${conf}%"></div></div>
      </div>
      <div class="result-section">
        <h4>Urgency</h4>
        <span class="urgency-tag urgency-${result.urgency || 'none'}">${(result.urgency || "none").toUpperCase()}</span>
      </div>
      ${symptoms ? `<div class="result-section"><h4>Symptoms Observed</h4><ul>${symptoms}</ul></div>` : ""}
      ${treatment ? `<div class="result-section"><h4>Recommended Treatment</h4><ul>${treatment}</ul></div>` : ""}
      ${prevention ? `<div class="result-section"><h4>Prevention Tips</h4><ul>${prevention}</ul></div>` : ""}
      ${additional ? `<div class="result-section"><h4>Additional Observations</h4><ul>${additional}</ul></div>` : ""}
      <div class="result-section">
        <h4>Spoilage Level</h4>
        <span class="urgency-tag urgency-${result.spoilage_level === 'severe' ? 'high' : result.spoilage_level === 'moderate' ? 'medium' : 'none'}">${(result.spoilage_level || "none").toUpperCase()}</span>
      </div>
    `;
  }

  return { setApiKey, getApiKey, setScanInterval, setAlertThreshold, analyze, startScanning, stopScanning, isScanning, captureFrame, captureImgFrame, renderResult, getThreshold: () => _alertThreshold };
})();
