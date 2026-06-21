#!/usr/bin/env node
/**
 * Submit the post-purchase Bisht upsell WhatsApp templates to Meta
 * for approval. Meta typically responds within 1-24 hours.
 *
 * Templates created:
 *   - post_purchase_bisht_upsell_ar (Arabic)
 *   - post_purchase_bisht_upsell_en (English)
 *
 * Category: MARKETING (requires customer opt-in per WhatsApp policy).
 * Body parameters: {{1}} = first name, {{2}} = discount URL.
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
  name: "post_purchase_bisht_upsell_ar",
  language: "ar",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text:
        "السلام عليكم {{1}} 🌹\n\n" +
        "وصلتنا طلبيتك من Atelier Blue Marine — شكراً لثقتك فينا.\n\n" +
        "كملي اللوك ببشت من تشكيلتنا، يجي مع درّاعتك بسحر تراثي خاص.\n\n" +
        "🎁 خصم 15٪ خاص لكِ — ساري لمدة 24 ساعة:\n{{2}}\n\n" +
        "الكود يطبَّق تلقائياً عند الضغط على الرابط.\n\n" +
        "نورتينا 🌙\nAtelier Blue Marine",
      example: {
        body_text: [
          ["خديجة", "https://bluemarineatelier.com/discount/MATCHINGBISHT15?redirect=/collections/bisht-set"],
        ],
      },
    },
  ],
};

const TEMPLATE_EN = {
  name: "post_purchase_bisht_upsell_en",
  language: "en",
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text:
        "Hello {{1}} 🌹\n\n" +
        "Thank you for your order from Atelier Blue Marine.\n\n" +
        "Complete the look with a matching bisht from our atelier — designed to be worn with your daraa for weddings, evenings, and special gatherings.\n\n" +
        "🎁 15% off, just for you — valid 24 hours:\n{{2}}\n\n" +
        "The discount applies automatically when you click the link.\n\n" +
        "With love,\nAtelier Blue Marine",
      example: {
        body_text: [
          ["Khadija", "https://bluemarineatelier.com/en-us/discount/MATCHINGBISHT15?redirect=/collections/bisht-set"],
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
  "\nNext: Meta reviews each template (typically 1-24h). Track approval status in WhatsApp Business Manager or by re-running `getTemplates()` in the dashboard.",
);
