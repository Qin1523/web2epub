import fs from "node:fs/promises";
import path from "node:path";

import { isUrl, toArray } from "../utils.js";

const BUILTIN_PROFILES = {
  generic: {
    name: "generic",
    removeSelectors: [
      "header",
      "footer",
      "nav",
      "aside",
      ".sidebar",
      ".recommend",
      ".recommendations",
      ".comments",
      ".comment",
      ".social-share",
      ".share",
      ".ad",
      ".ads",
      ".advertisement",
      ".newsletter",
      ".related-posts",
      ".toc-widget",
    ],
  },
  wechat: {
    name: "wechat",
    match: ["mp.weixin.qq.com"],
    contentSelector: "#js_content",
    titleSelector: "#activity-name",
    authorSelector: "#js_name",
    removeSelectors: [".wx_profile_card", ".reward_qrcode", ".original_panel_tool"],
  },
  substack: {
    name: "substack",
    match: ["substack.com"],
    contentSelector: ".body.markup",
    titleSelector: "h1.post-title",
    authorSelector: ".publication-header__author",
  },
};

export async function resolveSiteProfile(siteProfile, sourceUrl, logger) {
  if (siteProfile) {
    const maybePath = path.resolve(siteProfile);
    try {
      const content = await fs.readFile(maybePath, "utf8");
      const profile = JSON.parse(content);
      profile.name ||= path.basename(maybePath, path.extname(maybePath));
      return profile;
    } catch (error) {
      if (BUILTIN_PROFILES[siteProfile]) {
        return BUILTIN_PROFILES[siteProfile];
      }

      throw new Error(`Unknown site profile: ${siteProfile}`);
    }
  }

  if (!isUrl(sourceUrl)) {
    return BUILTIN_PROFILES.generic;
  }

  const hostname = new URL(sourceUrl).hostname;
  const matched = Object.values(BUILTIN_PROFILES).find((profile) =>
    toArray(profile.match).some((entry) => hostname === entry || hostname.endsWith(`.${entry}`)),
  );

  if (matched && matched.name !== "generic") {
    logger?.debug(`Matched built-in profile "${matched.name}" for ${hostname}`);
    return matched;
  }

  return BUILTIN_PROFILES.generic;
}

export function applyProfileCleanup(document, profile, logger) {
  for (const selector of toArray(profile?.removeSelectors)) {
    try {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    } catch (error) {
      logger?.warn(`Invalid remove selector "${selector}": ${error.message}`);
    }
  }
}
