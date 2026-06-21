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

// One sample per distinct color
const SAMPLES = [
  { handle: "a85-sahar-dawn-daraa-bisht-set", expectEn: "ivory", expectAr: "عاجي" },
  { handle: "a53-amira-olive-gold-bisht-set", expectEn: "olive gold", expectAr: "ذهبي زيتي" },
  { handle: "a81-sahar-velvet-bisht", expectEn: "navy", expectAr: "كحلي" },
  { handle: "a54-bahar-bisht-set", expectEn: "burgundy", expectAr: "عنابي" },
  { handle: "a52-bahar-black-bisht-set", expectEn: "black", expectAr: "أسود" },
  { handle: "a146-aroob-bisht-set", expectEn: "black", expectAr: "أسود" }, // last product written by resume
];

for (const s of SAMPLES) {
  const d = await gql(
    `query($q: String!) {
      products(first: 1, query: $q) {
        edges { node {
          handle title tags
          variants(first: 1) {
            edges { node {
              id title
              mf: metafield(namespace:"mm-google-shopping", key:"color") { id value }
            } }
          }
        } }
      }
    }`,
    { q: `handle:${s.handle}` },
  );
  const p = d.products.edges[0].node;
  const v = p.variants.edges[0].node;
  const mfId = v.mf?.id;

  let arVal = null;
  if (mfId) {
    const tr = await gql(
      `query($id: ID!) { translatableResource(resourceId: $id) { translations(locale:"ar") { key value } translatableContent { key value digest } } }`,
      { id: mfId },
    );
    arVal = tr.translatableResource?.translations.find((t) => t.key === "value")?.value || null;
  }

  const enOk = v.mf?.value === s.expectEn;
  const arOk = arVal === s.expectAr;
  const tagOk = s.handle === "a85-sahar-dawn-daraa-bisht-set" ? p.tags.includes("ivory") : true;
  console.log(
    `${enOk && arOk && tagOk ? "✅" : "❌"} ${s.handle.padEnd(35)} | EN: ${(v.mf?.value || "(missing)").padEnd(12)} | AR: ${arVal || "(missing)"}${s.handle === "a85-sahar-dawn-daraa-bisht-set" ? ` | tag ivory: ${p.tags.includes("ivory") ? "yes" : "NO"}` : ""}`,
  );
}
