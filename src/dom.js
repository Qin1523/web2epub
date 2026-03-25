import { JSDOM, VirtualConsole } from "jsdom";

export function createSilentJSDOM(html, options = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", () => {});
  virtualConsole.on("jsdomError", () => {});

  return new JSDOM(html, {
    ...options,
    virtualConsole,
  });
}
