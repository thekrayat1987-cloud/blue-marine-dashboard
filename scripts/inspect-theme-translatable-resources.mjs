#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-10"}/graphql.json`;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
async function gql(q, v = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query: q, variables: v }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Try different resource types
const TYPES = [
  "ONLINE_STORE_THEME",
  "ONLINE_STORE_THEME_APP_EMBED",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
];

for (const type of TYPES) {
  console.log(`\n━━━ ${type} ━━━`);
  try {
    const d = await gql(`query($type: TranslatableResourceType!){
      translatableResources(first: 5, resourceType: $type) {
        edges { node {
          resourceId
          translatableContent { key value digest locale }
        }}
      }
    }`, { type });
    const edges = d.translatableResources?.edges || [];
    console.log(`  ${edges.length} resource(s)`);
    for (const e of edges.slice(0, 3)) {
      console.log(`  resource: ${e.node.resourceId}`);
      const arabicKeys = e.node.translatableContent.filter(c =>
        c.value && c.value.includes("عرض الكل")
      );
      if (arabicKeys.length) {
        console.log(`    🎯 FOUND ${arabicKeys.length} 'عرض الكل' here:`);
        for (const k of arabicKeys) console.log(`       key=${k.key} digest=${k.digest?.slice(0, 16)}…`);
      } else {
        console.log(`    (no 'عرض الكل' keys in first content; total keys: ${e.node.translatableContent.length})`);
        // Sample 3 keys
        for (const c of e.node.translatableContent.slice(0, 2)) {
          console.log(`       sample: ${c.key} = "${c.value?.slice(0, 40)}"`);
        }
      }
    }
  } catch (e) {
    console.log(`  ❌ ${e.message?.slice(0, 200)}`);
  }
}
