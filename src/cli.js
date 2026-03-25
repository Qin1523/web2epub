#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import { DEFAULT_OPTIONS, IMAGE_COMPRESSION_RULES } from "./defaults.js";
import { buildEpub } from "./epub.js";
import { extractReadableContent } from "./extractor.js";
import { ImageAssetManager } from "./images.js";
import { resolveInputs } from "./input.js";
import { loadTextSource } from "./loader.js";
import { createLogger } from "./logger.js";
import { resolveSiteProfile } from "./profiles/index.js";
import { safeFilename } from "./utils.js";

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function ensureUniqueOutputPath(targetPath) {
  const absolute = path.resolve(targetPath);
  const ext = path.extname(absolute) || ".epub";
  const base = ext ? absolute.slice(0, -ext.length) : absolute;

  try {
    await fs.access(absolute);
    return `${base}-${Date.now()}${ext}`;
  } catch {
    return absolute.endsWith(".epub") ? absolute : `${absolute}.epub`;
  }
}

async function resolveOutputPath(outputOption, bookTitle) {
  const defaultPath = path.resolve("output", `${safeFilename(bookTitle)}.epub`);

  if (!outputOption) {
    return ensureUniqueOutputPath(defaultPath);
  }

  const absolute = path.resolve(outputOption);
  if (absolute.toLowerCase().endsWith(".epub")) {
    return ensureUniqueOutputPath(absolute);
  }

  return ensureUniqueOutputPath(path.join(absolute, `${safeFilename(bookTitle)}.epub`));
}

async function maybeSaveIntermediate(basePath, chapterIndex, extracted) {
  await fs.mkdir(basePath, { recursive: true });
  const prefix = String(chapterIndex + 1).padStart(3, "0");
  await fs.writeFile(path.join(basePath, `${prefix}-raw.html`), extracted.rawHtml, "utf8");
  await fs.writeFile(path.join(basePath, `${prefix}-clean.xhtml`), extracted.cleanedHtml, "utf8");
}

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)}KB`;
}

async function main() {
  const program = new Command();

  program
    .name("web2epub")
    .description("Convert web pages into readable EPUB files")
    .argument("[sources...]", "URL(s)")
    .option("-i, --input <path>", "Path to a URL list file")
    .option("--mode <single|merge>", "Output mode")
    .option("--title <text>", "Book title override")
    .option("--author <text>", "Book author override")
    .option("--language <code>", "Language metadata")
    .option("--description <text>", "Book description")
    .option("--cover <path>", "Cover image path")
    .option("-o, --output <path>", "Output EPUB path or directory")
    .option("--timeout <ms>", "Network timeout", (value) => parseInteger(value, DEFAULT_OPTIONS.timeout))
    .option("--retry <count>", "Retry count", (value) => parseInteger(value, DEFAULT_OPTIONS.retry))
    .option("--no-preserve-links", "Strip hyperlinks from output")
    .option("--clean-level <level>", "Cleaning level: light|balanced|aggressive")
    .option("--site-profile <name-or-path>", "Built-in profile name or JSON file path")
    .option("--user-agent <ua>", "Custom user agent")
    .option("--save-intermediate", "Save raw and cleaned intermediate files")
    .option("--debug", "Enable debug logging")
    .parse(process.argv);

  const rawOptions = program.opts();
  const options = { ...DEFAULT_OPTIONS, ...rawOptions };
  const logger = createLogger({ debug: options.debug });
  const positionalInputs = program.args;

  const sources = await resolveInputs(positionalInputs, options.input);
  const mode = rawOptions.mode || (sources.length > 1 ? "merge" : "single");
  if (!["single", "merge"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  logger.info(`Resolved ${sources.length} input source(s)`);

  const imageAssets = new ImageAssetManager(options, logger);
  const chapters = [];

  for (const [index, source] of sources.entries()) {
    logger.info(`Processing ${source.value}`);
    const sourceData = await loadTextSource(source, options, logger);
    const profile = await resolveSiteProfile(options.siteProfile, sourceData.sourceUrl, logger);
    const extracted = extractReadableContent(sourceData, profile, options, logger);
    const chapterHtml = await imageAssets.embedInHtml(extracted.cleanedHtml, sourceData);

    chapters.push({
      title: extracted.title || `Chapter ${index + 1}`,
      sourceUrl: sourceData.kind === "url" ? sourceData.sourceUrl : undefined,
      content: chapterHtml,
      author: extracted.author,
      description: extracted.description,
      language: extracted.language,
      publishedAt: extracted.publishedAt,
      siteName: extracted.siteName,
    });

    if (options.saveIntermediate) {
      const folderName = safeFilename(options.title || chapters[0].title || "debug");
      await maybeSaveIntermediate(path.resolve("output", `${folderName}-debug`), index, extracted);
    }
  }

  const bookTitle =
    options.title ||
    (mode === "single" && chapters.length === 1 ? chapters[0].title : `Web Collection ${new Date().toISOString().slice(0, 10)}`);
  const outputPath = await resolveOutputPath(options.output, bookTitle);
  await imageAssets.registerCover(options.cover);

  let width = IMAGE_COMPRESSION_RULES.initialWidth;
  let quality = IMAGE_COMPRESSION_RULES.initialQuality;
  let round = 1;
  let finalEpubSize = 0;

  while (true) {
    const totalImageBytes = await imageAssets.recompressAll(width, quality);

    await buildEpub(
      {
        title: bookTitle,
        author: options.author || chapters.map((chapter) => chapter.author).find(Boolean) || "Unknown",
        language:
          rawOptions.language || chapters.map((chapter) => chapter.language).find(Boolean) || DEFAULT_OPTIONS.language,
        description:
          options.description || chapters.map((chapter) => chapter.description).find(Boolean) || `Generated from ${sources.length} source(s)`,
        date: chapters.map((chapter) => chapter.publishedAt).find(Boolean) || new Date().toISOString().slice(0, 10),
        chapters,
        assets: imageAssets.getManifestItems(),
        coverAsset: imageAssets.getCoverAsset(),
        mode,
      },
      outputPath,
    );

    const { size: epubSize } = await fs.stat(outputPath);
    finalEpubSize = epubSize;
    logger.info(
      `Compression round ${round}:\n       width=${width}, quality=${quality}\n       images=${formatKb(
        totalImageBytes,
      )} (compressed)\n       epub=${formatKb(epubSize)} (final, incl. text)`,
    );

    if (epubSize <= IMAGE_COMPRESSION_RULES.bookSizeLimit) {
      logger.info("Size within 5MB, no further compression needed");
      break;
    }

    if (imageAssets.hasReachedMinimum(width, quality)) {
      logger.warn(
        `EPUB is still ${formatKb(epubSize)} at the minimum image settings; keeping the closest result`,
      );
      break;
    }

    logger.info("Size exceeds 5MB, recompressing all images with lower settings");
    const next = imageAssets.nextCompressionStep(width, quality);
    width = next.width;
    quality = next.quality;
    round += 1;
  }

  logger.info(`Final size: ${formatKb(finalEpubSize)} (limit: 5MB)`);
  logger.info(`Compression rounds used: ${round}`);
  logger.info(`EPUB written to ${outputPath}`);
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exitCode = 1;
});
