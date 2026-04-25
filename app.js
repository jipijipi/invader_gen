const DEFAULT_SIZE = 20;
const FORMAT_NAME = "INVADER1";

const board = document.querySelector("#board");
const exportText = document.querySelector("#exportText");
const status = document.querySelector("#status");
const sizeInput = document.querySelector("#sizeInput");
const clearButton = document.querySelector("#clearButton");
const invertButton = document.querySelector("#invertButton");
const copyButton = document.querySelector("#copyButton");
const importButton = document.querySelector("#importButton");
const downloadButton = document.querySelector("#downloadButton");
const resizeButton = document.querySelector("#resizeButton");
const mirrorInput = document.querySelector("#mirrorInput");

let size = DEFAULT_SIZE;
let pixels = createGrid(size);
let isDrawing = false;
let dragValue = 1;
let lastTouchedIndex = -1;

function createGrid(nextSize) {
  return Array.from({ length: nextSize }, () => Array(nextSize).fill(0));
}

function getTool() {
  return document.querySelector('input[name="tool"]:checked').value;
}

function isMirrorEnabled() {
  return mirrorInput.checked;
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
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `Pixel ${col + 1}, ${row + 1}`);
      board.append(cell);
    }
  }

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
  const dataStart = lines.indexOf("data:");
  const rows = lines.slice(dataStart + 1);

  if (nextSize < 2 || nextSize > 64 || dataStart === -1 || rows.length !== nextSize) {
    throw new Error("Data dimensions do not match the declared size.");
  }

  if (!rows.every((row) => row.length === nextSize && /^[01]+$/.test(row))) {
    throw new Error("Rows may only contain 0 and 1 values.");
  }

  return {
    nextSize,
    nextPixels: rows.map((row) => [...row].map(Number)),
  };
}

function createExportFilename() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");

  return `invader-${size}x${size}-${timestamp}.invader`;
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
  dragValue = tool === "erase" ? 0 : 1;
  paintCell(cell, tool);
});

board.addEventListener("pointermove", (event) => {
  if (!isDrawing) {
    return;
  }

  event.preventDefault();
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
  renderBoard();
});

renderBoard();
