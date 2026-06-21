#!/usr/bin/env node
/**
 * Re-classify name-consistency-audit.json findings into severity tiers
 * and produce an actionable summary.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, "..", "name-consistency-audit.json"), "utf8"));

// Severity rules:
//   CRITICAL: alt text references a wrong/old name (customer-facing)
//   HIGH:    body description references a wrong/old name OR has stale prose
//   MEDIUM:  handle still has old slug (SEO impact, no customer-visible text)
//   LOW:     AR translation missing a name token (catalog hygiene)

function classify(f) {
  // Pull the "current" expected name tokens from title.
  const expected = new Set(f.enTokens.map((w) => w.toLowerCase()));
  // Look at alt text — does it contain a proper-noun that isn't in title?
  const altTokens = (f.altText || "")
    .replace(/^A\d+\s*[–—\-]\s*/i, "")
    .replace(/^SOLD\s+OUT\s*/i, "")
    .split(/[\s,]+/)
    .filter((w) => w && /^[A-Z][a-zA-Z']+$/.test(w))
    .map((w) => w.toLowerCase());
  const altHasWrong = altTokens.some(
    (w) => !expected.has(w) && !["bisht", "daraa", "caftan", "set", "piece"].includes(w),
  );

  // Handle: does the handle slug contain a different proper noun?
  const handleParts = (f.handle || "").split("-").filter((p) => p && p !== "a" + (f.handle.match(/^a(\d+)/i)?.[1] || ""));
  const handleHasWrong = handleParts.some((part) => {
    if (["set", "piece", "bisht", "daraa", "caftan", "velvet", "black", "white"].includes(part)) return false;
    if (/^\d+/.test(part)) return false;
    return ![...expected].some((w) => w.includes(part) || part.includes(w));
  });

  const tier = altHasWrong
    ? "CRITICAL"
    : handleHasWrong
      ? "MEDIUM"
      : f.issues.some((i) => i.kind === "missing-name-token" && i.field === "body")
        ? "HIGH"
        : "LOW";
  return { ...f, tier, altHasWrong, handleHasWrong };
}

const classified = data.findings.map(classify);

const byTier = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
for (const f of classified) byTier[f.tier].push(f);

console.log(`Total products: ${data.totalProducts} | Flagged: ${data.totalFlagged}\n`);
console.log("Severity breakdown:");
for (const [tier, arr] of Object.entries(byTier)) {
  console.log(`  ${tier.padEnd(10)} ${arr.length}`);
}

for (const [tier, arr] of Object.entries(byTier)) {
  if (!arr.length) continue;
  console.log(`\n========== ${tier} (${arr.length}) ==========`);
  for (const f of arr.slice(0, tier === "CRITICAL" ? 50 : 10)) {
    console.log(`  ${f.title}`);
    console.log(`    handle: ${f.handle}`);
    console.log(`    alt:    ${f.altText || "(none)"}`);
  }
  if (arr.length > (tier === "CRITICAL" ? 50 : 10)) {
    console.log(`  ... +${arr.length - (tier === "CRITICAL" ? 50 : 10)} more`);
  }
}

writeFileSync(
  resolve(__dirname, "..", "name-consistency-audit-tiered.json"),
  JSON.stringify({ scannedAt: data.scannedAt, totalProducts: data.totalProducts, byTier }, null, 2),
);
console.log("\nTiered report: name-consistency-audit-tiered.json");
