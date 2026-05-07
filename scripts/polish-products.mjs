// Blue Marine — polish Shopify products: SEO + description + tags + URL handle in EN + AR.
//
// For each product, given its current (already renamed) title and featured image,
// generate via Gemini:
//   - body_html: 3 short paragraphs (60-90 words) in EN + AR
//   - seo.title: 50-70 chars EN + AR
//   - seo.description: 130-160 chars EN + AR
//   - tags: ~10 lowercase Shopify tags
//   - handle: SEO-friendly URL slug (EN)
// Then write to Shopify (productUpdate + translationsRegister for AR).
//
// Usage from dashboard/:
//   Preview a single product:
//     node --env-file=.env.local scripts/polish-products.mjs --product=<numericId>
//   Apply on a single product:
//     node --env-file=.env.local scripts/polish-products.mjs --apply --product=<numericId>
//   Apply on all:
//     node --env-file=.env.local scripts/polish-products.mjs --apply --all

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!STORE || !TOKEN || !GEMINI_KEY) {
  console.error("Missing SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN or GEMINI_API_KEY.");
  process.exit(1);
}

const SHOPIFY_ENDPOINT = `https://${STORE}/admin/api/${VERSION}/graphql.json`;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-flash-latest"];
const geminiEndpoint = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const all = args.has("--all");
const productArg = [...args].find((a) => a.startsWith("--product="));
const productNumericId = productArg ? productArg.split("=")[1] : null;
const limitArg = [...args].find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const skusArg = [...args].find((a) => a.startsWith("--skus="));
const skuList = skusArg
  ? skusArg.split("=")[1].split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : null;

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
      if (res.status === 404) break;
      if (res.status !== 429 && res.status < 500) throw new Error(lastErr);
      const wait = Math.min(15000, 1500 * Math.pow(2, i));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`All models exhausted: ${lastErr}`);
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
            featuredImage { url }
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

async function fetchTranslatableDigests(productId) {
  const data = await shopify(
    `query Tr($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key value digest locale }
      }
    }`,
    { id: productId },
  );
  const map = {};
  for (const c of data.translatableResource?.translatableContent ?? []) {
    map[c.key] = c.digest;
  }
  return map;
}

function extractSku(title) {
  const m = title.match(/^([A-Z]\d{1,4})\b/);
  return m ? m[1] : null;
}

function detectPieces(title) {
  const m = title.match(/(\d+)-Piece/i);
  return m ? parseInt(m[1], 10) : 1;
}

async function fetchImageBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { base64: buffer.toString("base64"), mimeType };
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function generatePolish(title, sku, pieces, imageBase64, mimeType) {
  const compositionFacts = [];
  if (pieces > 1) compositionFacts.push(`${pieces}-piece coordinated set`);

  const prompt = `You are the senior copywriter of a luxury Gulf fashion agency, writing the product page for Atelier Blue Marine — a Kuwait atelier of made-to-order Gulf heritage womenswear (daraa, caftan, abaya, bisht, embroidered sets). Imagine the brand's positioning: confident, modern, rooted in Khaleeji craft, made for women across Saudi, UAE, Kuwait, Qatar, Bahrain, Oman who want heritage with contemporary cut.

Your job is NOT to "describe a product" — it is to write copy that:
  1. Makes a Khaleeji woman browsing on Instagram or Google STOP and want to wear it.
  2. Ranks the page in the top 3 of Google across the GCC for "[garment type] [color/fabric/occasion]" searches.
  3. Reads with confident editorial restraint — like Vogue Arabia, not a souk listing.

Product to polish:
- Title (already set, DO NOT change): "${title}"
- SKU: ${sku}
- Composition: ${compositionFacts.length ? compositionFacts.join(", ") : "single piece"}
- An image of the product is attached. STUDY IT — note the silhouette, fabric weight, embroidery placement, sleeve cut, color depth.

You must produce: description (EN + AR), SEO page title (EN + AR), SEO meta description (EN + AR), tags (12-18), and URL handle.

# WRITING RULES
1. Plain, simple, natural — read aloud, must sound human, not like a perfume ad.
2. Concrete details over poetry: "olive silk velvet, gold thread embroidery on the neckline" — not "captivating elegance".
3. ⚠️ For "overcoat" or any outer Gulf garment, ALWAYS write "Bisht" (EN) and "بشت" (AR). NEVER "Overcoat", "Coat", "Robe", "Cloak", "معطف".
4. ⚠️ For "dress" or "inner dress" or "robe" in Arabic, ALWAYS write "درّاعة". NEVER use "فستان" — that is generic and Western. The brand uses "درّاعة" / "درّاعة داخلية" for the traditional Gulf dress.
5. ⚠️ DO NOT mention Ramadan unless the product is a literal Ramadan capsule piece. The garments are worn YEAR-ROUND (weddings, henna nights, formal evenings, family gatherings, Eid, special occasions). Tying every product to Ramadan limits SEO discovery to a 1-month window. Use general occasions: evening, wedding, henna, gathering, formal, eid, special-occasion, dinner.
6. NEVER use these banned words in EN: exquisite, captivating, captivate, evoke, evoking, evocative, allure, alluring, mystique, embrace, embraces, journey, celebration of, statement piece, must-have, sophisticated, enchanting, mesmerizing, breathtaking, stunning, gorgeous, lovely, dreamy, ethereal, gracefully, exquisitely, beautifully, masterfully, cascade, cascading, adorned, adorning, luminous, radiant, opulent, lavish, regal, majestic.
7. AR: also avoid embellished marketing arabic. Short clear sentences.

# GOOGLE SEO — RANK HIGH ACROSS THE GCC (NOT JUST KUWAIT)
Atelier Blue Marine ships across the entire Gulf Cooperation Council:
🇰🇼 Kuwait (home), 🇸🇦 Saudi Arabia, 🇦🇪 UAE, 🇶🇦 Qatar, 🇧🇭 Bahrain, 🇴🇲 Oman.

Goal: rank top-3 on Google for these intent searches in EN + AR:
- EN: "abaya Saudi", "abaya UAE", "abaya Dubai", "daraa Kuwait", "luxury daraa GCC", "bisht women Saudi", "Khaleeji daraa", "Gulf wedding bisht", "Riyadh abaya online", "Dubai khaleeji abaya"
- AR: "عباية الخليج", "عباية سعودية", "عباية إماراتية", "عباية دبي", "درّاعة كويتية", "درّاعة سعودية", "بشت نسائي خليجي", "أتيليه خليجي", "عباية الرياض", "عباية الدوحة"
- Heritage: "Khaleeji clothing", "Gulf heritage", "GCC luxury abaya"
- Garment-specific: "velvet bisht", "embroidered daraa", "wedding bisht", "henna daraa", "evening abaya"

SEO RULES:
- Page title MUST include: garment type (bisht/daraa/caftan/abaya) + 1 distinctive trait + brand name. Front-load keywords: garment type comes first, brand last.
- Meta description MUST include: garment type, color/material, occasion (general), AND a Gulf-wide signal (one of: "Khaleeji", "Gulf", "GCC", or 1-2 GCC cities like "Kuwait, Riyadh, Dubai"). Do NOT limit to Kuwait alone.
- Description (body_html) MUST mention: garment type by name (bisht/daraa/etc), fabric, occasion, and naturally weave in 1 Gulf-wide phrase ("Khaleeji heritage", "across the Gulf", "for Kuwait, Saudi, UAE women", etc.). Mention "Atelier Blue Marine" or "Kuwait atelier" once for provenance.
- Use the SKU's poetic name as the brand-distinctive token (Yaqut, Layali, Zumurud, etc.) — this is the canonical product name on Google.

# DESCRIPTION (body_html) — EDITORIAL, NOT GENERIC
- 3 paragraphs separated by \\n\\n. 75-110 words EN. Same range in AR.
- Each paragraph plays a SPECIFIC ROLE:

PARAGRAPH 1 — THE HOOK (the name + the moment).
  Open with a sentence that links the SKU's poetic name to a sensory image of the piece. Don't say "This is a 3-piece set." Say something like: "Yaqut takes its name from the Arabic word for ruby — here, reimagined in deep emerald velvet that shifts in the light."
  Then 1 sentence on the silhouette (cut, drape, presence).

PARAGRAPH 2 — THE CRAFT (concrete details, no fluff).
  Name 2-3 specific construction or material details you can SEE in the photo: embroidery placement, sleeve cut, fabric weight, set composition, contrast pattern, layering.
  Mention "Atelier Blue Marine" or "atelier-made in Kuwait" once — it is the brand's provenance signal.

PARAGRAPH 3 — THE OCCASION + THE WOMAN.
  Name 2-3 specific occasions she will wear this (henna night, wedding reception, family gathering, formal dinner, eid).
  Close with one short, confident sentence on how it makes her feel or how it pairs (e.g. "Pairs naturally with gold or pearl jewellery." / "An effortless choice for the woman who knows what she wants.").
  ⚠️ Do NOT use Ramadan as the default occasion — the piece is year-round.

# SEO PAGE TITLE — STRUCTURED FOR GOOGLE TOP-3
- EN: 55-65 chars. Format: "[Name] [Garment-Type] | [Distinctive Trait + Set Size] | Atelier Blue Marine"
  Examples that rank well:
    · "Yaqut Emerald Bisht Set | Velvet 3-Piece Khaleeji | Atelier Blue Marine"
    · "Layali Daraa | Embroidered Heritage Gown | Atelier Blue Marine Kuwait"
- AR: 55-70 chars. Format: "[الاسم] [نوع القطعة] | [مميز] | أتيليه بلو مارين"
  Example: "ياقوت زمردي طقم بشت | مخمل ٣ قطع خليجي | أتيليه بلو مارين"
- No SKU prefix in SEO title. The pipe "|" separator is what Google likes; use it.

# SEO META DESCRIPTION — A LITTLE SALES ENGINE
- 145-160 chars (use as much of the budget as possible).
- Structure: [Hook with name/garment] + [1-2 specific traits] + [Occasion] + [GCC delivery / atelier signal] + [implicit CTA].
- Examples:
  · EN: "Yaqut Emerald velvet bisht set with embroidered daraa and scarf. Made-to-order in Kuwait, delivered across the Gulf. For weddings and evenings."
  · AR: "طقم بشت ياقوت الزمردي بمخمل أخضر مع درّاعة وشال مطرّز. صنع في أتيليه كويتي، توصيل لكل دول الخليج. للأعراس والسهرات."
- Include 1 GCC signal: "across the Gulf", "GCC delivery", "Kuwait, Saudi, UAE", "Khaleeji women", "في الخليج", "في الكويت والسعودية والإمارات".
- Include 1 atelier/provenance signal: "made-to-order", "atelier-made", "Kuwait atelier", "صنع في الكويت", "أتيليه".

# TAGS — 14-18 LOWERCASE TAGS FOR GCC-WIDE DISCOVERY
- Required mix (in this priority order):
  · garment type (2-3): {bisht, daraa, caftan, abaya, kaftan, set, bisht-set, daraa-set, velvet-bisht}
  · color (1-2 dominant): {green, emerald, burgundy, navy, ivory, gold, black, ...}
  · fabric (1-2): {velvet, silk, chiffon, embroidered, brocade, ...}
  · occasion (2-3, NO ramadan unless capsule): {evening, wedding, henna, eid, gathering, formal, special-occasion, dinner}
  · style (1-2): {heritage, luxury, atelier, made-to-order, modest, traditional}
  · GCC region (REQUIRED, pick 4-5): {khaleeji, gulf, gcc, kuwait, saudi, uae, qatar, dubai, riyadh, jeddah, doha, bahrain, oman, abu-dhabi}
  · 1 intent tag: {shop, online, made-to-order}
- Single-word or short hyphenated. No # or commas inside tags. No duplicates.

# URL HANDLE
- Lowercase, hyphen-separated, ASCII only.
- Format: "${sku.toLowerCase()}-[name-slug]" (use the poetic name from the title + 1-2 garment words).
- Example: "a11-yaqut-emerald-bisht-set"

Return ONLY valid JSON, no backticks, no markdown:
{
  "en": {
    "description": "3 paragraphs separated by \\n\\n",
    "pageTitle": "...",
    "metaDescription": "..."
  },
  "ar": {
    "description": "ثلاث فقرات مفصولة بـ \\n\\n",
    "pageTitle": "...",
    "metaDescription": "..."
  },
  "tags": ["tag1", "tag2", "..."],
  "handle": "${sku.toLowerCase()}-..."
}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  };

  const json = await callGeminiWithRetry(body);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini empty response`);
  const parsed = JSON.parse(text);
  // sanitize handle
  parsed.handle = slugify(parsed.handle || "");
  return parsed;
}

function paragraphsToHtml(text) {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

async function applyPolish(productId, polish) {
  const warnings = [];

  const enRes = await shopify(
    `mutation Update($input: ProductInput!) {
      productUpdate(input: $input) {
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: productId,
        descriptionHtml: paragraphsToHtml(polish.en.description),
        seo: { title: polish.en.pageTitle, description: polish.en.metaDescription },
        tags: polish.tags,
        handle: polish.handle,
      },
    },
  );
  if (enRes.productUpdate.userErrors.length) {
    warnings.push(
      `EN update: ${enRes.productUpdate.userErrors.map((e) => e.message).join(", ")}`,
    );
  }

  // Fetch digests AFTER EN update — the source content changed, so digests are new
  const digests = await fetchTranslatableDigests(productId);

  const translations = [];
  if (digests.body_html) {
    translations.push({
      key: "body_html",
      value: paragraphsToHtml(polish.ar.description),
      locale: "ar",
      translatableContentDigest: digests.body_html,
    });
  }
  if (digests.meta_title) {
    translations.push({
      key: "meta_title",
      value: polish.ar.pageTitle,
      locale: "ar",
      translatableContentDigest: digests.meta_title,
    });
  }
  if (digests.meta_description) {
    translations.push({
      key: "meta_description",
      value: polish.ar.metaDescription,
      locale: "ar",
      translatableContentDigest: digests.meta_description,
    });
  }

  if (translations.length) {
    const arRes = await shopify(
      `mutation TR($resourceId: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $resourceId, translations: $translations) {
          userErrors { field message }
        }
      }`,
      { resourceId: productId, translations },
    );
    if (arRes.translationsRegister.userErrors.length) {
      warnings.push(
        `AR translations: ${arRes.translationsRegister.userErrors.map((e) => e.message).join(", ")}`,
      );
    }
  } else {
    warnings.push("No AR digests found — Arabic translations skipped");
  }

  return { warnings };
}

async function processProduct(p) {
  const sku = extractSku(p.title);
  if (!sku) {
    console.log(`  ⚠ ${p.title} — no SKU, skipping`);
    return { skipped: true };
  }
  const pieces = detectPieces(p.title);

  if (!p.featuredImage?.url) {
    console.log(`  ⚠ ${p.title} — no image, skipping`);
    return { skipped: true };
  }

  console.log(`  • ${p.title}`);
  const img = await fetchImageBase64(p.featuredImage.url);
  const polish = await generatePolish(p.title, sku, pieces, img.base64, img.mimeType);

  console.log(`      handle: ${polish.handle}`);
  console.log(`      EN title: ${polish.en.pageTitle}`);
  console.log(`      EN meta:  ${polish.en.metaDescription}`);
  console.log(`      EN desc:`);
  console.log(polish.en.description.split("\n").map((l) => "        " + l).join("\n"));
  console.log(`      AR title: ${polish.ar.pageTitle}`);
  console.log(`      AR meta:  ${polish.ar.metaDescription}`);
  console.log(`      AR desc:`);
  console.log(polish.ar.description.split("\n").map((l) => "        " + l).join("\n"));
  console.log(`      tags: ${polish.tags.join(", ")}`);

  if (!apply) return { previewed: true };

  const { warnings } = await applyPolish(p.id, polish);
  if (warnings.length) {
    console.log(`      ⚠ ${warnings.join(" | ")}`);
    return { partial: true };
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
  } else if (skuList && skuList.length) {
    scope = products.filter((p) => {
      const sku = extractSku(p.title);
      return sku && skuList.includes(sku.toUpperCase());
    });
    console.log(`Filtered ${products.length} → ${scope.length} via --skus list.`);
  } else if (apply && !all) {
    console.error("Refusing to mass-apply without --all, --skus=, or --product=.");
    process.exit(1);
  }
  if (limit) scope = scope.slice(0, limit);

  console.log(`Processing ${scope.length} product(s)…\n`);
  let ok = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;
  for (const p of scope) {
    try {
      const r = await processProduct(p);
      if (r.ok) ok++;
      else if (r.partial) partial++;
      else if (r.skipped) skipped++;
    } catch (err) {
      failed++;
      console.log(`  ✗ ${p.title}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`\nDone. OK: ${ok}, partial: ${partial}, failed: ${failed}, skipped: ${skipped}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
