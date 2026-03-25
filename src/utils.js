import path from "node:path";
import { pathToFileURL } from "node:url";

import { TRACKING_QUERY_KEYS } from "./defaults.js";

export function isUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isFileUrl(value) {
  try {
    return new URL(value).protocol === "file:";
  } catch {
    return false;
  }
}

export function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

export function safeFilename(value, fallback = "book") {
  const normalized = (value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || fallback;
}

export function slugFromTitle(value, fallback = "book") {
  return safeFilename(value, fallback)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-\u4e00-\u9fa5]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

export function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function stripTrackingParams(urlString) {
  try {
    const url = new URL(urlString);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return urlString;
  }
}

export function resolveUrl(value, baseUrl) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function asFileUrl(value) {
  if (!value) {
    return null;
  }

  if (isFileUrl(value)) {
    return value;
  }

  return pathToFileURL(path.resolve(value)).toString();
}

export function normalizeWhitespace(value = "") {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n");
}

export function truncate(value = "", limit = 120) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function fileExtensionFromMime(mime) {
  const mapping = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  return mapping[mime] || "bin";
}

export function serializeDomChildrenToXhtml(node) {
  return [...node.childNodes].map((child) => serializeDomNodeToXhtml(child)).join("");
}

export function serializeDomNodeToXhtml(node) {
  if (node.nodeType === node.TEXT_NODE) {
    return escapeXml(node.nodeValue ?? "");
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const attributes = [...node.attributes]
    .map((attribute) => ` ${attribute.name}="${escapeXml(attribute.value)}"`)
    .join("");

  if (tag === "img" || tag === "br" || tag === "hr") {
    return `<${tag}${attributes} />`;
  }

  const content = [...node.childNodes].map((child) => serializeDomNodeToXhtml(child)).join("");
  return `<${tag}${attributes}>${content}</${tag}>`;
}

export function inferMimeFromPath(value) {
  const ext = path.extname(value).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}
