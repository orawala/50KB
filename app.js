const $ = (id) => document.getElementById(id);

// Views
const uploadView = $("uploadView");
const editView = $("editView");
const resultView = $("resultView");

// Upload Elements
const dropZone = $("dropZone");
const fileInput = $("fileInput");
const uploadError = $("uploadError");
const chooseBtn = $("chooseBtn");

// Editor Elements
const editorShell = $("editorShell");
const editorCanvas = $("editorCanvas");
const editorWrap = $("editorWrap");
const selectionBox = $("selectionBox");
const rotateLeft = $("rotateLeft");
const rotateRight = $("rotateRight");
const zoomInBtn = $("zoomInBtn");
const zoomOutBtn = $("zoomOutBtn");
const nextBtn = $("nextBtn");

// Page Controls
const page2BackBtn = $("page2BackBtn");
const page3BackBtn = $("page3BackBtn");
const page3ResetBtn = $("page3ResetBtn");

// Result Elements
const resultCanvas = $("resultCanvas");
const maxKb = $("maxKb");
const donotRemoveBg = $("donotRemoveBg");
const processAndDownloadBtn = $("processAndDownloadBtn");

const state = {
  sourceImage: null,
  sourceFileName: "signature",
  rotation: 0,
  zoomScale: 1.0,
  crop: null,
  selecting: false,
  selectionStart: null,
  removeBg: true,
  outputBlob: null,
  outputUrl: null
};

function showView(view) {
  [uploadView, editView, resultView].forEach(v => v.classList.remove("active"));
  view.classList.add("active");
}

function setError(message = "") {
  uploadError.textContent = message;
  uploadError.hidden = !message;
}

function resetState() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.sourceImage = null;
  state.sourceFileName = "signature";
  state.rotation = 0;
  state.zoomScale = 1.0;
  state.crop = null;
  state.selecting = false;
  state.removeBg = true;
  state.outputBlob = null;
  state.outputUrl = null;
  fileInput.value = "";
  donotRemoveBg.classList.remove("active-toggle");
  donotRemoveBg.textContent = "Don't Remove BG";
  showView(uploadView);
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The selected image could not be read."));
    img.src = URL.createObjectURL(blob);
  });
}

async function handleFile(file) {
  setError();
  if (!file || !file.type.startsWith("image/")) {
    setError("Please choose a valid image file.");
    return;
  }

  try {
    const img = await loadImageFromBlob(file);
    state.sourceImage = img;
    state.sourceFileName = file.name.replace(/\.[^.]+$/, "") || "signature";
    state.rotation = 0;
    state.zoomScale = 1.0;
    state.crop = null;
    drawEditor();
    showView(editView);
  } catch (error) {
    setError(error.message);
  }
}

// Upload Actions
chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

["dragenter", "dragover"].forEach(type => {
  dropZone.addEventListener(type, e => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach(type => {
  dropZone.addEventListener(type, e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", e => {
  const file = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
  handleFile(file);
});

dropZone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

document.addEventListener("paste", e => {
  if (!uploadView.classList.contains("active")) return;
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
  if (item) handleFile(item.getAsFile());
});

function rotatedDimensions() {
  const w = state.sourceImage.naturalWidth;
  const h = state.sourceImage.naturalHeight;
  return state.rotation % 180 === 0 ? { w, h } : { w: h, h: w };
}

function drawEditor() {
  if (!state.sourceImage) return;
  const { w, h } = rotatedDimensions();

  const displayWidth = Math.round(w * state.zoomScale);
  const displayHeight = Math.round(h * state.zoomScale);

  editorCanvas.width = w;
  editorCanvas.height = h;
  editorCanvas.style.width = `${displayWidth}px`;
  editorCanvas.style.height = `${displayHeight}px`;

  const ctx = editorCanvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((state.rotation * Math.PI) / 180);
  const sw = state.sourceImage.naturalWidth;
  const sh = state.sourceImage.naturalHeight;
  ctx.drawImage(state.sourceImage, -sw / 2, -sh / 2);
  ctx.restore();

  if (!state.crop) {
    state.crop = {
      x: w * 0.1,
      y: h * 0.1,
      w: w * 0.8,
      h: h * 0.8
    };
  }

  updateSelectionBox();
}

function updateSelectionBox() {
  if (!state.crop) {
    selectionBox.hidden = true;
    return;
  }
  const scaleX = editorCanvas.clientWidth / editorCanvas.width;
  const scaleY = editorCanvas.clientHeight / editorCanvas.height;
  selectionBox.hidden = false;
  selectionBox.style.left = `${state.crop.x * scaleX}px`;
  selectionBox.style.top = `${state.crop.y * scaleY}px`;
  selectionBox.style.width = `${state.crop.w * scaleX}px`;
  selectionBox.style.height = `${state.crop.h * scaleY}px`;
}

function canvasPoint(e) {
  const r = editorCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(editorCanvas.width, ((e.clientX - r.left) * editorCanvas.width) / r.width)),
    y: Math.max(0, Math.min(editorCanvas.height, ((e.clientY - r.top) * editorCanvas.height) / r.height))
  };
}

function beginSelection(e) {
  state.selecting = true;
  state.selectionStart = canvasPoint(e);
  state.crop = { x: state.selectionStart.x, y: state.selectionStart.y, w: 1, h: 1 };
  editorCanvas.setPointerCapture(e.pointerId);
  updateSelectionBox();
}

function moveSelection(e) {
  if (!state.selecting) return;
  const p = canvasPoint(e);
  const s = state.selectionStart;
  state.crop = {
    x: Math.min(s.x, p.x),
    y: Math.min(s.y, p.y),
    w: Math.abs(p.x - s.x),
    h: Math.abs(p.y - s.y)
  };
  updateSelectionBox();
}

function endSelection() {
  if (!state.selecting) return;
  state.selecting = false;
  if (state.crop.w < 5 || state.crop.h < 5) {
    state.crop = null;
    drawEditor();
  } else {
    updateSelectionBox();
  }
}

editorCanvas.addEventListener("pointerdown", beginSelection);
editorCanvas.addEventListener("pointermove", moveSelection);
editorCanvas.addEventListener("pointerup", endSelection);
editorCanvas.addEventListener("pointercancel", endSelection);

// Zoom Actions
function applyZoom(delta) {
  state.zoomScale = Math.min(Math.max(0.1, state.zoomScale + delta), 5.0);
  drawEditor();
}

zoomInBtn.addEventListener("click", () => applyZoom(0.2));
zoomOutBtn.addEventListener("click", () => applyZoom(-0.2));

document.addEventListener("keydown", (e) => {
  if (!editView.classList.contains("active")) return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      applyZoom(0.2);
    } else if (e.key === "-") {
      e.preventDefault();
      applyZoom(-0.2);
    }
  }
});

editorShell.addEventListener("wheel", (e) => {
  if (!editView.classList.contains("active")) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    applyZoom(delta);
  }
}, { passive: false });

rotateLeft.addEventListener("click", () => {
  state.rotation = (state.rotation - 90 + 360) % 360;
  state.crop = null;
  drawEditor();
});

rotateRight.addEventListener("click", () => {
  state.rotation = (state.rotation + 90) % 360;
  state.crop = null;
  drawEditor();
});

page2BackBtn.addEventListener("click", () => showView(uploadView));
page3BackBtn.addEventListener("click", () => showView(editView));
page3ResetBtn.addEventListener("click", resetState);

nextBtn.addEventListener("click", () => {
  renderPreview();
  showView(resultView);
});

function renderPreview() {
  const prepared = createEditedCanvas();
  const outputCanvas = state.removeBg ? removePlainBackground(prepared) : prepared;

  resultCanvas.width = outputCanvas.width;
  resultCanvas.height = outputCanvas.height;
  const ctx = resultCanvas.getContext("2d");
  ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  ctx.drawImage(outputCanvas, 0, 0);
}

function createEditedCanvas() {
  const full = document.createElement("canvas");
  full.width = editorCanvas.width;
  full.height = editorCanvas.height;
  full.getContext("2d").drawImage(editorCanvas, 0, 0);

  if (!state.crop || state.crop.w < 4 || state.crop.h < 4) return full;

  const c = document.createElement("canvas");
  c.width = Math.round(state.crop.w);
  c.height = Math.round(state.crop.h);
  c.getContext("2d").drawImage(
    full,
    state.crop.x, state.crop.y, state.crop.w, state.crop.h,
    0, 0, c.width, c.height
  );
  return c;
}

function removePlainBackground(input) {
  const c = document.createElement("canvas");
  c.width = input.width;
  c.height = input.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(input, 0, 0);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(c.width, c.height) / 80));

  function sample(x, y) {
    const i = (y * c.width + x) * 4;
    samples.push([d[i], d[i + 1], d[i + 2]]);
  }

  for (let x = 0; x < c.width; x += step) {
    sample(x, 0);
    if (c.height > 1) sample(x, c.height - 1);
  }
  for (let y = step; y < c.height; y += step) {
    sample(0, y - 1);
    if (c.width > 1) sample(0, y - 1);
  }

  const avg = samples
    .reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0])
    .map(v => v / samples.length);

  const threshold = 42;
  const soft = 24;

  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.sqrt(
      (d[i] - avg[0]) ** 2 +
      (d[i + 1] - avg[1]) ** 2 +
      (d[i + 2] - avg[2]) ** 2
    );
    if (dist <= threshold) {
      d[i + 3] = 0;
    } else if (dist <= threshold + soft) {
      d[i + 3] = Math.round((255 * (dist - threshold)) / soft);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function canvasToJpegBlob(canvas, quality = 1) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function makeSizedJpeg(sourceCanvas, targetBytes, bg = "#ffffff") {
  async function renderAtScale(scale) {
    const w = Math.max(1, Math.round(sourceCanvas.width * scale));
    const h = Math.max(1, Math.round(sourceCanvas.height * scale));

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;

    const ctx = c.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sourceCanvas, 0, 0, w, h);

    const blob = await canvasToJpegBlob(c, 1);
    return { blob, canvas: c };
  }

  const original = await renderAtScale(1);

  if (original.blob.size > targetBytes) {
    let high = 1;
    let low = 0.01;
    let best = null;

    for (let i = 0; i < 35; i++) {
      const mid = (low + high) / 2;
      const result = await renderAtScale(mid);

      if (result.blob.size <= targetBytes) {
        best = result;
        low = mid;
      } else {
        high = mid;
      }
    }

    return best || (await renderAtScale(0.01));
  }

  let low = 1;
  let high = 2;
  let best = original;

  for (let i = 0; i < 8; i++) {
    const result = await renderAtScale(high);
    if (result.blob.size > targetBytes) break;
    best = result;
    low = high;
    high *= 1.5;
  }

  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    const result = await renderAtScale(mid);

    if (result.blob.size <= targetBytes) {
      best = result;
      low = mid;
    } else {
      high = mid;
    }
  }

  return best;
}

donotRemoveBg.addEventListener("click", () => {
  state.removeBg = !state.removeBg;
  if (!state.removeBg) {
    donotRemoveBg.classList.add("active-toggle");
    donotRemoveBg.textContent = "Keep BG (Active)";
  } else {
    donotRemoveBg.classList.remove("active-toggle");
    donotRemoveBg.textContent = "Don't Remove BG";
  }
  renderPreview();
});

processAndDownloadBtn.addEventListener("click", async () => {
  processAndDownloadBtn.disabled = true;

  const prepared = createEditedCanvas();
  const outputCanvas = state.removeBg ? removePlainBackground(prepared) : prepared;

  const target = Math.max(1, Number(maxKb.value) || 50) * 1024;
  const best = await makeSizedJpeg(outputCanvas, target, "#ffffff");

  state.outputBlob = best.blob;
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = URL.createObjectURL(best.blob);

  const a = document.createElement("a");
  a.href = state.outputUrl;
  a.download = `${state.sourceFileName}-processed.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  processAndDownloadBtn.disabled = false;
});

window.addEventListener("resize", () => {
  if (editView.classList.contains("active")) drawEditor();
});