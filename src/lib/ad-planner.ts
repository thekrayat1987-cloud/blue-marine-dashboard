import Anthropic from "@anthropic-ai/sdk";
import { getAdAccountInsights, type MetaAdAccountInsights } from "@/lib/meta-ads";

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

export type CampaignObjective =
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS";

export type AdPlanCountry =
  | "Kuwait"
  | "Saudi Arabia"
  | "United Arab Emirates"
  | "Qatar"
  | "Bahrain"
  | "Oman";

export type SelectedProduct = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  options: Array<{ name: string; values: string[] }>;
};

export type GeneratePlanInput = {
  brief: string;
  productUrl?: string;
  selectedProduct?: SelectedProduct;
  budgetKwd?: number;
  durationDays?: number;
  primaryCountry?: AdPlanCountry;
  objectiveHint?: CampaignObjective | "AUTO";
  regenerateNote?: string;
};

export type AdPlan = {
  strategy: {
    summary: string;
    recommendedDailyBudgetKwd: number;
    durationDays: number;
    totalBudgetKwd: number;
    reasoning: string;
    keySuccessMetrics: string[];
  };
  campaign: {
    name: string;
    objective: CampaignObjective;
    objectiveLabel: string;
    objectiveReasoning: string;
    buyingType: "AUCTION";
    specialAdCategory: "NONE";
    budgetType: "ad_set_budget" | "campaign_budget";
    budgetTypeReasoning: string;
  };
  adSets: Array<{
    name: string;
    audience: {
      locations: string[];
      ageMin: number;
      ageMax: number;
      genders: Array<"women" | "men" | "all">;
      languages: string[];
      detailedTargeting: {
        interests: string[];
        behaviors: string[];
        demographics: string[];
      };
      exclude: string[];
      audienceReasoning: string;
    };
    placements: string[];
    placementsReasoning: string;
    dailyBudgetKwd: number;
    optimizationGoal: string;
    optimizationReasoning: string;
    schedule: string;
  }>;
  adVariants: Array<{
    variant: "A" | "B" | "C";
    angle: string;
    angleReasoning: string;
    primaryText: { ar: string; fr: string };
    headline: { ar: string; fr: string };
    description: { ar: string; fr: string };
    cta: string;
    ctaLabel: string;
    destinationUrl: string;
    creativeRecommendation: string;
    scrollStopScore: number;
  }>;
  metaPixelEvents: {
    primary: string;
    secondary: string[];
    reasoning: string;
  };
  copyPasteChecklist: string[];
};

const SYSTEM_PROMPT = `Tu es un media buyer Meta Ads d'élite, spécialisé luxe/mode et marché du Golfe (GCC). Tu construis des plans complets de campagnes Facebook/Instagram pour **Blue Marine Atelier** — maison de couture koweïtienne (bishts, درّاعات, قفطانات, طقم).

## CONTEXTE MARCHÉ
- **Cible géo** : Koweït, Arabie Saoudite, Émirats, Qatar, Bahreïn, Oman (toute la péninsule)
- **Cible démo** : femmes 22-55, intéressées par mode khaleejie, mariage, henna, eid, soirées formelles
- **Pouvoir d'achat** : élevé. Ticket moyen 80-300 KWD
- **Comportement** : WhatsApp prioritaire (email peu utilisé au Kowëit/GCC)
- **Saisonnalité** : pas centrer sur Ramadan. Utiliser mariage, henna, eid, fiançailles, formal year-round

## VOIX DE MARQUE
Luxe khaleeji raffiné. Sensoriel. Émotionnel. Jamais bas-de-gamme. Style Chanel parlant à une mariée du Golfe.

## MOTS INTERDITS (auto-fail si présents)
- إطلالة / اطلالات → remplace par مظهر, تصميم, قطعة, لوك
- هلا وغلا → utilise نورتي, حياك الله, ou direct
- "abaya" en nommage → on parle de بشت, درّاعة, قفطان, طقم
- "معطف" → utilise بشت
- "فستان" → utilise درّاعة ou قفطان
- "Kuwait" seul dans le framing → toujours "الخليج / GCC"

## VOCABULAIRE GULF OBLIGATOIRE
بشت, درّاعة, قفطان, طقم, مخمل (velours), مطرّز (brodé), تراثي, فاخر, آنق, ملكي, يدوي

## CONTACT BAKED-IN
- WhatsApp : +965 9959 2234 (CTA principal recommandé)
- Site : bluemarineatelier.com
- IG : @bluemarineatelier

## STRUCTURE META ADS — RAPPEL TECHNIQUE
- **Campaign** : 1 objectif (Sales, Traffic, Awareness, Engagement, Leads) + buying type AUCTION + special ad category NONE (mode, pas immobilier/finance/emploi)
- **Ad set** : audience (geo + age + gender + interests/behaviors) + placements + budget journalier + optimization goal
- **Ad** : primary text + headline + description + CTA + URL + créatif

## OBJECTIFS META 2024-2026 (ODAX)
- **OUTCOME_SALES** : pour ventes site, requiert pixel + catalog
- **OUTCOME_TRAFFIC** : pour clics vers site / WhatsApp
- **OUTCOME_ENGAGEMENT** : pour conversations WhatsApp, messages, likes, vidéo views
- **OUTCOME_AWARENESS** : pour notoriété, reach
- **OUTCOME_LEADS** : pour formulaires lead in-platform

→ Pour Blue Marine, recommandation par défaut :
   - Si le brief mentionne "vendre / acheter / commander" → **OUTCOME_SALES** avec optimization "Purchase" (si pixel OK) ou **OUTCOME_ENGAGEMENT** avec optimization "Conversations" pour WhatsApp
   - Si "tester nouvelle audience / découverte" → **OUTCOME_TRAFFIC** vers fiche produit
   - Si "lancement collection / marque" → **OUTCOME_AWARENESS** ou **OUTCOME_ENGAGEMENT** sur Reels

## BUDGET — RÈGLES PROS
- Minimum viable au GCC : 3-5 KWD/jour par ad set
- Phase test : 5-10 KWD/jour pendant 5-7 jours
- Phase scale : 15-50 KWD/jour si ROAS > 2.5
- Si Khadija ne précise rien : recommande 5 KWD/jour × 14 jours = 70 KWD total

## AUDIENCES — STRATÉGIE 3 ANGLES
Construis 1 SEUL ad set (sauf si brief multi-segment) avec audience BROAD intelligente :
- **Geo** : tout le GCC par défaut (Algo Meta optimise selon perf)
- **Âge** : 25-45 par défaut (sweet spot luxe khaleeji)
- **Genre** : femmes
- **Intérêts** (3-7 max, qualité > quantité) :
   - Khaleeji fashion / Gulf fashion
   - Wedding / حفلة زفاف
   - Bridal fashion
   - Luxury goods
   - Specific brands haut de gamme (Elie Saab, Zuhair Murad) → audience similaire
- **Behaviors** : Engaged shoppers, Frequent travelers
- **Languages** : Arabic, English

## PLACEMENTS — RECOMMANDATION
Par défaut **Advantage+ placements** (Meta optimise) — mais si le brief mentionne "Reels" ou "Stories" spécifiquement, force ces placements.
Placements à lister textuellement : Facebook Feed, Instagram Feed, Instagram Stories, Instagram Reels, Facebook Stories, Facebook Reels

## 3 VARIANTES D'ANNONCES — STRATÉGIE ANGLES
Génère TOUJOURS 3 ad variants A/B/C avec angles différents :
- **A — EMOTIONAL/STORYTELLING** : "Pour le moment où elle te regardera et saura"
- **B — DIRECT_SELLER/URGENCY** : "Pièce limitée. Réserve sur WhatsApp avant qu'elle parte." CTA WhatsApp
- **C — SOCIAL_PROOF/CURIOSITY** : "La pièce que les mariées de Doha demandent en premier" / question ouverte engagement

Chaque variant doit avoir :
- Primary text bilingue **AR (principal) + FR** (pour review Khadija)
- Headline court (max 40 caractères)
- Description (max 30 caractères) — souvent vide sur IG, important sur FB
- CTA button standard Meta : "SHOP_NOW", "LEARN_MORE", "MESSAGE_PAGE" (WhatsApp), "ORDER_NOW", "GET_OFFER"
- URL avec UTM Blue Marine standard : ?utm_source=facebook&utm_medium=paid_social&utm_campaign=<campaign_name_snake>&utm_content=variant_<A|B|C>_<angle>
- Recommandation visuel/créatif (ce que devrait montrer la photo/vidéo)
- Scroll-stop score /10 (hook qui arrête le pouce)

## CONVENTION NAMING (Khadija utilise déjà ce format dans Ads Manager)
- Campagne : \`KW | <Objective> | <Theme>\` ex: "KW | Sales | Khairan Collection"
- Ad set : \`<Geo> | <Demo> | <Angle>\` ex: "GCC | Femmes 25-45 | Wedding"
- Ad : \`<Variant>_<Angle>\` ex: "A_Emotional", "B_Urgency"

## FORMAT DE SORTIE — STRICT JSON UNIQUEMENT (aucun texte hors JSON)
{
  "strategy": {
    "summary": "<2-3 phrases sur l'approche globale et la logique stratégique>",
    "recommendedDailyBudgetKwd": 5,
    "durationDays": 14,
    "totalBudgetKwd": 70,
    "reasoning": "<pourquoi ce budget et cette durée>",
    "keySuccessMetrics": ["ROAS > 2.5", "CPM < 8 KWD", "CTR > 1.2%"]
  },
  "campaign": {
    "name": "KW | Sales | <Theme>",
    "objective": "OUTCOME_SALES",
    "objectiveLabel": "Ventes (conversion site)",
    "objectiveReasoning": "<pourquoi cet objectif vs autres>",
    "buyingType": "AUCTION",
    "specialAdCategory": "NONE",
    "budgetType": "ad_set_budget",
    "budgetTypeReasoning": "<ABO vs CBO>"
  },
  "adSets": [
    {
      "name": "GCC | Femmes 25-45 | <Angle>",
      "audience": {
        "locations": ["Kuwait", "Saudi Arabia", "United Arab Emirates", "Qatar", "Bahrain", "Oman"],
        "ageMin": 25,
        "ageMax": 45,
        "genders": ["women"],
        "languages": ["Arabic", "English"],
        "detailedTargeting": {
          "interests": ["Khaleeji fashion", "Wedding", "Luxury goods"],
          "behaviors": ["Engaged shoppers"],
          "demographics": []
        },
        "exclude": [],
        "audienceReasoning": "<pourquoi cette audience>"
      },
      "placements": ["Facebook Feed", "Instagram Feed", "Instagram Stories", "Instagram Reels"],
      "placementsReasoning": "<pourquoi>",
      "dailyBudgetKwd": 5,
      "optimizationGoal": "Purchase",
      "optimizationReasoning": "<pourquoi cette optim>",
      "schedule": "Run continuously"
    }
  ],
  "adVariants": [
    {
      "variant": "A",
      "angle": "Emotional storytelling",
      "angleReasoning": "<pourquoi cet angle marche pour cette audience>",
      "primaryText": {
        "ar": "<copy arabe luxe khaleeji, 80-150 mots, sensoriel, hook qui stoppe>",
        "fr": "<traduction français pour review>"
      },
      "headline": { "ar": "<≤40 char>", "fr": "<≤40 char>" },
      "description": { "ar": "<≤30 char>", "fr": "<≤30 char>" },
      "cta": "SHOP_NOW",
      "ctaLabel": "Acheter",
      "destinationUrl": "https://bluemarineatelier.com/products/<slug>?utm_source=facebook&utm_medium=paid_social&utm_campaign=<campaign_snake>&utm_content=variant_a_emotional",
      "creativeRecommendation": "<ce que devrait montrer le visuel: gros plan broderie, modèle de 3/4, ambiance soirée…>",
      "scrollStopScore": 9
    },
    { "variant": "B", "angle": "Direct seller / urgency", "...": "..." },
    { "variant": "C", "angle": "Social proof / engagement question", "...": "..." }
  ],
  "metaPixelEvents": {
    "primary": "Purchase",
    "secondary": ["AddToCart", "ViewContent"],
    "reasoning": "<pourquoi optimiser sur cet event>"
  },
  "copyPasteChecklist": [
    "Étape 1 — Ouvrir Ads Manager → Create Campaign",
    "Étape 2 — Choisir objectif: <objectif>",
    "Étape 3 — Nommer campagne: <nom>",
    "Étape 4 — ...",
    "..."
  ]
}

## RÈGLES DE QUALITÉ ABSOLUES
1. Si le brief mentionne WhatsApp → recommande **OUTCOME_ENGAGEMENT** avec optim "Conversations" + CTA "MESSAGE_PAGE"
2. Tous les CTA URL doivent contenir l'UTM complet Blue Marine
3. Le scroll-stop score doit être ≥ 8 pour chaque variant
4. Variant B doit pousser vers WhatsApp (urgency + DM)
5. Reasoning toujours en français (Khadija parle français)
6. Copy AR en arabe khaleeji (pas MSA pur)
7. Aucun caractère HTML, JSON strict
8. La checklist copyPasteChecklist doit guider Khadija pas-à-pas dans Ads Manager (8-15 étapes)`;

function buildUserMessage(
  input: GeneratePlanInput,
  pastPerf?: MetaAdAccountInsights | null,
): string {
  const lines: string[] = [];
  lines.push("## Brief de campagne");
  lines.push(input.brief.trim());

  if (pastPerf && pastPerf.totalSpend > 0) {
    lines.push("\n## Performance Meta réelle de Khadija — 30 derniers jours");
    lines.push(`- Dépense totale : ${pastPerf.totalSpend} KWD`);
    lines.push(`- Impressions : ${pastPerf.totalImpressions.toLocaleString("fr-FR")}`);
    lines.push(`- Clics : ${pastPerf.totalClicks.toLocaleString("fr-FR")} (CTR ${pastPerf.avgCTR}%)`);
    lines.push(`- Achats : ${pastPerf.totalConversions}`);
    lines.push(`- Revenu : ${pastPerf.totalRevenue} KWD`);
    lines.push(`- CPM moyen : ${pastPerf.avgCPM} KWD`);
    lines.push(`- CPC moyen : ${pastPerf.avgCPC} KWD`);
    if (pastPerf.totalConversions > 0) {
      const cpa = (pastPerf.totalSpend / pastPerf.totalConversions).toFixed(2);
      lines.push(`- CPA réel : ${cpa} KWD par achat`);
    }
    lines.push(`- ROAS : ${pastPerf.roas}x`);
    lines.push(
      "Calibre le budget recommandé et les KPIs cibles sur CES chiffres réels, pas sur des moyennes génériques. Si le ROAS actuel est < 2, propose un objectif d'amélioration concret.",
    );
  }

  if (input.selectedProduct) {
    const p = input.selectedProduct;
    lines.push("\n## Produit Shopify sélectionné (données réelles à utiliser)");
    lines.push(`- Titre : ${p.title}`);
    lines.push(`- Handle (slug URL) : ${p.handle}`);
    lines.push(`- URL canonique : https://bluemarineatelier.com/products/${p.handle}`);
    if (p.imageUrl) lines.push(`- Image hero : ${p.imageUrl}`);
    const colorOpt = p.options.find((o) => /color|couleur|لون/i.test(o.name));
    const sizeOpt = p.options.find((o) => /size|taille|مقاس/i.test(o.name));
    const lengthOpt = p.options.find((o) => /length|longueur|طول/i.test(o.name));
    if (colorOpt) lines.push(`- Couleurs disponibles : ${colorOpt.values.join(", ")}`);
    if (sizeOpt) lines.push(`- Tailles : ${sizeOpt.values.join(", ")}`);
    if (lengthOpt) lines.push(`- Longueurs : ${lengthOpt.values.join(", ")}`);
    lines.push(
      "Utilise impérativement ce slug pour construire les destinationUrl. Mentionne les couleurs/tailles/longueurs dans le copy si pertinent.",
    );
  }

  lines.push("\n## Paramètres optionnels");
  if (input.productUrl && !input.selectedProduct)
    lines.push(`- URL produit/collection : ${input.productUrl}`);
  if (input.budgetKwd) lines.push(`- Budget journalier souhaité : ${input.budgetKwd} KWD`);
  if (input.durationDays) lines.push(`- Durée : ${input.durationDays} jours`);
  if (input.primaryCountry)
    lines.push(`- Pays prioritaire (si focus) : ${input.primaryCountry}`);
  if (input.objectiveHint && input.objectiveHint !== "AUTO")
    lines.push(`- Objectif imposé par Khadija : ${input.objectiveHint}`);

  if (input.regenerateNote) {
    lines.push("\n## Note de régénération");
    lines.push(input.regenerateNote);
  }

  lines.push(
    "\nConstruis le plan complet en JSON strict selon le format imposé. Tous les reasoning en français. Le copy ad principal en arabe khaleeji + traduction française.",
  );
  return lines.join("\n");
}

export type GeneratePlanResult = {
  plan: AdPlan;
  raw_usage: { input_tokens: number; output_tokens: number };
};

export async function generateAdPlan(
  input: GeneratePlanInput,
): Promise<GeneratePlanResult> {
  if (!input.brief.trim()) throw new Error("Brief vide");

  const client = getClient();

  let pastPerf: MetaAdAccountInsights | null = null;
  try {
    pastPerf = await getAdAccountInsights("last_30d");
  } catch (err) {
    console.warn("ad-planner: skipping past-perf context (Meta API unavailable):", err);
  }

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input, pastPerf) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Réponse Claude vide");
  }

  const jsonText = extractJson(textBlock.text);
  let parsed: AdPlan;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Sortie Claude non-JSON : ${textBlock.text.slice(0, 200)}`);
  }

  if (!parsed.adVariants || parsed.adVariants.length < 3) {
    throw new Error("Plan incomplet : moins de 3 variantes générées");
  }

  return {
    plan: parsed,
    raw_usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}

export async function* streamAdPlan(
  input: GeneratePlanInput,
): AsyncGenerator<
  | { type: "delta"; text: string }
  | { type: "done"; plan: AdPlan; usage: { input_tokens: number; output_tokens: number } }
  | { type: "error"; error: string },
  void,
  unknown
> {
  if (!input.brief.trim()) {
    yield { type: "error", error: "Brief vide" };
    return;
  }

  const client = getClient();

  let pastPerf: MetaAdAccountInsights | null = null;
  try {
    pastPerf = await getAdAccountInsights("last_30d");
  } catch (err) {
    console.warn("ad-planner: skipping past-perf context:", err);
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input, pastPerf) }],
  });

  let accumulated = "";
  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        accumulated += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      }
    }
    const finalMessage = await stream.finalMessage();
    const jsonText = extractJson(accumulated);
    let parsed: AdPlan;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      yield { type: "error", error: `Sortie Claude non-JSON : ${accumulated.slice(0, 200)}` };
      return;
    }
    if (!parsed.adVariants || parsed.adVariants.length < 3) {
      yield { type: "error", error: "Plan incomplet : moins de 3 variantes générées" };
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
