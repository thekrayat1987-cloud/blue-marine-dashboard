// Blue Marine — rename Shopify product titles in EN + AR with Gemini.
//
// Style: minimal elegant. Keeps the SKU prefix. Updates English title via
// productUpdate, then writes the Arabic translation via translationsRegister.
//
// Usage from the dashboard/ folder:
//   Preview new titles for everything (no writes):
//     node --env-file=.env.local scripts/rename-products.mjs
//
//   Preview a single product:
//     node --env-file=.env.local scripts/rename-products.mjs --product=<numericId>
//
//   Apply on a single product (TEST):
//     node --env-file=.env.local scripts/rename-products.mjs --apply --product=<numericId>
//
//   Apply on every product:
//     node --env-file=.env.local scripts/rename-products.mjs --apply --all

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!STORE || !TOKEN || !GEMINI_KEY) {
  console.error("Missing SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN or GEMINI_API_KEY.");
  process.exit(1);
}

const SHOPIFY_ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];
function geminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
}

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const all = args.has("--all");
const skipTranslated = args.has("--skip-translated");
const productArg = [...args].find((a) => a.startsWith("--product="));
const productNumericId = productArg ? productArg.split("=")[1] : null;
const limitArg = [...args].find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const skusArg = [...args].find((a) => a.startsWith("--skus="));
const skuList = skusArg ? skusArg.split("=")[1].split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : null;

async function shopify(query, variables) {
  const res = await fetch(SHOPIFY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchProducts() {
  const out = [];
  let cursor = null;
  while (true) {
    const data = await shopify(
      `query AllProducts($cursor: String) {
        products(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id
            title
            handle
            featuredImage { url altText }
            variants(first: 1) { edges { node { sku } } }
          }}
        }
      }`,
      { cursor },
    );
    for (const e of data.products.edges) out.push(e.node);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

async function hasArabicTitle(productId) {
  const data = await shopify(
    `query Tr($id: ID!) {
      translatableResource(resourceId: $id) {
        translations(locale: "ar") { key value }
      }
    }`,
    { id: productId },
  );
  return (data.translatableResource?.translations ?? []).some(
    (t) => t.key === "title" && t.value && t.value.trim() !== "",
  );
}

function extractSku(title, fallbackSku) {
  // Match leading SKU like "A11", "B22", "C95" possibly followed by – or - or space
  const m = title.match(/^([A-Z]\d{1,4})\b/);
  if (m) return m[1];
  if (fallbackSku) {
    const fm = fallbackSku.match(/^([A-Z]\d{1,4})/);
    if (fm) return fm[1];
  }
  return null;
}

async function callGeminiWithRetry(body, attempts = 3) {
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(geminiEndpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const text = await res.text();
      lastErr = `Gemini ${model} ${res.status}: ${text.slice(0, 150)}`;
      // 404: model not available -> jump to next model immediately
      if (res.status === 404) break;
      // Other 4xx (not 429): hard error, abort everything
      if (res.status !== 429 && res.status < 500) throw new Error(lastErr);
      const wait = Math.min(15000, 1500 * Math.pow(2, i));
      await new Promise((r) => setTimeout(r, wait));
    }
    // failover to next model
  }
  throw new Error(`All models exhausted: ${lastErr}`);
}

async function generateTitles(currentTitle, sku, usedNames = []) {
  const forbiddenBlock = usedNames.length
    ? `\n\n⚠️ FORBIDDEN NAMES — already used on other products, you MUST pick a different one:\n${usedNames.map((n) => `- ${n}`).join("\n")}\n`
    : "";

  const prompt = `You are naming a product for Atelier Blue Marine — a Kuwait luxury atelier of Gulf / Middle-Eastern heritage womenswear (daraa, caftan, abaya, bisht, layered sets, embroidered tunics, velvet bishts).

Current English title: "${currentTitle}"
SKU: ${sku}${forbiddenBlock}

Each product must get a **POETIC NAME** (one or two words) that gives it an identity, then a short descriptor. Like a fashion house naming each piece. Existing examples in the catalogue: "Noor Heritage Daraa", "Zafira Mosaic Daraa", "Layal Silk Daraa", "Zaria Burgundy Daraa", "Desert Drift Daraa", "Amara Plum Daraa".

NAME INSPIRATION POOL — pick ONE distinctive name that fits the garment's mood (color, occasion, fabric):
- Gulf feminine names: Noor, Layla, Layali, Yasmin, Amira, Zahra, Lulwa, Hessa, Dana, Sara, Hala, Maryam, Aisha, Latifa, Mariam, Sheikha, Sultana, Zafira, Amara, Zaria, Layal, Lina, Reem, Nada, Ghada
- Arabic poetic words: Noor (light), Layali (nights), Sahar (dawn), Amal (hope), Aman (peace), Hawa (breeze), Bahar (sea), Falaj (oasis), Zumurud (emerald), Yaqut (ruby), Lu'lu (pearl), Marjan (coral)
- Heritage/places: Mubarakiya, Bandar, Diwaniya, Khaleej, Souq, Riad, Sahara
- Moods: Midnight, Royal, Heritage, Mosaic, Velvet Bloom, Golden Hour, Desert Rose, Ocean, Sunset

ENGLISH RULES
- Format: "${sku} – Name + Garment + N-Piece Set" (or just "Name Garment" for one-piece items)
- Max 65 characters total. The NAME comes first after the dash, then the garment + key detail.
- ⚠️ For "Overcoat" or any outer Gulf garment, ALWAYS write "Bisht" — NEVER "Overcoat", "Coat", "Cloak" or "Robe" in English. The brand uses the authentic Gulf term in both languages.
- ⚠️ PIECE-COUNT FORMAT — be consistent. From the source title, identify how many pieces the product has:
  · One piece (no "Set" mention, single garment) → DO NOT add a piece count. Example: "${sku} – Layali Daraa".
  · Multiple pieces (the source says "2-Piece Set", "3-Piece", "ensemble", or mentions Bisht + Daraa + Shawl, etc.) → ALWAYS write exactly "N-Piece Set" (with hyphen, capital P, capital S). Example: "${sku} – Layali Velvet 3-Piece Bisht Set".
  · NEVER use "One Piece", "1-Piece", "Single Piece", "(One Piece)" — drop it for solo items.
  · NEVER use "Pieces", "Piece", "pcs" with a different format.
- Examples of good titles:
  · 1 piece → "${sku} – Layali Daraa"
  · 2 pieces → "${sku} – Zumurud 2-Piece Bisht Set"
  · 3 pieces → "${sku} – Noor 3-Piece Bisht Set"
- Color is OPTIONAL. The photo already shows the color, so you can omit it for a cleaner title — only include it when it is a defining trait (e.g. "Royal Navy", "Ivory") and helps SEO.
- Don't reuse the same name across SKUs. Pick a name that fits THIS specific garment.
- Plain English. No marketing fluff. No "exquisite / captivating / stunning / regal / opulent".

ARABIC RULES
- Format: "${sku} – الاسم بالعربية + وصف قصير"
- Use the SAME name as in English, written in Arabic script (transliteration).
  · Example: Layali → ليالي, Zumurud → زمرّد, Noor → نور, Zafira → ظفيرة, Amara → أمارا
- Then add the garment + key detail in formal but simple Arabic.
- Use words: بشت، درّاعة، قفطان، عباية، مخمل، حرير، مطرّز، طقم، ٢ قطع، ٣ قطع، تراثي، شال.
- ⚠️ For "overcoat" or any outer garment, ALWAYS use "بشت" — NEVER "معطف".
- ⚠️ PIECE-COUNT FORMAT — match the English version:
  · One piece → no piece count in Arabic either.
  · Multiple pieces → write "طقم N قطع" with N as Arabic-Indic numerals (٢, ٣, ٤). Example: "طقم ٢ قطع", "طقم ٣ قطع".
- Keep the SKU prefix in Latin (do not translate the SKU).
- Max 65 characters.

Return ONLY valid JSON, no backticks, no markdown:
{"name": "TheChosenName", "en": "${sku} – ...", "ar": "${sku} – ..."}

The "name" field is JUST the chosen poetic name in Latin script (one or two words like "Layali" or "Desert Rose"), used so the same name is not reused on another product.`;

  const json = await callGeminiWithRetry({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini empty response: ${JSON.stringify(json).slice(0, 300)}`);
  const parsed = JSON.parse(text);
  if (!parsed.en || !parsed.ar) throw new Error(`Gemini bad JSON: ${text}`);
  if (!parsed.name) {
    // best-effort fallback: extract the first word after the dash
    const m = parsed.en.match(/–\s*([A-Z][\w']+(?:\s+[A-Z][\w']+)?)/);
    parsed.name = m ? m[1] : sku;
  }
  return parsed;
}

async function fetchTranslatableDigest(productId) {
  const data = await shopify(
    `query Digest($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: productId },
  );
  const entry = data.translatableResource?.translatableContent.find((c) => c.key === "title");
  return entry?.digest ?? null;
}

async function updateEnglishTitle(productId, newTitle) {
  const data = await shopify(
    `mutation Update($input: ProductInput!) {
      productUpdate(input: $input) {
        userErrors { field message }
      }
    }`,
    { input: { id: productId, title: newTitle } },
  );
  return data.productUpdate.userErrors;
}

async function setArabicTranslation(productId, arabicTitle, digest) {
  const data = await shopify(
    `mutation TR($resourceId: ID!, $translations: [TranslationInput!]!) {
      translationsRegister(resourceId: $resourceId, translations: $translations) {
        userErrors { field message }
      }
    }`,
    {
      resourceId: productId,
      translations: [
        {
          key: "title",
          value: arabicTitle,
          locale: "ar",
          translatableContentDigest: digest,
        },
      ],
    },
  );
  return data.translationsRegister.userErrors;
}

async function processProduct(p, usedNames) {
  const sku = extractSku(p.title, p.variants?.edges?.[0]?.node?.sku);
  if (!sku) {
    console.log(`  ⚠ ${p.title} — no SKU detected, skipping`);
    return { skipped: true };
  }

  const titles = await generateTitles(p.title, sku, [...usedNames]);
  if (titles.name) usedNames.add(titles.name);
  console.log(`  • ${p.title}`);
  console.log(`      Name: ${titles.name}`);
  console.log(`      EN: ${titles.en}`);
  console.log(`      AR: ${titles.ar}`);

  if (!apply) return { previewed: true };

  const enErrs = await updateEnglishTitle(p.id, titles.en);
  if (enErrs.length) {
    console.log(`      ✗ EN update: ${enErrs.map((e) => e.message).join(", ")}`);
    return { failed: true };
  }

  const digest = await fetchTranslatableDigest(p.id);
  if (!digest) {
    console.log(`      ⚠ no AR digest, EN saved but AR skipped`);
    return { partial: true };
  }
  const arErrs = await setArabicTranslation(p.id, titles.ar, digest);
  if (arErrs.length) {
    console.log(`      ✗ AR update: ${arErrs.map((e) => e.message).join(", ")}`);
    return { partialAr: true };
  }
  console.log(`      ✓ EN + AR updated`);
  return { ok: true };
}

(async () => {
  const products = await fetchProducts();
  console.log(`Total products: ${products.length}`);

  let scope = products;
  if (productNumericId) {
    const wanted = `gid://shopify/Product/${productNumericId}`;
    scope = products.filter((p) => p.id === wanted);
    if (!scope.length) {
      console.error(`Product ${productNumericId} not found.`);
      process.exit(1);
    }
  } else if (skuList && skuList.length) {
    scope = products.filter((p) => {
      const sku = extractSku(p.title, p.variants?.edges?.[0]?.node?.sku);
      return sku && skuList.includes(sku.toUpperCase());
    });
    console.log(`Filtered ${products.length} → ${scope.length} via --skus list.`);
  } else if (apply && !all) {
    console.error("Refusing to mass-apply without --all, --skus=<list>, or --product=<id>.");
    process.exit(1);
  }
  if (limit) scope = scope.slice(0, limit);

  if (skipTranslated) {
    console.log(`Filtering out products already translated to Arabic…`);
    const filtered = [];
    for (const p of scope) {
      const has = await hasArabicTitle(p.id);
      if (!has) filtered.push(p);
    }
    console.log(`  ${scope.length} → ${filtered.length} after filter.`);
    scope = filtered;
  }

  console.log(`Processing ${scope.length} product(s)…\n`);

  let ok = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  const usedNames = new Set();
  // Seed with names already in the catalogue so the AI doesn't reinvent them
  for (const p of products) {
    const m = p.title.match(/^[A-Z]\d{1,4}\s*[–\-]\s*([A-Z][\w']+(?:\s+[A-Z][\w']+)?)/);
    if (m) usedNames.add(m[1]);
  }
  for (const p of scope) {
    try {
      const r = await processProduct(p, usedNames);
      if (r.ok) ok++;
      else if (r.partial || r.partialAr) partial++;
      else if (r.failed) failed++;
      else if (r.skipped) skipped++;
    } catch (err) {
      failed++;
      console.log(`  ✗ ${p.title}: ${err.message}`);
    }
    // light pacing to stay under Gemini + Shopify limits
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. OK: ${ok}, partial: ${partial}, failed: ${failed}, skipped: ${skipped}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
