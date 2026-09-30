/**
 * charts.js — Chart.js disease trend visualization
 */
const Charts = (() => {
  let _trendChart = null;
  const _history = JSON.parse(localStorage.getItem("scan_history") || "[]");

  const CHART_CFG = {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Disease Severity", data: [], borderColor: "#da3633", backgroundColor: "rgba(218,54,51,0.1)", tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 6 },
        { label: "Healthy (Inverse)", data: [], borderColor: "#2ea043", backgroundColor: "rgba(46,160,67,0.08)", tension: 0.4, fill: true, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#8b949e", font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: "#6e7681", font: { size: 10 }, maxRotation: 0 }, grid: { color: "#21262d" } },
        y: { min: 0, max: 5, ticks: { color: "#6e7681", stepSize: 1 }, grid: { color: "#21262d" } }
      }
    }
  };

  function init() {
    const canvas = document.getElementById("trendChart");
    if (!canvas) return;
    if (_trendChart) { _trendChart.destroy(); }
    _trendChart = new Chart(canvas, JSON.parse(JSON.stringify(CHART_CFG)));
    refreshChart("1h");
  }

  function addPoint(result, timestamp) {
    const entry = {
      timestamp: (timestamp || new Date()).toISOString(),
      severity: result.severity || 0,
      disease: result.disease_name || "None",
      health: result.overall_health || "unknown",
      confidence: result.confidence || 0,
      cropType: result.crop_type || "Unknown",
      urgency: result.urgency || "none",
      spoilage: result.spoilage_level || "none",
      camera: "Camera"
    };
    _history.unshift(entry);
    if (_history.length > 500) _history.pop();
    localStorage.setItem("scan_history", JSON.stringify(_history));
    refreshChart();
    return entry;
  }

  function refreshChart(range) {
    if (!_trendChart) return;
    const now = new Date();
    let cutoff = new Date(now - 3600000); // 1h default
    if (range === "24h") cutoff = new Date(now - 86400000);
    if (range === "7d")  cutoff = new Date(now - 604800000);

    const filtered = _history.filter(e => new Date(e.timestamp) >= cutoff).slice(0, 50).reverse();

    _trendChart.data.labels = filtered.map(e => {
      const d = new Date(e.timestamp);
      return range === "7d" ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });
    _trendChart.data.datasets[0].data = filtered.map(e => e.severity);
    _trendChart.data.datasets[1].data = filtered.map(e => e.severity === 0 ? 5 : Math.max(0, 5 - e.severity));
    _trendChart.update("none");
  }

  function getHistory() { return [..._history]; }

  function clearHistory() {
    _history.length = 0;
    localStorage.removeItem("scan_history");
    refreshChart();
  }

  function exportCSV() {
    const header = "Timestamp,Disease,Severity,Urgency,Crop Type,Spoilage,Confidence\n";
    const rows = _history.map(e =>
      `"${e.timestamp}","${e.disease}",${e.severity},"${e.urgency}","${e.cropType}","${e.spoilage}",${Math.round((e.confidence || 0) * 100)}%`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cropguard_history_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return { init, addPoint, refreshChart, getHistory, clearHistory, exportCSV };
})();
