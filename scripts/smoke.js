import http from "node:http";
import { spawn } from "node:child_process";

import sharp from "sharp";

function buildArticle(title, imagePath) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="description" content="Smoke test article for web2epub." />
    <style>
      .bad { color: ; }
      @media screen { .broken {
    </style>
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      <p>Smoke test content served over HTTP.</p>
      <h2>特性</h2>
      <p>目录、图片压缩和抓取逻辑都从网页入口验证。</p>
      <h3>图片处理</h3>
      <p>所有图片都会重新编码为 JPEG。</p>
      <figure>
        <img src="${imagePath}" alt="Smoke image" />
        <figcaption>Served over HTTP for the smoke test.</figcaption>
      </figure>
    </article>
  </body>
</html>`;
}

async function createImageBuffer() {
  return sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: 235, g: 229, b: 218 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
            <rect x="80" y="80" width="1120" height="560" rx="32" fill="#ffffff" />
            <text x="140" y="240" font-size="52" font-family="Arial" fill="#2b2b2b">web2epub smoke test</text>
            <text x="140" y="320" font-size="30" font-family="Arial" fill="#666">served over HTTP</text>
          </svg>`,
        ),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function main() {
  const imageBuffer = await createImageBuffer();

  const server = http.createServer((request, response) => {
    if (!request.url) {
      response.writeHead(404).end();
      return;
    }

    if (request.url.startsWith("/image.jpg")) {
      response.writeHead(200, { "content-type": "image/jpeg" });
      response.end(imageBuffer);
      return;
    }

    if (request.url === "/article") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(buildArticle("网页转 EPUB Smoke", "/image.jpg?format=auto&f_auto,q_auto"));
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/article`;

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        "node",
        [
          "./src/cli.js",
          url,
          "--title",
          "网页转 EPUB 示例",
          "--author",
          "Codex",
          "--output",
          "./output/sample.epub",
          "--save-intermediate",
        ],
        { stdio: "inherit" },
      );

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Smoke command exited with code ${code}`));
      });
      child.on("error", reject);
    });
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
