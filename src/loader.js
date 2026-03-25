import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import iconv from "iconv-lite";
import jschardet from "jschardet";

import { asFileUrl, inferMimeFromPath, isFileUrl, isUrl, truncate } from "./utils.js";

export function normalizeImageUrl(url) {
  return url
    .replaceAll("f_auto", "f_jpg")
    .replaceAll("format=auto", "format=jpg");
}

function extractCharset(contentType) {
  if (!contentType) {
    return null;
  }

  const match = contentType.match(/charset=([^;]+)/i);
  return match?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}

function decodeBuffer(buffer, contentType) {
  const declaredCharset = extractCharset(contentType);
  if (declaredCharset && iconv.encodingExists(declaredCharset)) {
    return iconv.decode(buffer, declaredCharset);
  }

  const detection = jschardet.detect(buffer);
  if (detection.encoding && iconv.encodingExists(detection.encoding)) {
    return iconv.decode(buffer, detection.encoding);
  }

  return buffer.toString("utf8");
}

async function fetchWithRetry(url, options, logger, responseType = "text") {
  let lastError;
  for (let attempt = 0; attempt <= options.retry; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);
    try {
      logger?.debug(`Fetching ${truncate(url)} (attempt ${attempt + 1}/${options.retry + 1})`);
      const response = await fetch(url, {
        headers: {
          "user-agent": options.userAgent,
          ...(options.headers || {}),
        },
        redirect: "follow",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      if (responseType === "buffer") {
        const arrayBuffer = await response.arrayBuffer();
        return {
          url: response.url || url,
          contentType: response.headers.get("content-type"),
          body: Buffer.from(arrayBuffer),
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        url: response.url || url,
        contentType: response.headers.get("content-type"),
        body: decodeBuffer(buffer, response.headers.get("content-type")),
      };
    } catch (error) {
      lastError = error;
      logger?.warn(`Fetch failed for ${truncate(url)}: ${error.message}`);
      if (attempt === options.retry) {
        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

export async function loadTextSource(source, options, logger) {
  if (source.kind !== "url") {
    throw new Error("Only remote URL sources are supported");
  }

  const response = await fetchWithRetry(source.value, options, logger, "text");
  return {
    kind: "url",
    sourceUrl: response.url,
    baseUrl: response.url,
    html: response.body,
  };
}

export async function loadBinaryResource(resourceUrl, options, logger) {
  if (!resourceUrl) {
    throw new Error("Resource URL is empty");
  }

  if (resourceUrl.startsWith("data:")) {
    const [header, data] = resourceUrl.split(",", 2);
    const mime = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
    const isBase64 = /;base64$/i.test(header);
    return {
      sourceUrl: resourceUrl,
      mime,
      buffer: isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data)),
    };
  }

  if (isUrl(resourceUrl)) {
    const normalizedUrl = normalizeImageUrl(resourceUrl);
    const response = await fetchWithRetry(normalizedUrl, options, logger, "buffer");
    return {
      sourceUrl: response.url,
      mime: response.contentType?.split(";")[0] || inferMimeFromPath(normalizedUrl),
      buffer: response.body,
    };
  }

  const fileUrl = isFileUrl(resourceUrl) ? resourceUrl : asFileUrl(resourceUrl);
  const absolutePath = fileURLToPath(fileUrl);
  const buffer = await fs.readFile(absolutePath);

  return {
    sourceUrl: fileUrl,
    mime: inferMimeFromPath(absolutePath),
    buffer,
  };
}
