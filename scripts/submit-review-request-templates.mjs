#!/usr/bin/env node
/**
 * Submit the post-delivery review-request WhatsApp templates to Meta for
 * approval. Meta typically responds within 1-24 hours.
 *
 * Templates created:
 *   - review_request_ar (Arabic)
 *   - review_request_en (English)
 *
 * Category: MARKETING (requires customer opt-in per WhatsApp policy).
 * Body parameters: {{1}} = first name, {{2}} = product review URL.
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

const TOKEN = process.env.META_ACCESS_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const VERSION = "v21.0";
const ENDPOINT = `https://graph.facebook.com/${VERSION}/${WABA}/message_templates`;

const TEMPLATE_AR = {
  name: "review_request_ar",
  language: "ar",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text:
        "السلام عليكم {{1}} 🌹\n\n" +
        "نتمنى إنك إستمتعتي بقطعتك من Atelier Blue Marine.\n\n" +
        "أتيليه صغير مثلنا يكبر بكلامكم الطيب. ممكن تشاركينا رأيك الصادق بالقطعة اللي طلبتيها؟ وياليت صورة لو تكرمتي 🌷\n\n" +
        "ما تاخذ إلا دقيقة:\n{{2}}\n\n" +
        "شكراً إنك جزء من قصتنا 🌙\nAtelier Blue Marine",
      example: {
        body_text: [
          ["خديجة", "https://bluemarineatelier.com/products/a55-marjan-daraa-set#judgeme_product_reviews"],
        ],
      },
    },
  ],
};

const TEMPLATE_EN = {
  name: "review_request_en",
  language: "en",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text:
        "Hello {{1}} 🌹\n\n" +
        "We hope you're loving your piece from Atelier Blue Marine.\n\n" +
        "A small atelier like ours grows on the words of women like you. Would you share an honest review of what you ordered? A photo is always welcome 🌷\n\n" +
        "It only takes a minute:\n{{2}}\n\n" +
        "Thank you for being part of our story 🌙\nAtelier Blue Marine",
      example: {
        body_text: [
          ["Khadija", "https://bluemarineatelier.com/en-us/products/a55-marjan-daraa-set#judgeme_product_reviews"],
        ],
      },
    },
  ],
};

async function submit(tpl) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tpl),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

for (const tpl of [TEMPLATE_AR, TEMPLATE_EN]) {
  console.log(`\n─── Submitting ${tpl.name} (${tpl.language}) ───`);
  const { ok, status, json } = await submit(tpl);
  if (ok) {
    console.log(`✅ Submitted. id=${json.id} status=${json.status}`);
  } else {
    console.log(`⚠️  ${status} — ${JSON.stringify(json).slice(0, 400)}`);
  }
}

console.log(
  "\nNext: Meta reviews each template (typically 1-24h). Track approval in WhatsApp Business Manager or via getTemplates() in the dashboard.",
);
