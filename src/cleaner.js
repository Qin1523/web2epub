import sanitizeHtml from "sanitize-html";

import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS } from "./defaults.js";
import { createSilentJSDOM } from "./dom.js";
import { resolveUrl, serializeDomChildrenToXhtml, stripTrackingParams } from "./utils.js";

function normalizeTextNodes(node, inPre = false) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === child.TEXT_NODE && !inPre) {
      child.nodeValue = child.nodeValue.replace(/\u00a0/g, " ").replace(/[ \t]{2,}/g, " ");
    } else if (child.nodeType === child.ELEMENT_NODE) {
      const nextInPre = inPre || child.tagName.toLowerCase() === "pre";
      normalizeTextNodes(child, nextInPre);
    }
  }
}

function isEmptyElement(node) {
  if (["img", "hr", "br"].includes(node.tagName.toLowerCase())) {
    return false;
  }

  const text = node.textContent?.replace(/\s+/g, "") ?? "";
  return !text && !node.querySelector("img, table, pre, code, blockquote");
}

function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  node.remove();
}

function collapseTopLevelWrappers(body) {
  const wrapperTags = new Set(["div", "section", "article", "main"]);

  while (body.children.length === 1) {
    const child = body.firstElementChild;
    if (!child || !wrapperTags.has(child.tagName.toLowerCase())) {
      break;
    }
    if ([...body.childNodes].some((node) => node.nodeType === node.TEXT_NODE && node.nodeValue?.trim())) {
      break;
    }
    child.replaceWith(...child.childNodes);
  }
}

export function cleanExtractedHtml(html, context, options, logger) {
  const sanitized = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto", "file", "data"],
    disallowedTagsMode: "discard",
  });

  const dom = createSilentJSDOM(`<body>${sanitized}</body>`);
  const { document } = dom.window;
  const body = document.body;

  normalizeTextNodes(body);

  body.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) {
      unwrapNode(anchor);
      return;
    }

    const resolved = resolveUrl(href, context.baseUrl);
    if (!resolved) {
      unwrapNode(anchor);
      return;
    }

    if (!options.preserveLinks) {
      unwrapNode(anchor);
      return;
    }

    anchor.setAttribute("href", stripTrackingParams(resolved));
  });

  body.querySelectorAll("img").forEach((image) => {
    const src = image.getAttribute("src");
    const resolved = resolveUrl(src, context.baseUrl);
    if (resolved) {
      image.setAttribute("src", resolved);
    }
    image.removeAttribute("srcset");
    image.removeAttribute("loading");
  });

  if (options.cleanLevel === "aggressive") {
    body.querySelectorAll("span").forEach((span) => {
      if (!span.textContent?.trim()) {
        span.remove();
      } else {
        unwrapNode(span);
      }
    });
  }

  body.querySelectorAll("*").forEach((node) => {
    if (isEmptyElement(node)) {
      node.remove();
    }
  });

  collapseTopLevelWrappers(body);

  return serializeDomChildrenToXhtml(body);
}
