// Save and load scenes as JSON files: download, file picker, drag and drop.

import { saveScene, type World } from "../core";

/** Worlds larger than this are refused before anything is allocated. */
export const MAX_SIDE = 1000;
export const MAX_CELLS = 250_000;

/** Returns an error message if a world of this size is not allowed, else null. */
export function sizeProblem(width: unknown, height: unknown): string | null {
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height)) {
    return "width and height must be whole numbers";
  }
  if (width < 1 || height < 1) return "width and height must be at least 1";
  if (width > MAX_SIDE || height > MAX_SIDE) return `width and height must be at most ${MAX_SIDE}`;
  if (width * height > MAX_CELLS) return `at most ${MAX_CELLS.toLocaleString("en")} cells (got ${width}x${height})`;
  return null;
}

export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "scene";
}

/** Download the world as a pretty-printed scene file. */
export function downloadScene(world: World, name: string): string {
  const scene = saveScene(world, { name });
  const text = JSON.stringify(scene, null, 2);
  const file = `${slug(name)}-t${world.tick}.json`;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return file;
}

/** Read and parse a JSON file. Throws with a readable message. */
export async function readJsonFile(file: File): Promise<unknown> {
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    throw new Error(`could not read ${file.name}`, { cause: e });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(`${file.name} is not valid JSON (${e instanceof Error ? e.message : String(e)})`, { cause: e });
  }
}

/** Open the browser's file picker for one .json file. */
export function pickFile(onFile: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  });
  input.click();
}

/** Accept a dropped file on an element (highlighted while dragging over it). */
export function acceptDrops(target: HTMLElement, onFile: (file: File) => void): void {
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  target.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    target.classList.add("drop");
  });
  target.addEventListener("dragleave", (e) => {
    if (e.target === target) target.classList.remove("drop");
  });
  target.addEventListener("drop", (e) => {
    target.classList.remove("drop");
    if (!hasFiles(e)) return;
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f) onFile(f);
  });
}
