import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import yazl from "yazl";

import { escapeXml } from "./utils.js";
import { prepareChapterToc } from "./toc.js";

const BOOK_CSS = `
body {
  font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
  line-height: 1.6;
  margin: 5%;
  color: #1f1f1f;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.25;
  margin: 1.4em 0 0.6em;
}
p, li, blockquote, pre, table, figure {
  margin: 0 0 1em;
}
blockquote {
  border-left: 3px solid #d4d4d4;
  margin-left: 0;
  padding-left: 1em;
  color: #4a4a4a;
}
pre {
  background: #f6f6f6;
  padding: 0.85em;
  overflow-x: auto;
  white-space: pre-wrap;
}
code {
  font-family: "SFMono-Regular", Consolas, monospace;
}
img {
  display: block;
  margin: 1em auto;
  max-width: 100%;
  height: auto;
}
figure {
  text-align: center;
}
figcaption {
  color: #666;
  font-size: 0.9em;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.95em;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.5em;
  vertical-align: top;
}
.source-note {
  margin-top: 2em;
  font-size: 0.9em;
  color: #666;
}
`.trim();

function chapterDocument(title, content, sourceUrl, language) {
  const sourceBlock = sourceUrl
    ? `<p class="source-note">Source: <a href="${escapeXml(sourceUrl)}">${escapeXml(sourceUrl)}</a></p>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language || "en")}">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="../Styles/book.css" />
  </head>
  <body>
    <article>
      <h1 id="chapter-title">${escapeXml(title)}</h1>
      ${content}
      ${sourceBlock}
    </article>
  </body>
</html>`;
}

function renderNavItems(items) {
  return items
    .map((item) => {
      const children = item.children?.length ? `<ol>${renderNavItems(item.children)}</ol>` : "";
      return `<li><a href="${escapeXml(item.href)}">${escapeXml(item.title)}</a>${children}</li>`;
    })
    .join("");
}

function navDocument(bookTitle, navItems) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>${escapeXml(bookTitle)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${escapeXml(bookTitle)}</h1>
      <ol>${renderNavItems(navItems)}</ol>
    </nav>
  </body>
</html>`;
}

function maxDepth(items, depth = 1) {
  if (!items.length) {
    return depth;
  }

  return Math.max(...items.map((item) => maxDepth(item.children || [], depth + 1)));
}

function renderNcxItems(items, state) {
  return items
    .map((item) => {
      const playOrder = state.value;
      state.value += 1;
      const children = item.children?.length ? `\n${renderNcxItems(item.children, state)}\n` : "";
      return `    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${escapeXml(item.title)}</text></navLabel>
      <content src="${escapeXml(item.href)}" />${children}    </navPoint>`;
    })
    .join("\n");
}

function ncxDocument(bookTitle, identifier, navItems) {
  const entries = renderNcxItems(navItems, { value: 1 });

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}" />
    <meta name="dtb:depth" content="${String(maxDepth(navItems, 0) || 1)}" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(bookTitle)}</text></docTitle>
  <navMap>
${entries}
  </navMap>
</ncx>`;
}

function contentOpf(metadata, manifestItems, spineItems, coverAsset) {
  const metaDescription = metadata.description
    ? `    <dc:description>${escapeXml(metadata.description)}</dc:description>\n`
    : "";
  const metaDate = metadata.date ? `    <dc:date>${escapeXml(metadata.date)}</dc:date>\n` : "";
  const metaPublisher = metadata.publisher
    ? `    <dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>\n`
    : "";
  const coverMeta = coverAsset ? `    <meta name="cover" content="${coverAsset.id}" />\n` : "";

  const manifest = manifestItems
    .map((item) => {
      const properties = item.properties ? ` properties="${item.properties}"` : "";
      return `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${properties} />`;
    })
    .join("\n");

  const spine = spineItems
    .map((item) => `    <itemref idref="${item.idref}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" unique-identifier="pub-id" xmlns="http://www.idpf.org/2007/opf" xml:lang="${escapeXml(
    metadata.language,
  )}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(metadata.identifier)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:language>${escapeXml(metadata.language)}</dc:language>
    <dc:creator>${escapeXml(metadata.author || "Unknown")}</dc:creator>
${metaDescription}${metaDate}${metaPublisher}${coverMeta}    <meta property="dcterms:modified">${escapeXml(
    metadata.modified,
  )}</meta>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`;
}

function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
}

function coverPageDocument(coverAsset, bookTitle) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeXml(bookTitle)}</title>
    <link rel="stylesheet" type="text/css" href="../Styles/book.css" />
  </head>
  <body>
    <section>
      <img src="../${escapeXml(coverAsset.href)}" alt="${escapeXml(bookTitle)}" />
    </section>
  </body>
</html>`;
}

export async function buildEpub(book, outputPath) {
  const identifier = book.identifier || `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const zipfile = new yazl.ZipFile();
  const manifestItems = [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
    { id: "css", href: "Styles/book.css", mediaType: "text/css" },
  ];
  const spineItems = [];
  const navItems = [];

  zipfile.addBuffer(Buffer.from("application/epub+zip"), "mimetype", { compress: false });
  zipfile.addBuffer(Buffer.from(containerXml(), "utf8"), "META-INF/container.xml");
  zipfile.addBuffer(Buffer.from(BOOK_CSS, "utf8"), "OEBPS/Styles/book.css");

  if (book.coverAsset) {
    manifestItems.push({
      id: book.coverAsset.id,
      href: book.coverAsset.href,
      mediaType: book.coverAsset.mediaType,
      properties: "cover-image",
    });
    manifestItems.push({
      id: "cover-page",
      href: "Text/cover.xhtml",
      mediaType: "application/xhtml+xml",
    });
    spineItems.push({ idref: "cover-page" });
    navItems.push({ title: "Cover", href: "Text/cover.xhtml" });
    zipfile.addBuffer(book.coverAsset.data, book.coverAsset.epubPath);
    zipfile.addBuffer(
      Buffer.from(coverPageDocument(book.coverAsset, book.title), "utf8"),
      "OEBPS/Text/cover.xhtml",
    );
  }

  book.chapters.forEach((chapter, index) => {
    const chapterId = `chapter-${index + 1}`;
    const chapterHref = `Text/chapter-${String(index + 1).padStart(3, "0")}.xhtml`;
    const preparedChapter = prepareChapterToc(chapter, chapterHref, book.mode);
    manifestItems.push({
      id: chapterId,
      href: chapterHref,
      mediaType: "application/xhtml+xml",
    });
    spineItems.push({ idref: chapterId });
    navItems.push(preparedChapter.tocItem);
    zipfile.addBuffer(
      Buffer.from(
        chapterDocument(chapter.title, preparedChapter.content, chapter.sourceUrl, book.language),
        "utf8",
      ),
      `OEBPS/${chapterHref}`,
    );
  });

  for (const asset of book.assets) {
    manifestItems.push({
      id: asset.id,
      href: asset.href,
      mediaType: asset.mediaType,
    });
    zipfile.addBuffer(asset.data, asset.epubPath);
  }

  zipfile.addBuffer(Buffer.from(navDocument(book.title, navItems), "utf8"), "OEBPS/nav.xhtml");
  zipfile.addBuffer(
    Buffer.from(ncxDocument(book.title, identifier, navItems), "utf8"),
    "OEBPS/toc.ncx",
  );
  zipfile.addBuffer(
    Buffer.from(
      contentOpf(
        {
          identifier,
          title: book.title,
          author: book.author,
          language: book.language,
          description: book.description,
          date: book.date,
          publisher: book.publisher,
          modified,
        },
        manifestItems,
        spineItems,
        book.coverAsset,
      ),
      "utf8",
    ),
    "OEBPS/content.opf",
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const stream = zipfile.outputStream.pipe(createWriteStream(outputPath));
    stream.on("close", resolve);
    stream.on("error", reject);
    zipfile.end();
  });
}
