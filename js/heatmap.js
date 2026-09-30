/**
 * heatmap.js — Canvas-based risk heatmap overlay for live camera feeds
 * Uses 9-zone grid derived from Grok AI analysis results
 */
const Heatmap = (() => {
  const ZONE_KEYS = [
    "top_left",    "top_center",    "top_right",
    "mid_left",    "mid_center",    "mid_right",
    "bot_left",    "bot_center",    "bot_right"
  ];

  let _canvas = null;
  let _ctx = null;
  let _enabled = true;
  let _currentZones = null;
  let _animFrame = null;
  let _opacity = 0.45;

  // Risk score → RGBA color
  function riskToColor(score, alpha) {
    const s = Math.max(0, Math.min(100, score));
    if (s <= 20) return `rgba(0, 200, 80, ${alpha})`;       // Green - healthy
    if (s <= 40) return `rgba(160, 220, 0, ${alpha})`;      // Yellow-green - low
    if (s <= 60) return `rgba(255, 180, 0, ${alpha})`;      // Yellow - moderate
    if (s <= 80) return `rgba(255, 80, 0, ${alpha})`;       // Orange - high
    return `rgba(220, 0, 0, ${alpha})`;                      // Red - critical
  }

  function init(canvasId) {
    _canvas = document.getElementById(canvasId);
    _ctx = _canvas?.getContext("2d");
  }

  function setEnabled(val) { _enabled = val; if (!val) clear(); }

  function clear() {
    if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }

  function resize() {
    if (!_canvas) return;
    const parent = _canvas.parentElement;
    _canvas.width = parent.offsetWidth;
    _canvas.height = parent.offsetHeight;
    if (_currentZones) draw(_currentZones);
  }

  /**
   * Draw heatmap from a zones object { top_left: 0-100, ... }
   */
  function draw(zones) {
    if (!_canvas || !_ctx || !_enabled) return;
    _currentZones = zones;
    _canvas.width = _canvas.parentElement.offsetWidth;
    _canvas.height = _canvas.parentElement.offsetHeight;

    const w = _canvas.width;
    const h = _canvas.height;
    const cols = 3;
    const rows = 3;
    const cw = w / cols;
    const ch = h / rows;

    _ctx.clearRect(0, 0, w, h);

    ZONE_KEYS.forEach((key, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const score = zones[key] ?? 0;
      const x = col * cw;
      const y = row * ch;

      // Draw gradient blob for each cell
      const gx = x + cw / 2;
      const gy = y + ch / 2;
      const radius = Math.max(cw, ch) * 0.8;
      const grad = _ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      grad.addColorStop(0, riskToColor(score, _opacity));
      grad.addColorStop(1, riskToColor(score, 0));

      _ctx.fillStyle = grad;
      _ctx.fillRect(x, y, cw, ch);

      // Draw score text for high-risk zones
      if (score > 40) {
        _ctx.fillStyle = "rgba(255,255,255,0.85)";
        _ctx.font = `bold ${Math.round(ch * 0.18)}px system-ui`;
        _ctx.textAlign = "center";
        _ctx.textBaseline = "middle";
        _ctx.fillText(`${score}%`, gx, gy);
      }
    });

    // Draw grid lines
    _ctx.strokeStyle = "rgba(255,255,255,0.08)";
    _ctx.lineWidth = 1;
    for (let c = 1; c < cols; c++) {
      _ctx.beginPath(); _ctx.moveTo(c * cw, 0); _ctx.lineTo(c * cw, h); _ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      _ctx.beginPath(); _ctx.moveTo(0, r * ch); _ctx.lineTo(w, r * ch); _ctx.stroke();
    }

    // Pulsing border for critical zones
    const maxScore = Math.max(...ZONE_KEYS.map(k => zones[k] ?? 0));
    if (maxScore > 80) {
      const pulseAlpha = 0.3 + 0.3 * Math.abs(Math.sin(Date.now() / 400));
      _ctx.strokeStyle = `rgba(220, 0, 0, ${pulseAlpha})`;
      _ctx.lineWidth = 4;
      _ctx.strokeRect(2, 2, w - 4, h - 4);
      // Redraw for animation
      if (_animFrame) cancelAnimationFrame(_animFrame);
      _animFrame = requestAnimationFrame(() => draw(_currentZones));
    }
  }

  /**
   * Animate transition from old zones to new zones
   */
  function animateTo(newZones, durationMs = 800) {
    if (!_enabled) return;
    const old = _currentZones || Object.fromEntries(ZONE_KEYS.map(k => [k, 0]));
    const start = performance.now();

    function step(now) {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const interpolated = {};
      ZONE_KEYS.forEach(k => {
        interpolated[k] = Math.round((old[k] ?? 0) + ((newZones[k] ?? 0) - (old[k] ?? 0)) * eased);
      });
      draw(interpolated);
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /**
   * Generate placeholder zones from a single affected_region string
   */
  function zonesFromRegion(region, severity) {
    const base = Math.min(100, (severity || 0) * 20);
    const zones = Object.fromEntries(ZONE_KEYS.map(k => [k, 5]));
    const regionMap = {
      "top-left":    ["top_left"],
      "top-center":  ["top_center"],
      "top-right":   ["top_right"],
      "center-left": ["mid_left"],
      "center":      ["mid_center"],
      "center-right":["mid_right"],
      "bottom-left": ["bot_left"],
      "bottom-center":["bot_center"],
      "bottom-right":["bot_right"],
      "widespread":   ZONE_KEYS,
      "none":        []
    };
    const affected = regionMap[region] || [];
    affected.forEach(k => { zones[k] = base; });
    // Spread slightly to neighbors
    ZONE_KEYS.forEach(k => { if (!affected.includes(k) && affected.length > 0) zones[k] = Math.round(base * 0.25); });
    return zones;
  }

  return { init, draw, animateTo, clear, resize, setEnabled, zonesFromRegion };
})();
