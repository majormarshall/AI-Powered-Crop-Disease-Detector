# 🌿 CropGuard AI — Farm Disease Monitor

An AI-powered real-time crop disease detection and farm monitoring system using **Grok Vision AI** with live camera feeds, thermal heatwave overlays, and a full farm dashboard.

---

## Features

- 📷 **Any camera type**: USB webcams, IP cameras (MJPEG), CCTV (RTSP), image upload
- 🤖 **Grok AI Vision**: Live analysis using `grok-2-vision-1212` model
- 🌡️ **Live Heatwave Overlay**: Color-coded risk zones on live video feed
- 🗺️ **Farm Zone Map**: 4×4 zone grid (A1–D4) with real-time health status
- 📊 **Disease Trend Charts**: Time-series charts (1h / 24h / 7d)
- 🚨 **Real-time Alerts**: Instant notifications for detected diseases
- 📋 **Scan History**: Full log of all detections, exportable as CSV
- 🌐 **Multi-camera support**: Monitor up to 4 feeds simultaneously

---

## Quick Start

### 1. Prerequisites
- **Node.js** 16+ — [nodejs.org](https://nodejs.org)
- **FFmpeg** (optional, for RTSP/CCTV streams) — [ffmpeg.org](https://ffmpeg.org/download.html)
- **Grok API Key** — Get free at [console.x.ai](https://console.x.ai)

### 2. Install & Run
```bash
cd server
npm install
copy .env.example .env
# Edit .env and add your GROK_API_KEY
node server.js
```

### 3. Open App
Visit: **http://localhost:3000**

### 4. Add Your API Key
- Go to **Settings** → paste your Grok API key → click Save

### 5. Add a Camera
- Click **+ Add Camera**
- Choose type: USB / IP Camera / CCTV / Upload
- For IP cameras: enter MJPEG URL (e.g. `http://192.168.1.100/video.mjpg`)
- For CCTV: enter RTSP URL (e.g. `rtsp://admin:pass@192.168.1.100:554/stream`)

### 6. Start Monitoring
- Go to **Live Analysis** → select camera → click **▶ Start Monitoring**

---

## Camera Types Supported

| Type | Example URL | Notes |
|------|-------------|-------|
| USB Webcam | (select from device list) | Built-in or USB cameras |
| IP Camera MJPEG | `http://192.168.1.100/video.mjpg` | Most IP cameras support this |
| CCTV RTSP | `rtsp://admin:pass@192.168.1.100:554/stream` | Requires FFmpeg |
| Image Upload | (drag & drop) | Manual single-image analysis |

### Common IP Camera MJPEG URLs
- Hikvision: `http://IP/ISAPI/Streaming/channels/101/picture`
- Dahua: `http://IP/cgi-bin/mjpeg?channel=1`
- Generic: `http://IP/video.cgi` or `http://IP/mjpg/video.mjpg`

---

## Diseases Detected

- Tomato: Early Blight, Late Blight, Leaf Mold, Septoria Leaf Spot, Spider Mites, Yellow Leaf Curl Virus, Mosaic Virus, Bacterial Spot
- General crops: Powdery Mildew, Rust, Fusarium Wilt, Root Rot, Nutrient Deficiency, Pest Damage
- Spoilage: Rot, Mold, Over-ripeness, Physical damage

---

## Heatwave Overlay Colors

| Color | Risk Score | Meaning |
|-------|-----------|---------|
| 🟢 Green | 0–20 | Healthy |
| 🟡 Yellow-Green | 21–40 | Low risk |
| 🟡 Yellow | 41–60 | Moderate |
| 🟠 Orange | 61–80 | High risk |
| 🔴 Red | 81–100 | Critical — act now |

---

## Environment Variables

```
GROK_API_KEY=xai-your-key-here
PORT=3000
```

---

## License
MIT — Free to use and modify.
