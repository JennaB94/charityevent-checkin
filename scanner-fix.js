let scannerStream = null;
let scanLoopActive = false;

async function startScanner() {
  const cpId = document.getElementById("scan-cp").value;
  const result = document.getElementById("scan-result");

  if (!cpId) {
    result.textContent = "Please select a checkpoint first.";
    result.className = "result-error";
    return;
  }

  const video = document.getElementById("scanner-video");
  document.getElementById("video-container").style.display = "block";
  document.getElementById("start-scan-btn").style.display = "none";
  document.getElementById("stop-scan-btn").style.display = "inline-block";

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    video.srcObject = scannerStream;
    await video.play();

    result.textContent = "Scanning… hold the QR code in the frame.";
    result.className = "result-info";

    scanLoopActive = true;
    scanQRCode(cpId);
  } catch (err) {
    result.textContent = "Camera could not start. Check browser camera permissions.";
    result.className = "result-error";
    stopScanner();
  }
}

function stopScanner() {
  scanLoopActive = false;

  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }

  document.getElementById("video-container").style.display = "none";
  document.getElementById("start-scan-btn").style.display = "inline-block";
  document.getElementById("stop-scan-btn").style.display = "none";
}

function scanQRCode(cpId) {
  const video = document.getElementById("scanner-video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  function tick() {
    if (!scanLoopActive || !scannerStream) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);

      if (code && code.data) {
        manualCheckin(code.data.trim());
        stopScanner();
        return;
      }
    }

    requestAnimationFrame(tick);
  }

  tick();
}

function manualCheckin(scannedValue) {
  const input = scannedValue || document.getElementById("manual-input").value.trim();
  const cpId = document.getElementById("scan-cp").value;
  const result = document.getElementById("scan-result");

  if (!cpId) {
    result.textContent = "Please select a checkpoint first.";
    result.className = "result-error";
    return;
  }

  if (!input) {
    result.textContent = "Please scan a QR code or enter a participant ID/name.";
    result.className = "result-error";
    return;
  }

  const participant = state.participants.find(p =>
    p.id.toLowerCase() === input.toLowerCase() ||
    p.name.toLowerCase() === input.toLowerCase()
  );

  if (!participant) {
    result.textContent = "Participant not found.";
    result.className = "result-error";
    return;
  }

  const checkpoint = state.checkpoints.find(c => c.id === cpId);

  const checkin = {
    id: Date.now().toString(),
    participantId: participant.id,
    name: participant.name,
    group: participant.group || "General",
    checkpointId: cpId,
    checkpoint: checkpoint ? checkpoint.name : "Unknown checkpoint",
    time: new Date().toISOString()
  };

  state.log.push(checkin);
  localStorage.setItem("checkin_pro", JSON.stringify(state));

  if (typeof saveCheckInToFirebase === "function") {
    saveCheckInToFirebase(checkin);
  }

  if (typeof broadcastCheckIn === "function") {
    broadcastCheckIn(checkin);
  }

  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof renderLog === "function") renderLog();

  result.textContent = `Checked in: ${participant.name}`;
  result.className = "result-success";

  document.getElementById("manual-input").value = "";
}
