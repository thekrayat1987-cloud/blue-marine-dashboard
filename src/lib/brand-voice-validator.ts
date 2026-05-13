// Blue Marine — brand voice validator
// Mirrors the SYSTEM_PROMPT rules in src/lib/anthropic.ts so captions
// written manually in the content calendar get the same quality gate
// as AI-generated ones.

export type Severity = "error" | "warning";

export type Violation = {
  severity: Severity;
  code: string;
  message: string;
  suggestion?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: Violation[];
  warnings: Violation[];
  score: number; // 0-100
};

const BANNED_ABS: { pattern: RegExp; code: string; message: string; suggestion: string }[] = [
  {
    pattern: /إطلال[ةه]|اطلال[ةه]|إطلالات|اطلالات/g,
    code: "banned_itlala",
    message: "Mot interdit « إطلالة / اطلالات »",
    suggestion: "Remplace par مظهر, تصميم, قطعة ou لوك",
  },
  {
    pattern: /هلا\s*و?غلا/g,
    code: "banned_hala_wghala",
    message: "Expression interdite « هلا وغلا » (trop cliché)",
    suggestion: "Utilise نورتي, حياك الله, ou démarre directement",
  },
  {
    pattern: /\babaya?s?\b/gi,
    code: "banned_abaya",
    message: "Le mot « abaya » est interdit en nommage",
    suggestion: "Utilise بشت, درّاعة, قفطان, طقم ou bisht selon le produit",
  },
  {
    pattern: /معطف/g,
    code: "banned_meataf",
    message: "Mot « معطف » à remplacer",
    suggestion: "Utilise بشت à la place",
  },
  {
    pattern: /(?<![ا-ي])فستان(?![ا-ي])/g,
    code: "banned_fustan",
    message: "Mot « فستان » à remplacer",
    suggestion: "Utilise درّاعة ou قفطان à la place",
  },
];

const RAMADAN_PATTERNS = [/رمضان/g, /\bramadan\b/gi];

// Geo terms that signal Gulf-wide framing
const GCC_TERMS = [
  "الخليج",
  "خليج",
  "خليجي",
  "خليجية",
  "السعودية",
  "الإمارات",
  "قطر",
  "البحرين",
  "عمان",
  "GCC",
  "Gulf",
  "Khaleeji",
];

const KUWAIT_TERMS = ["الكويت", "Kuwait", "كويت", "Koweït"];

type ValidateOpts = {
  caption: string;
  hashtags: string;
  now?: Date;
  isAr?: boolean; // hint: must caption be AR? auto-detected if undefined
};

export function validateContent(opts: ValidateOpts): ValidationResult {
  const { caption, hashtags } = opts;
  const now = opts.now ?? new Date();
  const errors: Violation[] = [];
  const warnings: Violation[] = [];

  const combined = `${caption}\n${hashtags}`;

  // 1. Absolute bans → errors
  for (const rule of BANNED_ABS) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(combined)) {
      errors.push({
        severity: "error",
        code: rule.code,
        message: rule.message,
        suggestion: rule.suggestion,
      });
    }
  }

  // 2. Ramadan framing outside the window → warning
  // Ramadan window: ~15 days before Ramadan through end of Ramadan.
  // 2026: Feb 17 → Mar 18. Lead window: Feb 2 → Mar 18.
  // 2027: Feb 7 → Mar 8. Lead window: Jan 24 → Mar 8.
  // Simple heuristic: only Feb + first half of March are "in season".
  const month = now.getMonth(); // 0 = Jan, 1 = Feb, 2 = Mar
  const day = now.getDate();
  const inRamadanSeason =
    month === 1 || // Feb
    (month === 2 && day <= 20); // first 20 days of Mar
  if (!inRamadanSeason) {
    for (const pat of RAMADAN_PATTERNS) {
      pat.lastIndex = 0;
      if (pat.test(combined)) {
        warnings.push({
          severity: "warning",
          code: "ramadan_off_season",
          message: "Mention « Ramadan » hors saison",
          suggestion:
            "Utilise mariage, henna, soirée, eid, formal ou gathering selon le contexte",
        });
        break;
      }
    }
  }

  // 3. Geo framing: "Kuwait" alone (no Gulf term) → warning
  const hasKuwait = KUWAIT_TERMS.some((t) =>
    new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(combined),
  );
  const hasGcc = GCC_TERMS.some((t) =>
    new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(combined),
  );
  if (hasKuwait && !hasGcc) {
    warnings.push({
      severity: "warning",
      code: "kuwait_only_framing",
      message: "Cadrage Kuwait-seul (la marque cible tout le Golfe)",
      suggestion:
        "Ajoute au moins un terme khaleeji : #الخليج, #السعودية, #الإمارات, #قطر, #البحرين, #عمان",
    });
  }

  // 4. Hashtag count sanity (Instagram captions in this dashboard)
  const tagCount = (hashtags.match(/#[^\s#]+/g) ?? []).length;
  if (tagCount > 0 && tagCount < 5) {
    warnings.push({
      severity: "warning",
      code: "hashtags_too_few",
      message: `Seulement ${tagCount} hashtag${tagCount > 1 ? "s" : ""} (Instagram conseille 15-25)`,
      suggestion:
        "Ajoute des tags Tier 1 (niche luxe), Tier 2 (occasion) et Tier 3 (géo Gulf)",
    });
  }

  // 5. Caption too short → warning
  if (caption.trim().length > 0 && caption.trim().length < 40) {
    warnings.push({
      severity: "warning",
      code: "caption_too_short",
      message: "Légende très courte (< 40 caractères)",
      suggestion: "Ajoute un hook + 2 ancres sensorielles + un CTA",
    });
  }

  // Scoring: start 100, -25 per error, -10 per warning, floor 0.
  const score = Math.max(
    0,
    100 - errors.length * 25 - warnings.length * 10,
  );

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    score,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
