import fs from "node:fs/promises";
import path from "node:path";

import { isUrl } from "./utils.js";

function isListPath(value) {
  return [".txt", ".list"].includes(path.extname(value).toLowerCase());
}

async function expandEntry(entry, output, baseDir = process.cwd()) {
  if (isUrl(entry)) {
    output.push({ kind: "url", value: entry });
    return;
  }

  const resolved = path.resolve(baseDir, entry);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats) {
    throw new Error(`Input not found: ${entry}`);
  }

  if (stats.isDirectory()) {
    throw new Error(`Directory input is not supported yet: ${entry}`);
  }

  if (isListPath(resolved)) {
    const list = await fs.readFile(resolved, "utf8");
    const entries = list
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const item of entries) {
      await expandEntry(item, output, path.dirname(resolved));
    }
    return;
  }

  throw new Error(`Unsupported input type: ${entry}. Only URL(s) or URL list files are supported`);
}

export async function resolveInputs(positionalInputs, inputOption) {
  const pending = [];
  const entries = [...positionalInputs];
  if (inputOption) {
    entries.push(inputOption);
  }

  if (entries.length === 0) {
    throw new Error("No input provided. Pass URL(s) or --input urls.txt");
  }

  for (const entry of entries) {
    await expandEntry(entry, pending);
  }

  return pending;
}
