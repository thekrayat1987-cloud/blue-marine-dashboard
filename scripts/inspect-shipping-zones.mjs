#!/usr/bin/env node
/**
 * Inspect Shopify shipping zones / delivery profiles.
 *
 * Goal: confirm whether the store currently ships to United States or Canada,
 * which is the only non-trivial requirement for Shopify Catalog (Agentic channel)
 * eligibility.
 */
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

const d = await gql(`{
  deliveryProfiles(first: 25) {
    edges {
      node {
        id
        name
        default
        profileLocationGroups {
          locationGroup { id }
          locationGroupZones(first: 50) {
            edges {
              node {
                zone {
                  id
                  name
                  countries {
                    code { countryCode }
                    name
                    provinces { code name }
                  }
                }
                methodDefinitionCounts {
                  participantDefinitionsCount
                  rateDefinitionsCount
                }
              }
            }
          }
        }
      }
    }
  }
}`);

const profiles = d.deliveryProfiles.edges.map(e => e.node);
console.log(`Found ${profiles.length} delivery profile(s)\n`);

let shipsToUS = false;
let shipsToCA = false;
const allCountries = new Set();

for (const p of profiles) {
  console.log(`━━━ Profile: ${p.name}${p.default ? " (default)" : ""} ━━━`);
  for (const grp of p.profileLocationGroups) {
    for (const ze of grp.locationGroupZones.edges) {
      const z = ze.node.zone;
      const rates = ze.node.methodDefinitionCounts;
      const totalRates = rates.participantDefinitionsCount + rates.rateDefinitionsCount;
      const countryList = z.countries.map(c => `${c.name} (${c.code.countryCode})`).join(", ");
      console.log(`  Zone: ${z.name}  [${totalRates} rate(s)]`);
      console.log(`    → ${countryList || "(no countries)"}`);
      for (const c of z.countries) {
        allCountries.add(c.code.countryCode);
        if (c.code.countryCode === "US") shipsToUS = true;
        if (c.code.countryCode === "CA") shipsToCA = true;
      }
    }
  }
  console.log();
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("SHOPIFY CATALOG ELIGIBILITY CHECK");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Ships to USA?    ${shipsToUS ? "✅ YES" : "❌ NO"}`);
console.log(`  Ships to Canada? ${shipsToCA ? "✅ YES" : "❌ NO"}`);
console.log();
console.log(`  Total countries covered: ${allCountries.size}`);
console.log(`  Countries: ${[...allCountries].sort().join(", ")}`);
console.log();
if (shipsToUS || shipsToCA) {
  console.log("  ✅ ELIGIBLE for Shopify Catalog (ships to US or CA)");
} else {
  console.log("  ⚠️  NOT eligible for Shopify Catalog — add a US or CA shipping zone");
}
