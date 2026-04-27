const DEFAULT_SIZE = 13;
const FORMAT_NAME = "INVADER1";
const STORAGE_KEY = "invader-gen-creations";

const board = document.querySelector("#board");
const exportText = document.querySelector("#exportText");
const status = document.querySelector("#status");
const sizeInput = document.querySelector("#sizeInput");
const nameInput = document.querySelector("#nameInput");
const clearButton = document.querySelector("#clearButton");
const invertButton = document.querySelector("#invertButton");
const copyButton = document.querySelector("#copyButton");
const importButton = document.querySelector("#importButton");
const downloadButton = document.querySelector("#downloadButton");
const pngButton = document.querySelector("#pngButton");
const svgButton = document.querySelector("#svgButton");
const resizeButton = document.querySelector("#resizeButton");
const mirrorInput = document.querySelector("#mirrorInput");
const saveButton = document.querySelector("#saveButton");
const uploadButton = document.querySelector("#uploadButton");
const gallery = document.querySelector("#gallery");
const galleryCount = document.querySelector("#galleryCount");
const selectedCount = document.querySelector("#selectedCount");
const edgeButtons = document.querySelectorAll("[data-edge]");

let rows = DEFAULT_SIZE;
let cols = DEFAULT_SIZE;
let pixels = createGrid(rows, cols);
let isDrawing = false;
let dragValue = 1;
let lastTouchedIndex = -1;
let activeCreationId = null;
const selectedCreationIds = new Set();

function createGrid(rowCount, colCount) {
  return Array.from({ length: rowCount }, () => Array(colCount).fill(0));
}

function getTool() {
  return document.querySelector('input[name="tool"]:checked').value;
}

function getPaintValue(tool, shiftKey) {
  const toolValue = tool === "erase" ? 0 : 1;
  return shiftKey && tool !== "toggle" ? Number(!toolValue) : toolValue;
}

function isMirrorEnabled() {
  return mirrorInput.checked;
}

function syncMirrorLine() {
  board.classList.toggle("mirror-on", isMirrorEnabled());
  board.classList.toggle("even-size", cols % 2 === 0);
}

function getCreationName() {
  return nameInput.value.trim() || "Untitled";
}

function setStatus(message) {
  status.textContent = message;
  window.clearTimeout(setStatus.timeoutId);
  setStatus.timeoutId = window.setTimeout(() => {
    status.textContent = "";
  }, 1800);
}

function renderBoard() {
  board.replaceChildren();
  board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  board.style.aspectRatio = `${cols} / ${rows}`;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      if (cols % 2 === 1 && col === Math.floor(cols / 2)) {
        cell.classList.add("mirror-center-column");
      }
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Pixel ${col + 1}, ${row + 1}`);
      board.append(cell);
    }
  }

  syncMirrorLine();
  syncCells();
}

function syncCells() {
  for (const cell of board.children) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const isOn = pixels[row][col] === 1;
    cell.classList.toggle("is-on", isOn);
    cell.setAttribute("aria-pressed", String(isOn));
  }
  syncExport();
}

function syncExport() {
  const dataRows = pixels.map((row) => row.join(""));
  exportText.value = [
    FORMAT_NAME,
    `size:${cols}x${rows}`,
    `name:${getCreationName()}`,
    "data:",
    ...dataRows,
  ].join("\n");
}

function paintCell(cell, mode = getTool()) {
  if (!cell?.classList.contains("cell")) {
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const index = row * cols + col;

  if (isDrawing && index === lastTouchedIndex) {
    return;
  }

  const nextValue = mode === "toggle" ? (pixels[row][col] ? 0 : 1) : dragValue;
  pixels[row][col] = nextValue;

  if (isMirrorEnabled()) {
    pixels[row][cols - col - 1] = nextValue;
  }

  lastTouchedIndex = index;
  syncCells();
}

function getCellFromEvent(event) {
  if (event.target.classList.contains("cell")) {
    return event.target;
  }

  const point = event.touches?.[0] ?? event;
  return document.elementFromPoint(point.clientX, point.clientY);
}

function parseExport(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0] !== FORMAT_NAME || !lines[1]?.startsWith("size:")) {
    throw new Error("Missing INVADER1 header.");
  }

  const match = lines[1].match(/^size:(\d+)x(\d+)$/);
  if (!match) {
    throw new Error("Size must use columns x rows, for example size:13x13.");
  }

  const nextCols = Number(match[1]);
  const nextRows = Number(match[2]);
  const nameLine = lines.find((line) => line.startsWith("name:"));
  const nextName = nameLine?.slice(5).trim() || "Imported";
  const dataStart = lines.indexOf("data:");
  const rows = lines.slice(dataStart + 1);

  if (
    nextCols < 2 ||
    nextCols > 64 ||
    nextRows < 2 ||
    nextRows > 64 ||
    dataStart === -1 ||
    rows.length !== nextRows
  ) {
    throw new Error("Data dimensions do not match the declared size.");
  }

  if (!rows.every((row) => row.length === nextCols && /^[01]+$/.test(row))) {
    throw new Error("Rows may only contain 0 and 1 values.");
  }

  return {
    nextName,
    nextRows,
    nextCols,
    nextPixels: rows.map((row) => [...row].map(Number)),
  };
}

function getSavedCreations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function setSavedCreations(creations) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creations));
}

function updateUploadControls() {
  const count = selectedCreationIds.size;
  selectedCount.textContent = count === 1 ? "1 selected" : `${count} selected`;
  uploadButton.disabled = count === 0;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `creation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createStorageSnapshot(id = createId()) {
  return {
    id,
    name: getCreationName(),
    rows,
    cols,
    pixels: pixels.map((row) => [...row]),
    updatedAt: new Date().toISOString(),
  };
}

function loadCreation(creation) {
  activeCreationId = null;
  nameInput.value = creation.name || "Untitled";
  rows = creation.rows || creation.size;
  cols = creation.cols || creation.size;
  pixels = creation.pixels.map((row) => [...row]);
  sizeInput.value = String(Math.max(rows, cols));
  renderBoard();
  setStatus("Loaded");
}

function deleteCreation(id) {
  const creations = getSavedCreations().filter((creation) => creation.id !== id);
  setSavedCreations(creations);
  selectedCreationIds.delete(id);
  if (activeCreationId === id) {
    activeCreationId = null;
  }
  renderGallery();
  setStatus("Deleted");
}

function createThumbnail(creation) {
  const thumbnail = document.createElement("div");
  thumbnail.className = "thumbnail";
  const thumbnailCols = creation.cols || creation.size;
  const thumbnailRows = creation.rows || creation.size;
  thumbnail.style.gridTemplateColumns = `repeat(${thumbnailCols}, 1fr)`;
  thumbnail.style.aspectRatio = `${thumbnailCols} / ${thumbnailRows}`;
  thumbnail.setAttribute("aria-hidden", "true");

  for (const row of creation.pixels) {
    for (const value of row) {
      const pixel = document.createElement("span");
      pixel.className = value ? "is-on" : "";
      thumbnail.append(pixel);
    }
  }

  return thumbnail;
}

function renderGallery() {
  const creations = getSavedCreations().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const savedIds = new Set(creations.map((creation) => creation.id));
  for (const id of selectedCreationIds) {
    if (!savedIds.has(id)) {
      selectedCreationIds.delete(id);
    }
  }
  gallery.replaceChildren();
  galleryCount.textContent = creations.length ? `${creations.length} saved` : "Empty";

  if (creations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-gallery";
    empty.textContent = "Saved creations appear here.";
    gallery.append(empty);
    updateUploadControls();
    return;
  }

  for (const creation of creations) {
    const item = document.createElement("article");
    item.className = "gallery-item";

    const selectLabel = document.createElement("label");
    selectLabel.className = "gallery-select";

    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.checked = selectedCreationIds.has(creation.id);
    selectInput.setAttribute("aria-label", `Select ${creation.name || "Untitled"} for upload`);
    selectInput.addEventListener("change", () => {
      if (selectInput.checked) {
        selectedCreationIds.add(creation.id);
      } else {
        selectedCreationIds.delete(creation.id);
      }
      updateUploadControls();
    });

    selectLabel.append(selectInput);

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "gallery-load";
    loadButton.append(createThumbnail(creation));

    const label = document.createElement("span");
    label.textContent = creation.name || "Untitled";
    loadButton.append(label);
    loadButton.addEventListener("click", () => loadCreation(creation));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteCreation(creation.id));

    item.append(selectLabel, loadButton, deleteButton);
    gallery.append(item);
  }

  updateUploadControls();
}

function saveCurrentCreation() {
  const creations = getSavedCreations();
  const existingIndex = creations.findIndex((creation) => creation.id === activeCreationId);
  const snapshot = createStorageSnapshot(activeCreationId || undefined);

  if (existingIndex >= 0) {
    creations[existingIndex] = snapshot;
  } else {
    activeCreationId = snapshot.id;
    creations.push(snapshot);
  }

  setSavedCreations(creations);
  renderGallery();
  setStatus("Saved");
}

function normalizeSavedCreation(creation) {
  return {
    id: creation.id,
    name: creation.name || "Untitled",
    rows: creation.rows || creation.size,
    cols: creation.cols || creation.size,
    pixels: creation.pixels,
    updatedAt: creation.updatedAt,
  };
}

async function uploadSelectedCreations() {
  const designs = getSavedCreations()
    .filter((creation) => selectedCreationIds.has(creation.id))
    .map(normalizeSavedCreation);

  if (designs.length === 0) {
    selectedCreationIds.clear();
    renderGallery();
    setStatus("Select designs first");
    return;
  }

  uploadButton.disabled = true;
  setStatus("Uploading...");

  try {
    const response = await fetch("/api/upload-designs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ designs }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Upload failed");
    }

    setStatus(result.uploaded === 1 ? "Uploaded 1 design" : `Uploaded ${result.uploaded} designs`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    updateUploadControls();
  }
}

function getFilenameBase() {
  const name = getCreationName()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");

  return `${name}-${cols}x${rows}-${timestamp}`;
}

function createExportFilename(extension) {
  return `${getFilenameBase()}.${extension}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPng() {
  const cellSize = 32;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (pixels[row][col] === 1) {
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  canvas.toBlob((blob) => {
    if (!blob) {
      setStatus("PNG export failed");
      return;
    }

    downloadBlob(blob, createExportFilename("png"));
    setStatus("PNG downloaded");
  }, "image/png");
}

function escapeSvgText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createSvgMarkup() {
  const rects = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (pixels[row][col] === 1) {
        rects.push(`<rect x="${col}" y="${row}" width="1" height="1"/>`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" shape-rendering="crispEdges">`,
    `<title>${escapeSvgText(getCreationName())}</title>`,
    `<rect width="${cols}" height="${rows}" fill="#fff"/>`,
    `<g fill="#111">`,
    ...rects,
    "</g>",
    "</svg>",
  ].join("\n");
}

function exportSvg() {
  const blob = new Blob([createSvgMarkup()], { type: "image/svg+xml" });
  downloadBlob(blob, createExportFilename("svg"));
  setStatus("SVG downloaded");
}

function addEdge(edge) {
  if ((edge === "top" || edge === "bottom") && rows >= 64) {
    setStatus("Maximum height is 64");
    return;
  }

  if ((edge === "left" || edge === "right") && cols >= 64) {
    setStatus("Maximum width is 64");
    return;
  }

  if (edge === "top") {
    pixels.unshift(Array(cols).fill(0));
    rows += 1;
  }

  if (edge === "bottom") {
    pixels.push(Array(cols).fill(0));
    rows += 1;
  }

  if (edge === "left") {
    pixels = pixels.map((row) => [0, ...row]);
    cols += 1;
  }

  if (edge === "right") {
    pixels = pixels.map((row) => [...row, 0]);
    cols += 1;
  }

  activeCreationId = null;
  sizeInput.value = String(Math.max(rows, cols));
  renderBoard();
}

function removeEdge(edge) {
  if ((edge === "top" || edge === "bottom") && rows <= 2) {
    setStatus("Minimum height is 2");
    return;
  }

  if ((edge === "left" || edge === "right") && cols <= 2) {
    setStatus("Minimum width is 2");
    return;
  }

  if (edge === "top") {
    pixels.shift();
    rows -= 1;
  }

  if (edge === "bottom") {
    pixels.pop();
    rows -= 1;
  }

  if (edge === "left") {
    pixels = pixels.map((row) => row.slice(1));
    cols -= 1;
  }

  if (edge === "right") {
    pixels = pixels.map((row) => row.slice(0, -1));
    cols -= 1;
  }

  activeCreationId = null;
  sizeInput.value = String(Math.max(rows, cols));
  renderBoard();
}

function updateEdge(edge, action) {
  if (action === "remove") {
    removeEdge(edge);
    return;
  }

  addEdge(edge);
}

board.addEventListener("pointerdown", (event) => {
  const cell = getCellFromEvent(event);
  const tool = getTool();

  if (!cell?.classList.contains("cell")) {
    return;
  }

  event.preventDefault();
  board.setPointerCapture(event.pointerId);
  isDrawing = true;
  lastTouchedIndex = -1;
  dragValue = getPaintValue(tool, event.shiftKey);
  paintCell(cell, tool);
});

board.addEventListener("pointermove", (event) => {
  if (!isDrawing) {
    return;
  }

  event.preventDefault();
  dragValue = getPaintValue(getTool(), event.shiftKey);
  paintCell(getCellFromEvent(event));
});

board.addEventListener("pointerup", () => {
  isDrawing = false;
  lastTouchedIndex = -1;
});

board.addEventListener("pointercancel", () => {
  isDrawing = false;
  lastTouchedIndex = -1;
});

clearButton.addEventListener("click", () => {
  pixels = createGrid(rows, cols);
  activeCreationId = null;
  syncCells();
});

invertButton.addEventListener("click", () => {
  pixels = pixels.map((row) => row.map((value) => (value ? 0 : 1)));
  syncCells();
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(exportText.value);
  } catch {
    exportText.select();
    document.execCommand("copy");
    exportText.setSelectionRange(0, 0);
  }
  setStatus("Copied");
});

importButton.addEventListener("click", () => {
  try {
    const parsed = parseExport(exportText.value);
    activeCreationId = null;
    nameInput.value = parsed.nextName;
    rows = parsed.nextRows;
    cols = parsed.nextCols;
    pixels = parsed.nextPixels;
    sizeInput.value = String(Math.max(rows, cols));
    renderBoard();
    setStatus("Imported");
  } catch (error) {
    setStatus(error.message);
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([exportText.value], { type: "text/plain" });
  downloadBlob(blob, createExportFilename("invader"));
});

pngButton.addEventListener("click", exportPng);
svgButton.addEventListener("click", exportSvg);

resizeButton.addEventListener("click", () => {
  const nextSize = Number(sizeInput.value);

  if (!Number.isInteger(nextSize) || nextSize < 2 || nextSize > 64) {
    setStatus("Use a size from 2 to 64");
    sizeInput.value = String(Math.max(rows, cols));
    return;
  }

  const nextPixels = createGrid(nextSize, nextSize);
  const rowLimit = Math.min(rows, nextSize);
  const colLimit = Math.min(cols, nextSize);

  for (let row = 0; row < rowLimit; row += 1) {
    for (let col = 0; col < colLimit; col += 1) {
      nextPixels[row][col] = pixels[row][col];
    }
  }

  rows = nextSize;
  cols = nextSize;
  pixels = nextPixels;
  activeCreationId = null;
  renderBoard();
});

nameInput.addEventListener("input", syncExport);
mirrorInput.addEventListener("change", syncMirrorLine);
saveButton.addEventListener("click", saveCurrentCreation);
uploadButton.addEventListener("click", uploadSelectedCreations);
edgeButtons.forEach((button) => {
  button.addEventListener("click", () => updateEdge(button.dataset.edge, button.dataset.edgeAction));
});

renderBoard();
renderGallery();
