import { createSilentJSDOM } from "./dom.js";
import { serializeDomChildrenToXhtml, slugFromTitle } from "./utils.js";

function normalizeHeadingText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function isValidHeadingText(value) {
  const normalized = normalizeHeadingText(value);
  const meaningful = normalized.replace(/[\p{P}\p{S}\s]+/gu, "");
  return meaningful.length >= 2;
}

function createUniqueAnchorId(text, seenIds, fallback = "section") {
  const base = `sec-${slugFromTitle(text, fallback)}`;
  let candidate = base;
  let suffix = 2;
  while (seenIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seenIds.add(candidate);
  return candidate;
}

function shouldSkipDuplicateH1(heading, allH1Count, chapterTitle) {
  return (
    heading.tagName.toLowerCase() === "h1" &&
    allH1Count === 1 &&
    normalizeHeadingText(heading.textContent || "") === normalizeHeadingText(chapterTitle)
  );
}

export function prepareChapterToc(chapter, chapterHref, mode) {
  const dom = createSilentJSDOM(`<body>${chapter.content}</body>`);
  const { document } = dom.window;
  const body = document.body;
  const headings = [...body.querySelectorAll("h1, h2, h3")];
  const allH1Count = headings.filter((heading) => heading.tagName.toLowerCase() === "h1").length;
  const seenIds = new Set(["chapter-title"]);
  const rootItem = {
    title: chapter.title,
    href: `${chapterHref}#chapter-title`,
    children: [],
  };

  let lastSecondLevelItem = null;

  for (const heading of headings) {
    const tag = heading.tagName.toLowerCase();
    const text = normalizeHeadingText(heading.textContent || "");

    if (!isValidHeadingText(text) || shouldSkipDuplicateH1(heading, allH1Count, chapter.title)) {
      continue;
    }

    if (mode === "merge" && !["h2", "h3"].includes(tag)) {
      continue;
    }

    if (mode === "single" && !["h1", "h2", "h3"].includes(tag)) {
      continue;
    }

    const anchorId = createUniqueAnchorId(text, seenIds, tag);
    heading.setAttribute("id", anchorId);

    const item = {
      title: text,
      href: `${chapterHref}#${anchorId}`,
      children: [],
    };

    const isSecondLevel =
      mode === "single" ? ["h1", "h2"].includes(tag) : tag === "h2";

    if (isSecondLevel) {
      rootItem.children.push(item);
      lastSecondLevelItem = item;
      continue;
    }

    if (tag === "h3") {
      (lastSecondLevelItem || rootItem).children.push(item);
    }
  }

  return {
    content: serializeDomChildrenToXhtml(body),
    tocItem: rootItem,
  };
}
