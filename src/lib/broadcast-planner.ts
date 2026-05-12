import Anthropic from "@anthropic-ai/sdk";
import type { SegmentPreview, SendTimeSignal } from "@/lib/shopify-customers";

const MODEL = "claude-sonnet-4-6";

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquant dans .env.local. Ajoute ANTHROPIC_API_KEY=sk-ant-... dans dashboard/.env.local",
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export type CampaignType =
  | "new_collection"
  | "promo_flash"
  | "restock"
  | "seasonal_occasion"
  | "vip_exclusive"
  | "recovery";

export type SegmentTypeId =
  | "vip"
  | "inactive_60"
  | "inactive_90"
  | "by_country"
  | "by_product_tag"
  | "all_buyers";

export type Tone = "luxe_sobre" | "urgence" | "chaleureux" | "exclusif";

export type SelectedProductLite = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  priceKwd?: number;
};

export type GenerateBroadcastInput = {
  campaignType: CampaignType;
  segmentTypeId: SegmentTypeId;
  segmentPreview: SegmentPreview | null;
  segmentDescription: string;
  sendTimeSignal?: SendTimeSignal | null;
  occasion?: string;
  promoCode?: string;
  promoDeadline?: string;
  promoDiscountPct?: number;
  tone: Tone;
  selectedProduct?: SelectedProductLite;
  customNotes?: string;
};

export type BroadcastPlan = {
  strategy: {
    summary: string;
    whyNow: string;
    audienceFit: string;
    expectedConversionPct: number;
    estimatedRevenueKwd: number;
    bestSendTime: {
      dayLabel: string;
      hour24: number;
      timezoneLabel: string;
      reasoning: string;
    };
    successMetrics: string[];
  };
  segment: {
    label: string;
    shopifyQuery: string;
    shopifyFlowSuggestion: {
      triggerLabel: string;
      conditions: string[];
      action: string;
      tagToApply: string;
      humanSteps: string[];
    };
  };
  variants: Array<{
    variant: "A" | "B";
    angle: string;
    angleReasoning: string;
    superlemonTemplate: {
      templateName: string;
      category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
      type: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
      languageFr: string;
      languageAr: string;
      headerFr: string;
      headerAr: string;
      bodyFr: string;
      bodyAr: string;
      footerFr: string;
      footerAr: string;
      variables: Array<{ index: number; label: string; exampleValue: string }>;
      buttonLabel: string;
      buttonUrl: string;
    };
    imagePrompt: {
      fr: string;
      ar: string;
      format: "square_1080" | "story_9_16" | "whatsapp_header";
      moodKeywords: string[];
    };
  }>;
  copyPasteChecklist: string[];
};

const SYSTEM_PROMPT = `Tu es un strategist marketing WhatsApp d'élite, spécialisé luxe khaleeji et marché du Golfe (GCC). Tu construis des broadcasts WhatsApp pour **Blue Marine Atelier** — maison de couture koweïtienne (bishts, درّاعات, قفطانات, طقم) — diffusés via l'app SuperLemon.

## CONTEXTE MARCHÉ
- **Cible géo** : Koweït, KSA, EAU, Qatar, Bahreïn, Oman
- **Cible démo** : femmes 22-55, intéressées par mode khaleejie, mariage, henna, eid, soirées formelles
- **Pouvoir d'achat** : élevé. Ticket moyen 80-300 KWD
- **WhatsApp** : canal principal au GCC (email peu utilisé)
- **Saisonnalité** : pas centrer sur Ramadan. Mariage, henna, eid, fiançailles, formal year-round

## VOIX DE MARQUE
Luxe khaleeji raffiné. Sensoriel. Émotionnel. Jamais bas-de-gamme.
Style : une mariée du Golfe reçoit un message d'une boutique haut de gamme qui la connaît personnellement.

## MOTS INTERDITS (auto-fail si présents)
- إطلالة / اطلالات → remplace par مظهر, تصميم, قطعة, لوك
- هلا وغلا → utilise نورتي, حياك الله, ou direct
- "abaya" → on parle de بشت, درّاعة, قفطان, طقم
- "معطف" → utilise بشت
- "فستان" → utilise درّاعة ou قفطان
- "Kuwait" seul dans le framing → toujours "الخليج / GCC"

## VOCABULAIRE GULF OBLIGATOIRE
بشت, درّاعة, قفطان, طقم, مخمل (velours), مطرّز (brodé), تراثي, فاخر, آنق, ملكي, يدوي, ناعم, راقي

## CONTACT BAKED-IN
- WhatsApp : +965 99592234
- Site : bluemarineatelier.com
- IG : @bluemarineatelier

## FORMAT WHATSAPP TEMPLATE SUPERLEMON
SuperLemon (et l'API WhatsApp Business) impose un format strict :
- **Template Name** : lowercase, underscores, numéro (ex: \`new_collection_eid_vip_2026_05\`)
- **Category** : MARKETING (promo, broadcast), UTILITY (statut, livraison), AUTHENTICATION (OTP)
- **Type** : TEXT (texte seul), IMAGE (photo en header), VIDEO, DOCUMENT
- **Language** : code langue (fr ou ar) — on génère LES DEUX
- **Header** (optional, 60 char max) : titre court accrocheur
- **Body** : message principal (1024 char max), variables \`{{1}}\` \`{{2}}\` numérotées
- **Footer** (optional, 60 char) : signature ou disclaimer
- **Button** : CTA Quick-Reply ou URL (recommandé : URL vers WhatsApp/site)

## VARIABLES DYNAMIQUES — RÈGLES
- \`{{1}}\` = prénom client (toujours, si possible)
- \`{{2}}\` = code promo OU produit OU date deadline
- Pas plus de 3 variables (sinon Meta rejette le template)
- Chaque variable doit avoir un \`exampleValue\` réaliste pour validation

## ANGLES A/B — STRATÉGIE
Génère TOUJOURS 2 variants :
- **A — ÉMOTIONNEL / STORYTELLING** : connexion intime, exclusivité, sensation. Header doux. Body sensoriel.
- **B — URGENCE / DIRECT** : deadline, scarcité, code promo, action immédiate. Header punchy. CTA urgent.

Chaque variant : copy AR principal (khaleeji, pas MSA), copy FR pour review Khadija, image prompt textuel (pour Canva/Midjourney/Gemini, PAS de génération auto).

## PROMPT VISUEL (imagePrompt)
Brief textuel descriptif (50-100 mots), suffisamment précis pour qu'un designer ou Midjourney puisse créer l'image :
- Composition (cadrage, plans, modèle ou produit nu)
- Couleurs (palette précise, ex : "fond bordeaux profond #6B0F1A, accent or vieilli")
- Texte d'overlay (ce qui doit être écrit, dans quelle police suggérée : Cormorant Garamond pour serif luxe, Amiri pour arabe)
- Ambiance / mood
- Format final (square_1080 pour post / story_9_16 pour status / whatsapp_header pour SuperLemon header)
- Pas d'AI prompt magique, juste un brief créatif clair

## SHOPIFY FLOW SUGGESTION
Shopify Flow permet d'AUTOMATISER le tagging de clients. Tu suggères un workflow réaliste :
- **Trigger** : événement Shopify (ex: "Customer placed order", "Order created with metafield X")
- **Conditions** : critères mesurables (ex: total spent > 200, order count >= 2, days since last order > 60)
- **Action** : "Add customer tag: <tag>"
- **humanSteps** : 5-8 étapes pas-à-pas pour que Khadija recrée le workflow dans l'UI Shopify Flow (Shopify admin → Apps → Shopify Flow → Create workflow)

## CALCUL STRATÉGIQUE
- **expectedConversionPct** : 5-15% (WhatsApp broadcast luxe converti 8-12% en moyenne). Si segment VIP/inactifs, vise plutôt 10-15%. Si broadcast large, 5-8%.
- **estimatedRevenueKwd** : count_segment × conversionPct/100 × avgSpentKwd_du_segment
- **bestSendTime** : utilise le signal sendTimeSignal du brief si fourni. Sinon recommande samedi 20h heure KW (peak GCC luxe shopping).

## FORMAT DE SORTIE — STRICT JSON UNIQUEMENT (aucun texte hors JSON)

{
  "strategy": {
    "summary": "<2 phrases sur l'approche>",
    "whyNow": "<pourquoi ce moment / ce timing>",
    "audienceFit": "<pourquoi ce segment colle à cette offre>",
    "expectedConversionPct": 10,
    "estimatedRevenueKwd": 6800,
    "bestSendTime": {
      "dayLabel": "samedi",
      "hour24": 20,
      "timezoneLabel": "heure du Koweït (UTC+3)",
      "reasoning": "<pourquoi cet horaire>"
    },
    "successMetrics": ["Taux d'ouverture > 80%", "Taux de clic > 20%", "Conversion > 10%"]
  },
  "segment": {
    "label": "<libellé court ex: VIP inactives depuis 60+ jours>",
    "shopifyQuery": "<la query Shopify exacte>",
    "shopifyFlowSuggestion": {
      "triggerLabel": "<ex: Customer order created>",
      "conditions": ["<condition 1>", "<condition 2>"],
      "action": "Add customer tag: <tag>",
      "tagToApply": "vip-inactive-60d",
      "humanSteps": [
        "Ouvre Shopify Admin → Apps → Shopify Flow",
        "Clique Create workflow",
        "..."
      ]
    }
  },
  "variants": [
    {
      "variant": "A",
      "angle": "Émotionnel / storytelling",
      "angleReasoning": "<pourquoi cet angle>",
      "superlemonTemplate": {
        "templateName": "new_collection_vip_emotional_2026_05",
        "category": "MARKETING",
        "type": "TEXT",
        "languageFr": "fr",
        "languageAr": "ar",
        "headerFr": "Pour vous, en premier",
        "headerAr": "نورّتيها قبل غيرك",
        "bodyFr": "<140-300 mots FR>",
        "bodyAr": "<140-300 mots AR khaleeji>",
        "footerFr": "Blue Marine Atelier · WhatsApp +965 99592234",
        "footerAr": "بلو مارين أتولييه · واتساب +965 99592234",
        "variables": [
          { "index": 1, "label": "Prénom client", "exampleValue": "نورا" },
          { "index": 2, "label": "Code promo", "exampleValue": "VIP25" }
        ],
        "buttonLabel": "Découvrir",
        "buttonUrl": "https://bluemarineatelier.com/collections/<slug>?utm_source=whatsapp&utm_medium=broadcast&utm_campaign=<campaign_snake>&utm_content=variant_a"
      },
      "imagePrompt": {
        "fr": "<brief créatif détaillé en français, 50-100 mots>",
        "ar": "<même brief en arabe, pour Khadija>",
        "format": "square_1080",
        "moodKeywords": ["luxe", "intime", "or", "soirée"]
      }
    },
    {
      "variant": "B",
      "angle": "Urgence / direct seller",
      "...": "..."
    }
  ],
  "copyPasteChecklist": [
    "Étape 1 — Ouvrir SuperLemon → Templates → Create Template",
    "Étape 2 — Coller le Template Name : <name>",
    "...",
    "Étape N — Tester l'envoi sur ton numéro avant broadcast"
  ]
}

## RÈGLES DE QUALITÉ ABSOLUES
1. Aucun mot interdit dans tout le JSON (FR ou AR)
2. Body AR en khaleeji authentique (vocab obligatoire utilisé naturellement)
3. \`templateName\` lowercase + underscores + date YYYY_MM (Meta refuse maj et tirets)
4. Variables \`{{1}}\` etc. numérotées et présentes dans le tableau \`variables\`
5. \`buttonUrl\` contient UTM Blue Marine complet
6. \`shopifyQuery\` doit être copiable tel quel dans Shopify Admin → Customers → recherche
7. \`humanSteps\` du Flow : 5-8 étapes ULTRA précises (Khadija n'est pas développeuse)
8. \`copyPasteChecklist\` : 8-12 étapes pour SuperLemon (Khadija a déjà installé l'app)
9. \`imagePrompt.fr\` doit être assez détaillé pour qu'un designer puisse exécuter SANS questions
10. Reasoning toujours en français
11. JSON strict, aucun texte hors JSON, aucun markdown fence`;

function buildUserMessage(input: GenerateBroadcastInput): string {
  const lines: string[] = [];
  lines.push("## Brief broadcast");
  lines.push(`- Type de campagne : ${labelCampaignType(input.campaignType)}`);
  lines.push(`- Segment client cible : ${input.segmentDescription}`);
  lines.push(`- Ton : ${labelTone(input.tone)}`);
  if (input.occasion) lines.push(`- Occasion / contexte : ${input.occasion}`);
  if (input.promoCode) lines.push(`- Code promo : ${input.promoCode}`);
  if (input.promoDiscountPct) lines.push(`- Remise : ${input.promoDiscountPct}%`);
  if (input.promoDeadline) lines.push(`- Deadline : ${input.promoDeadline}`);
  if (input.customNotes) lines.push(`- Notes Khadija : ${input.customNotes}`);

  if (input.segmentPreview) {
    const p = input.segmentPreview;
    lines.push("\n## Données segment Shopify (réelles, à utiliser pour calibrer)");
    lines.push(`- Nombre de clientes correspondant : ${p.count}`);
    lines.push(`- Dépense moyenne : ${p.avgSpentKwd} KWD`);
    lines.push(`- Dépense totale historique du segment : ${p.totalSpentKwd} KWD`);
    if (p.daysSinceLastOrderMedian !== null) {
      lines.push(`- Médiane jours depuis dernière commande : ${p.daysSinceLastOrderMedian}`);
    }
    if (p.topCountries.length > 0) {
      lines.push(
        `- Répartition pays : ${p.topCountries.map((c) => `${c.code}=${c.count}`).join(", ")}`,
      );
    }
    lines.push(`- Query Shopify correspondante : ${p.shopifyQuery}`);
    lines.push(
      "Utilise ces chiffres RÉELS pour estimer le CA potentiel et calibrer le ton.",
    );
  }

  if (input.sendTimeSignal && input.sendTimeSignal.topHoursKwTime.length > 0) {
    lines.push("\n## Signal heure optimale (depuis l'historique de commandes Shopify, 180j)");
    for (const t of input.sendTimeSignal.topHoursKwTime) {
      lines.push(`- ${t.dayLabel} ${t.hour}h heure KW → ${t.orders} commandes`);
    }
    lines.push("Recommande bestSendTime à partir de CES données réelles.");
  }

  if (input.selectedProduct) {
    const p = input.selectedProduct;
    lines.push("\n## Produit / collection mise en avant");
    lines.push(`- Titre : ${p.title}`);
    lines.push(`- URL : https://bluemarineatelier.com/products/${p.handle}`);
    if (p.imageUrl) lines.push(`- Image : ${p.imageUrl}`);
    if (p.priceKwd) lines.push(`- Prix : ${p.priceKwd} KWD`);
    lines.push("Utilise ce handle pour buttonUrl et mentionne le produit naturellement dans le body.");
  }

  lines.push(
    "\nConstruis le plan complet en JSON strict selon le format imposé. Body AR en khaleeji authentique. Reasoning en français.",
  );
  return lines.join("\n");
}

function labelCampaignType(t: CampaignType): string {
  switch (t) {
    case "new_collection":
      return "Annonce nouvelle collection";
    case "promo_flash":
      return "Promotion flash (code + deadline)";
    case "restock":
      return "Alerte restock produit populaire";
    case "seasonal_occasion":
      return "Occasion saisonnière (Eid, mariage, henna, etc.)";
    case "vip_exclusive":
      return "Accès anticipé / exclu VIP";
    case "recovery":
      return "Réactivation clientes inactives";
  }
}

function labelTone(t: Tone): string {
  switch (t) {
    case "luxe_sobre":
      return "luxe sobre / sensoriel";
    case "urgence":
      return "urgence / direct";
    case "chaleureux":
      return "chaleureux / personnel";
    case "exclusif":
      return "exclusif / VIP confidentiel";
  }
}

export async function* streamBroadcastPlan(
  input: GenerateBroadcastInput,
): AsyncGenerator<
  | { type: "delta"; text: string }
  | { type: "done"; plan: BroadcastPlan; usage: { input_tokens: number; output_tokens: number } }
  | { type: "error"; error: string },
  void,
  unknown
> {
  const client = getClient();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  let accumulated = "";
  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        accumulated += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      }
    }
    const finalMessage = await stream.finalMessage();
    const jsonText = extractJson(accumulated);
    let parsed: BroadcastPlan;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      yield { type: "error", error: `Sortie Claude non-JSON : ${accumulated.slice(0, 200)}` };
      return;
    }
    if (!parsed.variants || parsed.variants.length < 2) {
      yield { type: "error", error: "Plan incomplet : moins de 2 variantes générées" };
      return;
    }
    yield {
      type: "done",
      plan: parsed,
      usage: {
        input_tokens: finalMessage.usage.input_tokens,
        output_tokens: finalMessage.usage.output_tokens,
      },
    };
  } catch (err) {
    yield {
      type: "error",
      error: err instanceof Error ? err.message : "Erreur de streaming",
    };
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}
