#!/usr/bin/env node
/**
 * Full Atelier Blue Marine Shopify store audit.
 * Pulls shop, products, collections, pages, policies, markets, discounts,
 * online store theme info, and computes completeness scores.
 * Writes store-audit-full.json + prints a human summary.
 */
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
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// --- Shop ---
const shop = (await gql(`{
  shop {
    name
    myshopifyDomain
    primaryDomain { url host }
    email
    contactEmail
    currencyCode
    weightUnit
    ianaTimezone
    plan { displayName partnerDevelopment shopifyPlus }
    shipsToCountries
    checkoutApiSupported
    setupRequired
    taxesIncluded
    timezoneAbbreviation
  }
}`)).shop;

// --- Markets / locales ---
const localesData = await gql(`{
  shopLocales { locale primary published }
  markets(first: 20) {
    edges { node {
      id name handle enabled primary
      webPresence { rootUrls { url locale } }
      regions(first: 50) { edges { node { ... on MarketRegionCountry { code name } } } }
    } }
  }
}`);

// --- Online store / theme ---
const themesData = await gql(`{
  themes(first: 20) {
    edges { node { id name role themeStoreId processing } }
  }
}`).catch((e) => ({ _err: String(e) }));

// --- Sales channels ---
const channels = await gql(`{
  channels(first: 25) { edges { node { id name handle } } }
}`).catch(() => ({ channels: { edges: [] } }));

// --- Pages, policies, redirects ---
const pages = await gql(`{
  pages(first: 50) { edges { node { id handle title bodySummary publishedAt updatedAt } } }
  shop { shopPolicies { id type title body url } }
  urlRedirects(first: 10) { edges { node { id path target } } }
}`);
pages.shopPolicies = pages.shop?.shopPolicies || [];

// --- Discounts ---
const discounts = await gql(`{
  codeDiscountNodes(first: 50) {
    edges { node { id codeDiscount {
      ... on DiscountCodeBasic { title status startsAt endsAt codes(first: 1) { edges { node { code } } } }
      ... on DiscountCodeBxgy   { title status startsAt endsAt codes(first: 1) { edges { node { code } } } }
      ... on DiscountCodeFreeShipping { title status startsAt endsAt codes(first: 1) { edges { node { code } } } }
    } } }
  }
  automaticDiscountNodes(first: 50) {
    edges { node { id automaticDiscount {
      ... on DiscountAutomaticBasic { title status startsAt endsAt }
      ... on DiscountAutomaticBxgy  { title status startsAt endsAt }
    } } }
  }
}`).catch((e) => ({ _err: String(e) }));

// --- Collections ---
const collections = [];
{
  let after = null;
  while (true) {
    const d = await gql(
      `query($after:String){
        collections(first:50, after:$after){
          edges{ cursor node{
            id handle title sortOrder productsCount { count }
            descriptionHtml
            image { url altText }
            seo { title description }
            updatedAt
          } }
          pageInfo{ hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const e of d.collections.edges) collections.push(e.node);
    if (!d.collections.pageInfo.hasNextPage) break;
    after = d.collections.pageInfo.endCursor;
    await sleep(120);
  }
}

// --- Products (heavy: paginate) ---
const products = [];
{
  let after = null;
  while (true) {
    const d = await gql(
      `query($after:String){
        products(first:25, after:$after){
          edges{ cursor node{
            id handle title status productType vendor tags
            descriptionHtml
            seo { title description }
            totalInventory tracksInventory
            featuredMedia { ... on MediaImage { image { url altText width height } } }
            media(first: 20) { edges { node { ... on MediaImage { image { url altText width height } } } } }
            options { name values }
            variants(first: 100) {
              edges { node { id sku price compareAtPrice barcode inventoryQuantity inventoryPolicy availableForSale title selectedOptions { name value } } }
            }
            resourcePublicationsV2(first: 20) { edges { node { publication { name } isPublished } } }
            updatedAt createdAt
          } }
          pageInfo{ hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const e of d.products.edges) products.push(e.node);
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
    await sleep(150);
  }
}

// === Compute findings ===
const finding = (sev, area, msg, items = []) => ({ sev, area, msg, count: items.length, samples: items.slice(0, 5) });
const findings = [];

const productById = new Map(products.map((p) => [p.id, p]));
const byStatus = { ACTIVE: 0, DRAFT: 0, ARCHIVED: 0 };
let totalVariants = 0;
let totalImages = 0;
const issues = {
  missingDescription: [],
  missingSeoTitle: [],
  missingSeoDescription: [],
  missingFeaturedImage: [],
  missingAltText: [],
  zeroVariants: [],
  zeroPriceVariant: [],
  missingSku: [],
  inventoryNotTracked: [],
  outOfStock: [],
  notPublishedOnlineStore: [],
  badImageAspect: [], // not 9:16
  noTags: [],
  noProductType: [],
  noVendor: [],
  draftWithImages: [],
  archived: [],
  skuOff: [], // missing pattern A123 or duplicates
  duplicatePrice: [],
  highlyDiscounted: [],
};

const skuMap = new Map(); // sku -> [productHandle]
const titlePrefixCount = new Map();

for (const p of products) {
  byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  const v = p.variants.edges.map((x) => x.node);
  const m = p.media.edges.map((x) => x.node?.image).filter(Boolean);
  totalVariants += v.length;
  totalImages += m.length;

  const tag = (p.handle || p.title || p.id).toString();

  if (!p.descriptionHtml || p.descriptionHtml.replace(/<[^>]+>/g, "").trim().length < 30)
    issues.missingDescription.push(tag);
  if (!p.seo?.title) issues.missingSeoTitle.push(tag);
  if (!p.seo?.description) issues.missingSeoDescription.push(tag);
  if (!p.featuredMedia?.image?.url) issues.missingFeaturedImage.push(tag);
  if (!p.productType) issues.noProductType.push(tag);
  if (!p.vendor) issues.noVendor.push(tag);
  if (!p.tags?.length) issues.noTags.push(tag);
  if (p.status === "ARCHIVED") issues.archived.push(tag);
  if (p.status === "DRAFT" && m.length > 0) issues.draftWithImages.push(tag);
  if (!v.length) issues.zeroVariants.push(tag);

  // Featured image aspect
  const fi = p.featuredMedia?.image;
  if (fi?.width && fi?.height) {
    const ratio = fi.width / fi.height;
    if (Math.abs(ratio - 9 / 16) > 0.02) issues.badImageAspect.push(`${tag} (${fi.width}x${fi.height})`);
  }
  // Alt text
  const noAlt = m.filter((im) => !(im.altText || "").trim());
  if (noAlt.length) issues.missingAltText.push(`${tag} (${noAlt.length}/${m.length})`);

  // SKU title prefix (A123 etc.)
  const titleMatch = (p.title || "").match(/^([A-Z]\d+)\b/);
  if (titleMatch) {
    titlePrefixCount.set(titleMatch[1], (titlePrefixCount.get(titleMatch[1]) || 0) + 1);
  }

  // Variants
  for (const vv of v) {
    if (!vv.sku) issues.missingSku.push(`${tag} / ${vv.title}`);
    else {
      const arr = skuMap.get(vv.sku) || [];
      arr.push(tag);
      skuMap.set(vv.sku, arr);
    }
    if (parseFloat(vv.price || "0") <= 0) issues.zeroPriceVariant.push(`${tag} / ${vv.title}`);
    if (vv.compareAtPrice && parseFloat(vv.compareAtPrice) > 0) {
      const disc = 1 - parseFloat(vv.price || "0") / parseFloat(vv.compareAtPrice);
      if (disc > 0.5) issues.highlyDiscounted.push(`${tag} / ${vv.title} (-${(disc * 100).toFixed(0)}%)`);
    }
    if (vv.inventoryPolicy === "DENY" && (vv.inventoryQuantity ?? 0) <= 0) issues.outOfStock.push(`${tag} / ${vv.title}`);
  }

  if (!p.tracksInventory) issues.inventoryNotTracked.push(tag);

  // Channels
  const pubs = p.resourcePublicationsV2?.edges?.map((e) => e.node) || [];
  const onlineStorePub = pubs.find((x) => /online store/i.test(x.publication?.name || ""));
  if (!onlineStorePub?.isPublished) issues.notPublishedOnlineStore.push(tag);
}

const duplicateSkus = [...skuMap.entries()].filter(([, arr]) => arr.length > 1);
const duplicateSkuItems = duplicateSkus.map(([sku, arr]) => `${sku} → ${arr.join(", ")}`);

const duplicateTitlePrefixes = [...titlePrefixCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} (×${n})`);

// Collections findings
const collIssues = {
  noDescription: [],
  noSeoTitle: [],
  noSeoDescription: [],
  noImage: [],
  zeroProducts: [],
  smallCollection: [],
};
for (const c of collections) {
  if (!c.descriptionHtml || c.descriptionHtml.replace(/<[^>]+>/g, "").trim().length < 20)
    collIssues.noDescription.push(c.handle);
  if (!c.seo?.title) collIssues.noSeoTitle.push(c.handle);
  if (!c.seo?.description) collIssues.noSeoDescription.push(c.handle);
  if (!c.image?.url) collIssues.noImage.push(c.handle);
  const cnt = c.productsCount?.count ?? 0;
  if (cnt === 0) collIssues.zeroProducts.push(c.handle);
  else if (cnt < 3) collIssues.smallCollection.push(`${c.handle} (${cnt})`);
}

// Pages / policies
const pageIssues = {
  missingPolicies: [],
  pages: pages.pages.edges.map((e) => e.node.handle),
};
const requiredPolicies = ["REFUND_POLICY", "PRIVACY_POLICY", "TERMS_OF_SERVICE", "SHIPPING_POLICY"];
for (const rp of requiredPolicies) {
  const found = (pages.shopPolicies || []).find((pol) => pol.type === rp && pol.body);
  if (!found) pageIssues.missingPolicies.push(rp);
}

// Severity scoring
if (issues.missingDescription.length) findings.push(finding("HIGH", "Catalog", `Products with missing/short EN description`, issues.missingDescription));
if (issues.missingSeoTitle.length) findings.push(finding("HIGH", "SEO", `Products without SEO meta_title`, issues.missingSeoTitle));
if (issues.missingSeoDescription.length) findings.push(finding("HIGH", "SEO", `Products without SEO meta_description`, issues.missingSeoDescription));
if (issues.missingFeaturedImage.length) findings.push(finding("HIGH", "Catalog", `Products without featured image`, issues.missingFeaturedImage));
if (issues.missingAltText.length) findings.push(finding("MED", "Accessibility/SEO", `Products with images missing alt text`, issues.missingAltText));
if (issues.missingSku.length) findings.push(finding("MED", "Inventory", `Variants without SKU`, issues.missingSku));
if (duplicateSkuItems.length) findings.push(finding("HIGH", "Inventory", `Duplicate SKUs`, duplicateSkuItems));
if (issues.zeroPriceVariant.length) findings.push(finding("HIGH", "Pricing", `Variants priced at 0`, issues.zeroPriceVariant));
if (issues.outOfStock.length) findings.push(finding("MED", "Inventory", `Variants out of stock + DENY (unbuyable)`, issues.outOfStock));
if (issues.badImageAspect.length) findings.push(finding("MED", "Visual", `Featured images NOT 9:16 (864×1536 std)`, issues.badImageAspect));
if (issues.notPublishedOnlineStore.length) findings.push(finding("HIGH", "Channels", `Products not published on Online Store`, issues.notPublishedOnlineStore));
if (issues.draftWithImages.length) findings.push(finding("LOW", "Catalog", `Draft products with images (ready to publish?)`, issues.draftWithImages));
if (issues.archived.length) findings.push(finding("LOW", "Catalog", `Archived products`, issues.archived));
if (issues.noTags.length) findings.push(finding("LOW", "Discoverability", `Products without tags`, issues.noTags));
if (issues.noProductType.length) findings.push(finding("LOW", "Discoverability", `Products without productType`, issues.noProductType));
if (issues.highlyDiscounted.length) findings.push(finding("LOW", "Pricing", `Variants discounted >50%`, issues.highlyDiscounted));
if (duplicateTitlePrefixes.length) findings.push(finding("HIGH", "Catalog", `Duplicate SKU prefixes in titles (Axxx collisions)`, duplicateTitlePrefixes));
if (collIssues.noDescription.length) findings.push(finding("HIGH", "Collections", `Collections missing description`, collIssues.noDescription));
if (collIssues.noSeoTitle.length) findings.push(finding("MED", "Collections SEO", `Collections without meta_title`, collIssues.noSeoTitle));
if (collIssues.noSeoDescription.length) findings.push(finding("MED", "Collections SEO", `Collections without meta_description`, collIssues.noSeoDescription));
if (collIssues.noImage.length) findings.push(finding("MED", "Collections", `Collections without cover image`, collIssues.noImage));
if (collIssues.zeroProducts.length) findings.push(finding("HIGH", "Collections", `Empty collections`, collIssues.zeroProducts));
if (collIssues.smallCollection.length) findings.push(finding("LOW", "Collections", `Collections with <3 products`, collIssues.smallCollection));
if (pageIssues.missingPolicies.length) findings.push(finding("HIGH", "Legal/Trust", `Missing shop policies`, pageIssues.missingPolicies));

// === Output ===
const out = {
  generatedAt: new Date().toISOString(),
  shop,
  locales: localesData.shopLocales,
  markets: localesData.markets.edges.map((e) => e.node),
  themes: themesData.themes?.edges?.map((e) => e.node) || themesData,
  channels: channels.channels.edges.map((e) => e.node),
  counts: {
    products: products.length,
    productsByStatus: byStatus,
    variants: totalVariants,
    images: totalImages,
    collections: collections.length,
    pages: pages.pages.edges.length,
    policies: pages.shopPolicies?.length || 0,
    discountCodes: discounts.codeDiscountNodes?.edges?.length || 0,
    discountsAuto: discounts.automaticDiscountNodes?.edges?.length || 0,
  },
  findings,
  rawIssues: { issues, collIssues, pageIssues, duplicateSkuItems, duplicateTitlePrefixes },
  collections: collections.map((c) => ({ handle: c.handle, title: c.title, products: c.productsCount?.count, sortOrder: c.sortOrder })),
};

const outPath = resolve(__dirname, "..", "store-audit-full.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));

// Pretty summary
console.log(`\n=== ATELIER BLUE MARINE — Shopify full audit ===`);
console.log(`Generated: ${out.generatedAt}`);
console.log(`Shop:      ${shop.name} (${shop.myshopifyDomain})`);
console.log(`Domain:    ${shop.primaryDomain?.url}`);
console.log(`Plan:      ${shop.plan?.displayName}   Currency: ${shop.currencyCode}   TZ: ${shop.ianaTimezone}`);
console.log(`Locales:   ${localesData.shopLocales.map((l) => `${l.locale}${l.primary ? "*" : ""}${l.published ? "" : "(unpub)"}`).join(", ")}`);
console.log(`Markets:   ${out.markets.length}    Channels: ${out.channels.length}    Themes: ${(out.themes || []).length || "?"}`);
console.log(``);
console.log(`Catalog:   ${products.length} products  (active=${byStatus.ACTIVE || 0}, draft=${byStatus.DRAFT || 0}, archived=${byStatus.ARCHIVED || 0})`);
console.log(`           ${totalVariants} variants, ${totalImages} images`);
console.log(`           ${collections.length} collections, ${out.counts.pages} pages, ${out.counts.policies} policies`);
console.log(`           ${out.counts.discountCodes} code discounts, ${out.counts.discountsAuto} automatic discounts`);
console.log(``);
console.log(`=== Findings (${findings.length}) ===`);
for (const f of findings.sort((a, b) => ({ HIGH: 0, MED: 1, LOW: 2 })[a.sev] - ({ HIGH: 0, MED: 1, LOW: 2 })[b.sev])) {
  console.log(`[${f.sev.padEnd(4)}] ${f.area.padEnd(20)} ${f.count.toString().padStart(4)}× ${f.msg}`);
  if (f.samples.length) console.log(`         e.g. ${f.samples.slice(0, 3).join(" | ")}`);
}
console.log(`\nFull JSON: ${outPath}`);
