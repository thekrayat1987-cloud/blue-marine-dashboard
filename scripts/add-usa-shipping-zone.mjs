#!/usr/bin/env node
/**
 * Add a "USA Express" shipping zone to the default delivery profile.
 *
 * Goal: unlock Shopify Catalog (Agentic channel) eligibility, which
 * requires the store to ship to either United States or Canada.
 *
 * Configuration (per Khadija's choice 2026-05-14):
 *   - Country: United States only
 *   - Rate: 35 KWD flat (covers DHL/Aramex Express + customs margin)
 *   - Name: "International Express (US)"
 *
 * Run dry-run first:   node scripts/add-usa-shipping-zone.mjs
 * Apply for real:      node scripts/add-usa-shipping-zone.mjs --apply
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
const APPLY = process.argv.includes("--apply");

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

// 1) Get the default delivery profile id + its location group id
const d = await gql(`{
  deliveryProfiles(first: 25) {
    edges { node {
      id name default
      profileLocationGroups {
        locationGroup { id }
        locationGroupZones(first: 50) {
          edges { node { zone { name countries { code { countryCode } } } } }
        }
      }
    }}
  }
}`);

const defaultProfile = d.deliveryProfiles.edges.map(e => e.node).find(p => p.default);
if (!defaultProfile) throw new Error("No default delivery profile found");
const locationGroup = defaultProfile.profileLocationGroups[0];
if (!locationGroup) throw new Error("Default profile has no location group");

// Guard: skip if a zone already includes US
const alreadyShipsUS = defaultProfile.profileLocationGroups.some(g =>
  g.locationGroupZones.edges.some(ze =>
    ze.node.zone.countries.some(c => c.code.countryCode === "US")
  )
);
if (alreadyShipsUS) {
  console.log("✅ Default profile already ships to US — nothing to do.");
  process.exit(0);
}

console.log(`Profile: ${defaultProfile.name}`);
console.log(`  → adding zone "International Express (US)"`);
console.log(`  → country: United States (US)`);
console.log(`  → rate: 35.000 KWD flat ("DHL/Aramex Express")`);
console.log();

if (!APPLY) {
  console.log("ℹ️  Dry-run only. Re-run with --apply to push to Shopify.");
  process.exit(0);
}

const mutation = `
mutation Add($id: ID!, $profile: DeliveryProfileInput!) {
  deliveryProfileUpdate(id: $id, profile: $profile) {
    profile { id }
    userErrors { field message }
  }
}`;

const variables = {
  id: defaultProfile.id,
  profile: {
    locationGroupsToUpdate: [{
      id: locationGroup.locationGroup.id,
      zonesToCreate: [{
        name: "International Express (US)",
        countries: [{ code: "US", includeAllProvinces: true }],
        methodDefinitionsToCreate: [{
          name: "DHL/Aramex Express",
          description: "Express international delivery, 3–7 business days. Customs/duties paid by recipient.",
          active: true,
          rateDefinition: {
            price: { amount: "35.000", currencyCode: "KWD" },
          },
        }],
      }],
    }],
  },
};

const res = await gql(mutation, variables);
const errs = res.deliveryProfileUpdate.userErrors;
if (errs.length) {
  console.error("❌ Shopify rejected the change:");
  for (const e of errs) console.error(`  - [${e.field?.join(".")}] ${e.message}`);
  process.exit(1);
}
console.log("✅ Zone created. Verifying…");

const verify = await gql(`{
  deliveryProfiles(first: 25) {
    edges { node { default profileLocationGroups { locationGroupZones(first:50) {
      edges { node { zone { name countries { code { countryCode } } } } }
    }}}}
  }
}`);
const okUS = verify.deliveryProfiles.edges
  .map(e => e.node).find(p => p.default)
  .profileLocationGroups.some(g =>
    g.locationGroupZones.edges.some(ze =>
      ze.node.zone.countries.some(c => c.code.countryCode === "US")
    )
  );
console.log(okUS ? "✅ Confirmed: store now ships to US." : "⚠️  Verification did not see US — check Shopify admin.");
