import { kdToUsd } from "@/lib/currency";
import type { AdPlan, SelectedProduct } from "@/lib/ad-planner";

const META_API = "https://graph.facebook.com/v21.0";

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const META_PAGE_ID = process.env.META_PAGE_ID ?? "629026413637284";
const META_PIXEL_ID = process.env.META_PIXEL_ID ?? "2377425909303221";

const COUNTRY_TO_ISO: Record<string, string> = {
  Kuwait: "KW",
  "Saudi Arabia": "SA",
  "United Arab Emirates": "AE",
  Qatar: "QA",
  Bahrain: "BH",
  Oman: "OM",
};

const CTA_MAP: Record<string, string> = {
  SHOP_NOW: "SHOP_NOW",
  LEARN_MORE: "LEARN_MORE",
  MESSAGE_PAGE: "MESSAGE_PAGE",
  ORDER_NOW: "ORDER_NOW",
  GET_OFFER: "GET_OFFER",
  CONTACT_US: "CONTACT_US",
  SIGN_UP: "SIGN_UP",
  SUBSCRIBE: "SUBSCRIBE",
  GET_QUOTE: "GET_QUOTE",
  BOOK_NOW: "BOOK_TRAVEL",
  DOWNLOAD: "DOWNLOAD",
};

function pickOptimizationGoal(objective: string): {
  goal: string;
  promotedObject?: { pixel_id: string; custom_event_type: string };
} {
  switch (objective) {
    case "OUTCOME_SALES":
      return {
        goal: "OFFSITE_CONVERSIONS",
        promotedObject: { pixel_id: META_PIXEL_ID, custom_event_type: "PURCHASE" },
      };
    case "OUTCOME_TRAFFIC":
      return { goal: "LINK_CLICKS" };
    case "OUTCOME_ENGAGEMENT":
      return { goal: "POST_ENGAGEMENT" };
    case "OUTCOME_AWARENESS":
      return { goal: "REACH" };
    case "OUTCOME_LEADS":
      return { goal: "LEAD_GENERATION" };
    default:
      return { goal: "LINK_CLICKS" };
  }
}

function pickGenders(genders: string[]): number[] | undefined {
  const set = new Set(genders);
  if (set.has("all")) return undefined;
  const out: number[] = [];
  if (set.has("women")) out.push(2);
  if (set.has("men")) out.push(1);
  return out.length > 0 ? out : undefined;
}

async function metaFetch<T>(
  path: string,
  body: Record<string, unknown>,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  if (!META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN manquant");
  if (!META_AD_ACCOUNT_ID) throw new Error("META_AD_ACCOUNT_ID manquant");

  const url = `${META_API}/${path}`;
  const formData = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      formData.append(k, JSON.stringify(v));
    } else {
      formData.append(k, String(v));
    }
  }
  formData.append("access_token", META_ACCESS_TOKEN);

  const res = await fetch(url, {
    method,
    body: method === "POST" ? formData : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error?.error_user_msg || json.error?.message || `Meta API ${res.status}`;
    throw new Error(`Meta API: ${msg}`);
  }
  return json as T;
}

export type PushResult = {
  campaignId: string;
  campaignUrl: string;
  adSetId: string;
  adSetUrl: string;
  ads: Array<{ variant: "A" | "B" | "C"; adId: string; adUrl: string; creativeId: string }>;
  adsManagerUrl: string;
  errors: string[];
  warnings: string[];
};

export async function pushPlanToMeta(
  plan: AdPlan,
  selectedProduct: SelectedProduct | null,
): Promise<PushResult> {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    throw new Error("Variables Meta manquantes (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID)");
  }

  const adAccount = META_AD_ACCOUNT_ID.startsWith("act_")
    ? META_AD_ACCOUNT_ID
    : `act_${META_AD_ACCOUNT_ID}`;

  const warnings: string[] = [];
  const errors: string[] = [];

  // ─── 1. CAMPAIGN (with CBO — campaign-level daily budget) ──
  const adSetPlan = plan.adSets[0];
  if (!adSetPlan) throw new Error("Plan sans ad set");

  const dailyBudgetUsd = kdToUsd(adSetPlan.dailyBudgetKwd);
  const dailyBudgetCents = Math.max(100, Math.round(dailyBudgetUsd * 100));

  const campaignRes = await metaFetch<{ id: string }>(
    `${adAccount}/campaigns`,
    {
      name: plan.campaign.name,
      objective: plan.campaign.objective,
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      daily_budget: dailyBudgetCents,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    },
  );
  const campaignId = campaignRes.id;

  const countries = adSetPlan.audience.locations
    .map((c) => COUNTRY_TO_ISO[c])
    .filter(Boolean);
  if (countries.length === 0) {
    warnings.push(`Aucun pays reconnu dans ${JSON.stringify(adSetPlan.audience.locations)} — fallback Kuwait`);
    countries.push("KW");
  }

  const genders = pickGenders(adSetPlan.audience.genders);
  const { goal: optimizationGoal, promotedObject } = pickOptimizationGoal(plan.campaign.objective);

  const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endTime = plan.strategy.durationDays
    ? new Date(Date.now() + plan.strategy.durationDays * 86400 * 1000).toISOString()
    : undefined;

  const adSetBody: Record<string, unknown> = {
    name: adSetPlan.name,
    campaign_id: campaignId,
    billing_event: "IMPRESSIONS",
    optimization_goal: optimizationGoal,
    targeting: {
      geo_locations: { countries },
      age_min: adSetPlan.audience.ageMin,
      age_max: adSetPlan.audience.ageMax,
      genders,
      targeting_automation: { advantage_audience: 0 },
    },
    status: "PAUSED",
    start_time: startTime,
  };
  if (endTime) adSetBody.end_time = endTime;
  if (promotedObject) adSetBody.promoted_object = promotedObject;

  const adSetRes = await metaFetch<{ id: string }>(`${adAccount}/adsets`, adSetBody);
  const adSetId = adSetRes.id;

  warnings.push(
    "Audiences (intérêts détaillés) NON poussées — Meta API exige les IDs Meta de chaque intérêt. Ajoute-les à la main dans Ads Manager après vérification.",
  );

  // ─── 3. IMAGE UPLOAD (from Shopify product URL) ────────────
  let imageHash: string | null = null;
  if (selectedProduct?.imageUrl) {
    try {
      const imgRes = await metaFetch<{ images: Record<string, { hash: string }> }>(
        `${adAccount}/adimages`,
        { url: selectedProduct.imageUrl },
      );
      const firstKey = Object.keys(imgRes.images)[0];
      imageHash = imgRes.images[firstKey]?.hash ?? null;
    } catch (err) {
      warnings.push(
        `Upload image échoué (${err instanceof Error ? err.message : "?"}) — les ads sont créés sans visuel. Ajoute l'image manuellement.`,
      );
    }
  } else {
    warnings.push(
      "Aucun produit Shopify sélectionné — les ads sont créés sans visuel. Ajoute l'image manuellement dans Ads Manager.",
    );
  }

  // ─── 4. ADS (3 variants A/B/C) ─────────────────────────────
  const ads: PushResult["ads"] = [];
  for (const variant of plan.adVariants) {
    try {
      const ctaType = CTA_MAP[variant.cta] ?? "SHOP_NOW";
      const linkData: Record<string, unknown> = {
        link: variant.destinationUrl,
        message: variant.primaryText.ar,
        name: variant.headline.ar?.slice(0, 40),
        description: variant.description.ar?.slice(0, 30),
        call_to_action: {
          type: ctaType,
          value: { link: variant.destinationUrl },
        },
      };
      if (imageHash) linkData.image_hash = imageHash;

      const creativeRes = await metaFetch<{ id: string }>(
        `${adAccount}/adcreatives`,
        {
          name: `${plan.campaign.name} — ${variant.variant}`,
          object_story_spec: {
            page_id: META_PAGE_ID,
            link_data: linkData,
          },
        },
      );
      const creativeId = creativeRes.id;

      const adRes = await metaFetch<{ id: string }>(`${adAccount}/ads`, {
        name: `${variant.variant}_${variant.angle.replace(/\s+/g, "_").slice(0, 30)}`,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: "PAUSED",
      });

      ads.push({
        variant: variant.variant,
        adId: adRes.id,
        adUrl: `https://business.facebook.com/adsmanager/manage/ads?act=${adAccount.replace(/^act_/, "")}&selected_ad_ids=${adRes.id}`,
        creativeId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "?";
      if (msg.includes("development mode")) {
        errors.push(
          `Variant ${variant.variant} : ton app Meta "Blue Marine Dashboard" est en mode développement. Pour activer la création automatique d'ads, publie l'app : developers.facebook.com → My Apps → Blue Marine Dashboard → Publish.`,
        );
      } else {
        errors.push(`Variant ${variant.variant} échoué : ${msg}`);
      }
    }
  }

  const baseAccountId = adAccount.replace(/^act_/, "");
  return {
    campaignId,
    campaignUrl: `https://business.facebook.com/adsmanager/manage/campaigns?act=${baseAccountId}&selected_campaign_ids=${campaignId}`,
    adSetId,
    adSetUrl: `https://business.facebook.com/adsmanager/manage/adsets?act=${baseAccountId}&selected_adset_ids=${adSetId}`,
    ads,
    adsManagerUrl: `https://business.facebook.com/adsmanager/manage/campaigns?act=${baseAccountId}`,
    errors,
    warnings,
  };
}
