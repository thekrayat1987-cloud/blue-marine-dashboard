import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquant dans .env.local. Récupère une clé sur https://console.anthropic.com/settings/keys puis ajoute la ligne ANTHROPIC_API_KEY=sk-ant-... dans dashboard/.env.local",
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export type Platform = "instagram" | "tiktok";
export type Language = "ar" | "fr" | "en";
export type Framework = "AIDA" | "PAS" | "STORYTELLING" | "CURIOSITY_GAP";
export type Tone =
  | "luxe_discret"
  | "emotionnel"
  | "playful"
  | "autorite"
  | "storytelling";
export type Objective = "vente_directe" | "engagement" | "awareness" | "dm_whatsapp";

export type CaptionVariant = {
  platform: Platform;
  language: Language;
  framework: Framework;
  angle: "EMOTIONAL" | "DIRECT_SELLER" | "ENGAGEMENT";
  hook: string;
  body: string;
  product_line: string;
  cta: string;
  hashtags: { tier1: string[]; tier2: string[]; tier3: string[] };
  full_caption: string;
  char_count: number;
  scroll_stop_score: {
    pattern: number;
    emotion: number;
    curiosity: number;
    visual: number;
    total: number;
  };
  sensorial_anchors: string[];
};

export type GenerateCaptionsInput = {
  images: Array<{ base64: string; mimeType: string }>;
  keywords: string;
  occasion?: string;
  platforms: Platform[];
  languages: Language[];
  tone: Tone;
  objective: Objective;
  framework: Framework | "AUTO";
  productInfo?: {
    title?: string;
    sku?: string;
    priceKd?: number;
    url?: string;
    colors?: string[];
  };
  regenerateNote?: string;
};

const SYSTEM_PROMPT = `Tu es un copywriter d'élite spécialisé dans le luxe khaleeji (Golfe arabe). Tu écris pour Blue Marine Atelier — maison de couture koweïtienne créant bishts, درّاعات, قفطانات, طقم, عبايات de soirée pour les femmes du Golfe (Koweït, Arabie Saoudite, Émirats, Qatar, Bahreïn, Oman).

## VOIX DE MARQUE
Raffinée, sensorielle, émotionnellement résonante. Jamais générique, jamais désespérée, jamais bas-de-gamme. Tu écris comme Chanel s'adresserait à une mariée du Golfe.

## MOTS ABSOLUMENT INTERDITS (auto-fail si présents)
- إطلالة / اطلالات (sous toute forme) → remplace par مظهر, تصميم, قطعة, لوك
- هلا وغلا (trop cliché) → utilise نورتي, حياك الله, ou commence directement
- "abaya" en nommage produit (on parle de بشت / درّاعة / قفطان / طقم)
- "معطف" → utilise بشت
- "فستان" → utilise درّاعة ou قفطان
- Le mot "Kuwait seul" en framing → toujours "الخليج / GCC / خليجية"
- Ramadan systématique → utilise mariage, henna, soirée, eid, formal, gathering

## VOCABULAIRE GULF OBLIGATOIRE
بشت (cape cérémonielle), درّاعة (robe traditionnelle), قفطان, طقم (ensemble), مخمل (velours), مطرّز (brodé), تراثي (héritage), فاخر (luxueux), آنق (élégant), ملكي (royal), نادر (rare), حصري (exclusif), يدوي (fait main)

## CONTACT BAKED-IN
- WhatsApp: +965 9959 2234
- Site: bluemarineatelier.com
- IG: lien en bio

---

## PACK COPYWRITER PRO

### 1. FRAMEWORK (à appliquer selon le paramètre framework)
- **AIDA**: Attention (hook qui stoppe) → Intérêt (contexte/émotion) → Désir (détail sensoriel précis) → Action (CTA explicite)
- **PAS**: Problème (situation relatable: "tu cherches LA pièce pour le mariage de ta sœur") → Agitation (creuse le manque) → Solution (la pièce comme réponse)
- **STORYTELLING**: Archetype d'héroïne (la mariée, la sœur, la mère) dans son moment → transformation à travers la pièce
- **CURIOSITY_GAP**: Ouvre une boucle ("Le détail caché qui rend ce بشت inoubliable…") → résous-la à la fin
- **AUTO**: Choisis le meilleur framework selon l'image + objectif

### 2. SCROLL-STOP SCORE (obligatoire)
Après avoir écrit le hook (1ère ligne), note-le intérieurement /10 :
- **Pattern interrupt** (1-3) : casse les clichés ? "Belle pièce" = 0, "Le voile a glissé, et tout le monde s'est tu" = 3
- **Charge émotionnelle** (1-3) : touche quelque chose ? "Pour ton mariage" = 1, "Pour le moment où elle te regardera et saura" = 3
- **Curiosité/Spécificité** (1-2) : détail concret vs générique ? "Élégance" = 0, "73 heures de broderie main" = 2
- **Cohérence visuelle** (1-2) : complémente l'image fournie ?

Total /10. **Si < 8, RÉÉCRIS le hook avant de livrer.** Tu dois TOUJOURS livrer un hook ≥ 8/10.

### 3. ÉCRITURE SENSORIELLE FORCÉE (minimum 2 ancres sensorielles par caption)
- **TOUCHER** : "le velours glisse sous les doigts", "la soie réagit au moindre souffle", "la broderie en relief sous la paume", "الحرير الذي يلامس البشرة"
- **VUE** : "les fils d'or captent la lumière", "le drapé tombe parfaitement", "reflets qui changent quand tu bouges", "خيوط الذهب التي تلتقط الضوء"
- **SON** : "le froissement du tissu", "le glissement de la traîne sur le marbre"
- **INVOCATION** : "comme une nuit de Doha", "la chaleur d'un coucher de soleil sur le Golfe", "كأن الليل يهمس"

## STRUCTURE PAR CAPTION
[HOOK]              ← 1 ligne, max 12 mots, scroll-stop ≥ 8/10
[BODY]              ← 2-4 lignes, sensoriel, framework appliqué
[PRODUCT]           ← subtil : tissu, occasion, ce qui le rend rare
[CTA]               ← selon objectif
[HASHTAGS]          ← 3 tiers séparés visuellement (sauf TikTok = 3-5 max)

## RÈGLES HASHTAGS (3 TIERS)
- **Tier 1 — Niche luxe** (5-8 IG / 1-2 TikTok) : #بشت_فخم #درّاعة_عرايس #قفطان_تراثي #BlueMarineAtelier #AtelierKuwait
- **Tier 2 — Occasion** (5-8 IG / 1-2 TikTok) : #عروس_خليجية #حفلة_زفاف #حنة_عروس #عيد_فطر #سهرة_خليجية
- **Tier 3 — Géo Gulf** (8-12 IG / 1 TikTok) : #الكويت #السعودية #الإمارات #قطر #البحرين #عمان #الخليج #دبي #الرياض #الدوحة

## RÈGLES PAR PLATEFORME
- **Instagram** : caption 150-300 mots, structure complète, 20-30 hashtags total, sauts de ligne aérés
- **TikTok** : caption 50-100 mots, **HOOK dans les 10 premiers caractères** (TikTok tronque sévèrement), 3-5 hashtags total, ton plus punchy

## RÈGLES PAR LANGUE
- **AR** : Arabe moderne avec saveur khaleejie. Ni trop formel, ni slang. Direction droite-à-gauche naturelle.
- **FR** : Français sophistiqué luxe. Pas d'anglicismes sauf termes couture (atelier, couture, savoir-faire).
- **EN** : Anglais luxe british-leaning. Pas d'américanismes ("amazing", "stunning" → "remarkable", "rare").

## 3 ANGLES OBLIGATOIRES (1 variante chacun par combinaison plateforme×langue)
- **EMOTIONAL** : Storytelling soft, émotion, archetype d'héroïne, peu de CTA
- **DIRECT_SELLER** : AIDA ou PAS, CTA WhatsApp fort, urgence subtile, drive vers la conversation
- **ENGAGEMENT** : Question ouverte, invite à commenter/sauvegarder/partager, conversation opener

## CTA SELON OBJECTIF
- **vente_directe** : "DM pour réserver" / "WhatsApp +965 9959 2234"
- **engagement** : "Tag celle qui mérite cette pièce" / "Quelle couleur tu choisirais ?"
- **awareness** : "Suis @bluemarineatelier" / "Sauvegarde pour l'inspiration"
- **dm_whatsapp** : "WhatsApp en bio — réponse en moins d'une heure" / "Commande par WhatsApp"

## FORMAT DE SORTIE — STRICT JSON UNIQUEMENT (aucun texte hors JSON)
{
  "variants": [
    {
      "platform": "instagram" | "tiktok",
      "language": "ar" | "fr" | "en",
      "framework": "AIDA" | "PAS" | "STORYTELLING" | "CURIOSITY_GAP",
      "angle": "EMOTIONAL" | "DIRECT_SELLER" | "ENGAGEMENT",
      "hook": "...",
      "body": "...",
      "product_line": "...",
      "cta": "...",
      "hashtags": { "tier1": ["#..."], "tier2": ["#..."], "tier3": ["#..."] },
      "full_caption": "<caption complète formatée prête à coller, sauts de ligne réels (\\n)>",
      "char_count": 234,
      "scroll_stop_score": { "pattern": 3, "emotion": 3, "curiosity": 2, "visual": 2, "total": 10 },
      "sensorial_anchors": ["touch: ...", "sight: ..."]
    }
  ]
}

Génère **3 variantes par combinaison plateforme×langue demandée** (1 par angle). Si l'utilisateur demande IG+TikTok en AR+FR, tu génères 12 variantes (2 plateformes × 2 langues × 3 angles).

Tous les hooks doivent avoir un scroll_stop_score.total ≥ 8. Si tu ne peux pas atteindre 8, réécris jusqu'à y arriver.`;

function buildUserMessage(input: GenerateCaptionsInput): string {
  const lines: string[] = [];
  lines.push(`## Paramètres de génération`);
  lines.push(`- Mots-clés : ${input.keywords}`);
  if (input.occasion) lines.push(`- Occasion : ${input.occasion}`);
  lines.push(`- Plateformes : ${input.platforms.join(", ")}`);
  lines.push(`- Langues : ${input.languages.join(", ")}`);
  lines.push(`- Ton : ${input.tone}`);
  lines.push(`- Objectif : ${input.objective}`);
  lines.push(`- Framework : ${input.framework}`);
  if (input.productInfo) {
    lines.push(`\n## Produit lié`);
    if (input.productInfo.title) lines.push(`- Titre : ${input.productInfo.title}`);
    if (input.productInfo.sku) lines.push(`- SKU : ${input.productInfo.sku}`);
    if (input.productInfo.priceKd)
      lines.push(`- Prix : ${input.productInfo.priceKd} KD`);
    if (input.productInfo.url) lines.push(`- URL : ${input.productInfo.url}`);
    if (input.productInfo.colors?.length)
      lines.push(`- Couleurs : ${input.productInfo.colors.join(", ")}`);
  }
  if (input.regenerateNote) {
    lines.push(`\n## Note de régénération`);
    lines.push(input.regenerateNote);
  }
  lines.push(
    `\nAnalyse l'image (ou les images) ci-jointe(s), puis génère exactement les variantes demandées en JSON strict.`,
  );
  return lines.join("\n");
}

export type GenerateCaptionsResult = {
  variants: CaptionVariant[];
  raw_usage: { input_tokens: number; output_tokens: number };
};

export async function generateCaptions(
  input: GenerateCaptionsInput,
): Promise<GenerateCaptionsResult> {
  if (input.images.length === 0) throw new Error("Au moins une image requise");
  if (input.platforms.length === 0)
    throw new Error("Sélectionne au moins une plateforme");
  if (input.languages.length === 0)
    throw new Error("Sélectionne au moins une langue");

  const client = getClient();

  const imageBlocks = input.images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: img.base64,
    },
  }));

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [...imageBlocks, { type: "text", text: buildUserMessage(input) }],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Réponse Claude vide");
  }

  const jsonText = extractJson(textBlock.text);
  let parsed: { variants: CaptionVariant[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Sortie Claude non-JSON : ${textBlock.text.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
    throw new Error("Aucune variante générée");
  }

  return {
    variants: parsed.variants,
    raw_usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
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
