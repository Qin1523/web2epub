import sharp from "sharp";

import { IMAGE_COMPRESSION_RULES } from "./defaults.js";
import { createSilentJSDOM } from "./dom.js";
import { loadBinaryResource } from "./loader.js";
import { serializeDomChildrenToXhtml, truncate } from "./utils.js";

function createFallbackSvg(label) {
  const safeLabel = String(label || "Image unavailable")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f5f2eb" />
  <rect x="70" y="70" width="1060" height="660" rx="28" fill="#ffffff" stroke="#ddd6ca" stroke-width="4" />
  <text x="120" y="220" fill="#2b2b2b" font-family="Arial, sans-serif" font-size="44">Image unavailable</text>
  <text x="120" y="300" fill="#6a6a6a" font-family="Arial, sans-serif" font-size="28">${safeLabel}</text>
</svg>`;
}

async function createFallbackJpeg(label, width, quality) {
  return sharp(Buffer.from(createFallbackSvg(label)))
    .resize({ width, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true, progressive: true })
    .toBuffer();
}

async function encodeAsJpeg(buffer, width, quality, fallbackLabel) {
  try {
    return await sharp(buffer, { animated: false, failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer();
  } catch {
    return createFallbackJpeg(fallbackLabel, width, quality);
  }
}

function buildAssetRecord(sequence, label) {
  const filename = `img-${String(sequence).padStart(3, "0")}.jpg`;
  return {
    id: `image-${sequence}`,
    href: `Images/${filename}`,
    epubPath: `OEBPS/Images/${filename}`,
    mediaType: "image/jpeg",
    originalBuffer: null,
    fallbackLabel: label,
    data: null,
  };
}

function buildCoverRecord(label) {
  return {
    id: "cover-image",
    href: "Images/cover.jpg",
    epubPath: "OEBPS/Images/cover.jpg",
    mediaType: "image/jpeg",
    originalBuffer: null,
    fallbackLabel: label,
    data: null,
  };
}

export class ImageAssetManager {
  constructor(options, logger) {
    this.options = options;
    this.logger = logger;
    this.assets = [];
    this.coverAsset = null;
    this.cache = new Map();
    this.counter = 1;
  }

  async embedInHtml(html) {
    const dom = createSilentJSDOM(`<body>${html}</body>`);
    const { document } = dom.window;
    const images = [...document.querySelectorAll("img")];

    for (const image of images) {
      const src = image.getAttribute("src") || "";
      const alt = image.getAttribute("alt")?.trim() || "";
      const cacheKey = src || `missing:${this.counter}`;
      let asset = this.cache.get(cacheKey);

      if (!asset) {
        asset = await this.createAsset(src, alt);
        this.cache.set(cacheKey, asset);
      }

      image.setAttribute("src", `../${asset.href}`);
    }

    return serializeDomChildrenToXhtml(document.body);
  }

  async createAsset(source, alt) {
    const label = truncate(alt || source || `Image ${this.counter}`, 80);
    const asset = buildAssetRecord(this.counter, label);
    this.counter += 1;

    try {
      if (source) {
        const resource = await loadBinaryResource(source, this.options, this.logger);
        asset.originalBuffer = resource.buffer;
      }
    } catch (error) {
      this.logger?.warn(`Image load failed for ${truncate(source)}: ${error.message}`);
    }

    this.assets.push(asset);
    return asset;
  }

  async registerCover(coverPath) {
    if (!coverPath) {
      this.coverAsset = null;
      return null;
    }

    const cover = buildCoverRecord("Cover image");
    try {
      const resource = await loadBinaryResource(coverPath, this.options, this.logger);
      cover.originalBuffer = resource.buffer;
    } catch (error) {
      this.logger?.warn(`Cover load failed for ${truncate(coverPath)}: ${error.message}`);
    }

    this.coverAsset = cover;
    return cover;
  }

  async recompressAll(width, quality) {
    for (const asset of this.assets) {
      asset.data = await encodeAsJpeg(asset.originalBuffer, width, quality, asset.fallbackLabel);
    }

    if (this.coverAsset) {
      this.coverAsset.data = await encodeAsJpeg(
        this.coverAsset.originalBuffer,
        width,
        quality,
        this.coverAsset.fallbackLabel,
      );
    }

    return this.totalBytes();
  }

  nextCompressionStep(currentWidth, currentQuality) {
    return {
      width: Math.max(
        IMAGE_COMPRESSION_RULES.minWidth,
        currentWidth - IMAGE_COMPRESSION_RULES.widthStep,
      ),
      quality: Math.max(
        IMAGE_COMPRESSION_RULES.minQuality,
        currentQuality - IMAGE_COMPRESSION_RULES.qualityStep,
      ),
    };
  }

  hasReachedMinimum(width, quality) {
    return (
      width === IMAGE_COMPRESSION_RULES.minWidth &&
      quality === IMAGE_COMPRESSION_RULES.minQuality
    );
  }

  getManifestItems() {
    return this.assets.map(({ id, href, epubPath, mediaType, data }) => ({
      id,
      href,
      epubPath,
      mediaType,
      data,
    }));
  }

  getCoverAsset() {
    if (!this.coverAsset) {
      return null;
    }

    const { id, href, epubPath, mediaType, data } = this.coverAsset;
    return {
      id,
      href,
      epubPath,
      mediaType,
      data,
    };
  }

  totalBytes() {
    return [...this.assets, this.coverAsset]
      .filter(Boolean)
      .reduce((sum, asset) => sum + (asset.data?.length || 0), 0);
  }
}
