#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const THEME_ID = "182480240940";

// Fetch templates/index.json
const r = await fetch(`https://${STORE}/admin/api/${VERSION}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`, {
  headers: { "X-Shopify-Access-Token": TOKEN },
});
const content = (await r.json()).asset?.value;
writeFileSync("/tmp/templates-index.json", content);
console.log(`Saved to /tmp/templates-index.json (${content.length} bytes)`);

// Parse and find "عرض الكل"
const data = JSON.parse(content);
const matches = [];
function walk(obj, path) {
  if (typeof obj !== "object" || obj === null) return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.includes("عرض الكل")) {
      matches.push({ path: [...path, k].join("."), value: v });
    } else {
      walk(v, [...path, k]);
    }
  }
}
walk(data, []);
console.log(`\nFound ${matches.length} occurrences of "عرض الكل":`);
for (const m of matches) {
  console.log(`  ${m.path}`);
  console.log(`    = "${m.value}"`);
}

// Also list the section IDs that contain these
console.log("\nSection IDs:");
for (const m of matches) {
  // path like "sections.section_id.settings.collection_swimlane.blocks.block_id.settings.label"
  const segs = m.path.split(".");
  const sectionId = segs[1];
  const section = data.sections?.[sectionId];
  if (section) console.log(`  ${sectionId}: type=${section.type}`);
}
