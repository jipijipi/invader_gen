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
const resizeButton = document.querySelector("#resizeButton");
const mirrorInput = document.querySelector("#mirrorInput");
const saveButton = document.querySelector("#saveButton");
const gallery = document.querySelector("#gallery");
const galleryCount = document.querySelector("#galleryCount");

let size = DEFAULT_SIZE;
let pixels = createGrid(size);
let isDrawing = false;
let dragValue = 1;
let lastTouchedIndex = -1;
let activeCreationId = null;

function createGrid(nextSize) {
  return Array.from({ length: nextSize }, () => Array(nextSize).fill(0));
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
  board.classList.toggle("even-size", size % 2 === 0);
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
  board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${size}, 1fr)`;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      if (size % 2 === 1 && col === Math.floor(size / 2)) {
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
  const rows = pixels.map((row) => row.join(""));
  exportText.value = [
    FORMAT_NAME,
    `size:${size}x${size}`,
    `name:${getCreationName()}`,
    "data:",
    ...rows,
  ].join("\n");
}

function paintCell(cell, mode = getTool()) {
  if (!cell?.classList.contains("cell")) {
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const index = row * size + col;

  if (isDrawing && index === lastTouchedIndex) {
    return;
  }

  const nextValue = mode === "toggle" ? (pixels[row][col] ? 0 : 1) : dragValue;
  pixels[row][col] = nextValue;

  if (isMirrorEnabled()) {
    pixels[row][size - col - 1] = nextValue;
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

  const match = lines[1].match(/^size:(\d+)x\1$/);
  if (!match) {
    throw new Error("Size must be square, for example size:20x20.");
  }

  const nextSize = Number(match[1]);
  const nameLine = lines.find((line) => line.startsWith("name:"));
  const nextName = nameLine?.slice(5).trim() || "Imported";
  const dataStart = lines.indexOf("data:");
  const rows = lines.slice(dataStart + 1);

  if (nextSize < 2 || nextSize > 64 || dataStart === -1 || rows.length !== nextSize) {
    throw new Error("Data dimensions do not match the declared size.");
  }

  if (!rows.every((row) => row.length === nextSize && /^[01]+$/.test(row))) {
    throw new Error("Rows may only contain 0 and 1 values.");
  }

  return {
    nextName,
    nextSize,
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
    size,
    pixels,
    updatedAt: new Date().toISOString(),
  };
}

function loadCreation(creation) {
  activeCreationId = creation.id;
  nameInput.value = creation.name || "Untitled";
  size = creation.size;
  pixels = creation.pixels.map((row) => [...row]);
  sizeInput.value = String(size);
  renderBoard();
  setStatus("Loaded");
}

function deleteCreation(id) {
  const creations = getSavedCreations().filter((creation) => creation.id !== id);
  setSavedCreations(creations);
  if (activeCreationId === id) {
    activeCreationId = null;
  }
  renderGallery();
  setStatus("Deleted");
}

function createThumbnail(creation) {
  const thumbnail = document.createElement("div");
  thumbnail.className = "thumbnail";
  thumbnail.style.gridTemplateColumns = `repeat(${creation.size}, 1fr)`;
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
  gallery.replaceChildren();
  galleryCount.textContent = creations.length ? `${creations.length} saved` : "Empty";

  if (creations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-gallery";
    empty.textContent = "Saved creations appear here.";
    gallery.append(empty);
    return;
  }

  for (const creation of creations) {
    const item = document.createElement("article");
    item.className = "gallery-item";

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

    item.append(loadButton, deleteButton);
    gallery.append(item);
  }
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

function createExportFilename() {
  const name = getCreationName()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");

  return `${name}-${size}x${size}-${timestamp}.invader`;
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
  pixels = createGrid(size);
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
    size = parsed.nextSize;
    pixels = parsed.nextPixels;
    sizeInput.value = String(size);
    renderBoard();
    setStatus("Imported");
  } catch (error) {
    setStatus(error.message);
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([exportText.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = createExportFilename();
  link.click();
  URL.revokeObjectURL(url);
});

resizeButton.addEventListener("click", () => {
  const nextSize = Number(sizeInput.value);

  if (!Number.isInteger(nextSize) || nextSize < 2 || nextSize > 64) {
    setStatus("Use a size from 2 to 64");
    sizeInput.value = String(size);
    return;
  }

  const nextPixels = createGrid(nextSize);
  const limit = Math.min(size, nextSize);

  for (let row = 0; row < limit; row += 1) {
    for (let col = 0; col < limit; col += 1) {
      nextPixels[row][col] = pixels[row][col];
    }
  }

  size = nextSize;
  pixels = nextPixels;
  activeCreationId = null;
  renderBoard();
});

nameInput.addEventListener("input", syncExport);
mirrorInput.addEventListener("change", syncMirrorLine);
saveButton.addEventListener("click", saveCurrentCreation);

renderBoard();
renderGallery();
