const { spawn } = require("child_process");

/**
 * Spawn an FFmpeg process to relay an RTSP stream as MJPEG frames.
 * @param {string} rtspUrl  - RTSP URL e.g. rtsp://192.168.1.100:554/stream
 * @param {function} onFrame - callback(frameBuffer)
 * @param {function} onError - callback(errorMessage)
 * @returns ffmpeg child process or null if ffmpeg not found
 */
function spawnRTSPStream(rtspUrl, onFrame, onError) {
  try {
    const args = [
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-q:v", "5",
      "-vf", "fps=2,scale=640:480",
      "pipe:1"
    ];

    const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let buffer = Buffer.alloc(0);
    const SOI = Buffer.from([0xff, 0xd8]);
    const EOI = Buffer.from([0xff, 0xd9]);

    ffmpeg.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let start = -1;
      let end = -1;

      while (true) {
        if (start === -1) {
          for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) { start = i; break; }
          }
        }
        if (start !== -1) {
          for (let i = start + 2; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) { end = i + 2; break; }
          }
        }
        if (start !== -1 && end !== -1) {
          const frame = buffer.slice(start, end);
          onFrame(frame);
          buffer = buffer.slice(end);
          start = -1; end = -1;
        } else break;
      }
    });

    ffmpeg.stderr.on("data", (data) => {
      // FFmpeg logs info to stderr — only log errors
      const msg = data.toString();
      if (msg.includes("Error") || msg.includes("error") || msg.includes("Invalid")) {
        console.warn("FFmpeg:", msg.substring(0, 200));
      }
    });

    ffmpeg.on("error", (err) => {
      if (err.code === "ENOENT") onError("FFmpeg not found. Install FFmpeg to enable RTSP support.");
      else onError("FFmpeg error: " + err.message);
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0 && code !== null) onError(`Stream ended (code ${code})`);
    });

    return ffmpeg;
  } catch (err) {
    onError("Failed to start stream: " + err.message);
    return null;
  }
}

function stopStream(proc) {
  if (proc && !proc.killed) {
    proc.kill("SIGKILL");
  }
}

module.exports = { spawnRTSPStream, stopStream };
