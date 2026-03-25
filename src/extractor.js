import { Readability } from "@mozilla/readability";

import { cleanExtractedHtml } from "./cleaner.js";
import { createSilentJSDOM } from "./dom.js";
import { applyProfileCleanup } from "./profiles/index.js";
import { serializeDomChildrenToXhtml } from "./utils.js";

function textFromSelector(document, selector) {
  if (!selector) {
    return null;
  }
  return document.querySelector(selector)?.textContent?.trim() || null;
}

function extractMetadata(document, article, profile) {
  const meta = (name) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || null;
  const property = (name) =>
    document.querySelector(`meta[property="${name}"]`)?.getAttribute("content")?.trim() || null;

  return {
    title:
      textFromSelector(document, profile?.titleSelector) ||
      property("og:title") ||
      meta("twitter:title") ||
      article?.title ||
      document.title?.trim() ||
      "Untitled",
    author:
      textFromSelector(document, profile?.authorSelector) ||
      property("article:author") ||
      meta("author") ||
      article?.byline ||
      null,
    description:
      property("og:description") ||
      meta("description") ||
      article?.excerpt ||
      null,
    language:
      document.documentElement.getAttribute("lang") ||
      meta("language") ||
      null,
    publishedAt:
      property("article:published_time") ||
      document.querySelector("time")?.getAttribute("datetime") ||
      null,
    siteName: property("og:site_name") || null,
  };
}

function buildArticleFromSelector(document, profile) {
  if (!profile?.contentSelector) {
    return null;
  }

  const node = document.querySelector(profile.contentSelector);
  if (!node) {
    return null;
  }

  return {
    title: textFromSelector(document, profile.titleSelector) || document.title || "Untitled",
    byline: textFromSelector(document, profile.authorSelector) || null,
    excerpt:
      document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || null,
    content: node.innerHTML,
  };
}

function stripDuplicateLeadingHeading(html, title) {
  if (!title) {
    return html;
  }

  const dom = createSilentJSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const firstHeading = document.body.querySelector("h1, h2");
  if (firstHeading && firstHeading.textContent?.trim() === title.trim()) {
    firstHeading.remove();
  }
  return serializeDomChildrenToXhtml(document.body);
}

export function extractReadableContent(sourceData, profile, options, logger) {
  const dom = createSilentJSDOM(sourceData.html, {
    url: sourceData.baseUrl,
  });
  const { document } = dom.window;

  document.querySelectorAll("script, style, noscript, iframe, form, button").forEach((node) => {
    node.remove();
  });

  let removedNodeCount = 0;

  if (profile) {
    removedNodeCount = applyProfileCleanup(document, profile, logger);

    // 只在 profile 存在时打印
    logger.info(`[profile] matched domain: ${sourceData.sourceUrl}`);
    logger.info(`[profile] removed ${removedNodeCount} nodes`);
  }

  const profileArticle = buildArticleFromSelector(document, profile);
  const readabilityArticle =
    profileArticle ||
    new Readability(document.cloneNode(true), {
      keepClasses: false,
      nbTopCandidates: 5,
      charThreshold: 200,
    }).parse();

  const article = readabilityArticle || {
    title: document.title?.trim() || "Untitled",
    content: document.body?.innerHTML || "",
    excerpt: null,
    byline: null,
  };

  const metadata = extractMetadata(document, article, profile);
  const cleanedHtml = stripDuplicateLeadingHeading(
    cleanExtractedHtml(article.content, { baseUrl: sourceData.baseUrl }, options, logger),
    metadata.title,
  );

  return {
    sourceUrl: sourceData.sourceUrl,
    title: metadata.title,
    author: metadata.author,
    description: metadata.description,
    language: metadata.language,
    publishedAt: metadata.publishedAt,
    siteName: metadata.siteName,
    cleanedHtml,
    rawHtml: sourceData.html,
  };
}
