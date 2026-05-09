// ==========================================
// BLUE MARINE - DASHBOARD DATA
// Goal: 50,000 KD / year
// Market: Traditional Clothing - Kuwait
// Channels: Instagram + E-commerce + WhatsApp
// Average Order: 60 KD
// ==========================================

export const ANNUAL_TARGET = 50_000;
export const MONTHLY_TARGET = Math.round(ANNUAL_TARGET / 12);
export const DAILY_TARGET = Math.round(ANNUAL_TARGET / 365);
export const AVG_ORDER_VALUE = 60; // 60 KD
export const ORDERS_PER_MONTH = Math.round(MONTHLY_TARGET / AVG_ORDER_VALUE);
export const ORDERS_PER_DAY = Math.round(DAILY_TARGET / AVG_ORDER_VALUE);

// Monthly revenue data (Year 1 simulation - progressive growth, sums to ANNUAL_TARGET)
export const monthlyData = [
  { month: "Jan", target: 2500, revenue: 0, orders: 0, visitors: 0, adSpend: 400 },
  { month: "Feb", target: 2750, revenue: 0, orders: 0, visitors: 0, adSpend: 450 },
  { month: "Mar", target: 3250, revenue: 0, orders: 0, visitors: 0, adSpend: 500 },
  { month: "Apr", target: 3750, revenue: 0, orders: 0, visitors: 0, adSpend: 600 },
  { month: "May", target: 4000, revenue: 0, orders: 0, visitors: 0, adSpend: 600 },
  { month: "Jun", target: 4250, revenue: 0, orders: 0, visitors: 0, adSpend: 650 },
  { month: "Jul", target: 4250, revenue: 0, orders: 0, visitors: 0, adSpend: 650 },
  { month: "Aug", target: 4500, revenue: 0, orders: 0, visitors: 0, adSpend: 700 },
  { month: "Sep", target: 4750, revenue: 0, orders: 0, visitors: 0, adSpend: 750 },
  { month: "Oct", target: 5000, revenue: 0, orders: 0, visitors: 0, adSpend: 800 },
  { month: "Nov", target: 5500, revenue: 0, orders: 0, visitors: 0, adSpend: 900 },
  { month: "Dec", target: 5500, revenue: 0, orders: 0, visitors: 0, adSpend: 900 },
];

// Channel breakdown
export const channelData = [
  {
    name: "Instagram / Social",
    percentage: 35,
    targetRevenue: 17500,
    color: "#e1306c",
    icon: "instagram",
    metrics: {
      followers: 0,
      engagementRate: 0,
      reachPerPost: 0,
      storySales: 0,
    },
  },
  {
    name: "E-commerce (Shopify)",
    percentage: 45,
    targetRevenue: 22500,
    color: "#96bf48",
    icon: "shopping-cart",
    metrics: {
      monthlyVisitors: 0,
      conversionRate: 0,
      bounceRate: 0,
      cartAbandonment: 0,
    },
  },
  {
    name: "WhatsApp",
    percentage: 20,
    targetRevenue: 10000,
    color: "#25d366",
    icon: "whatsapp",
    metrics: {
      conversations: 0,
      conversionRate: 0,
      avgResponseTime: 0,
      catalogViews: 0,
    },
  },
];

// Meta Ads KPI targets (KD)
export const metaAdsTargets = {
  monthlyBudget: 500, // ~1500 USD
  targetROAS: 4.0, // 4 KD revenue per 1 KD spent
  targetCPC: 0.25, // Cost per click
  targetCPM: 3.7, // Cost per 1000 impressions
  targetCTR: 2.5, // Click-through rate %
  targetCPA: 8, // Cost per acquisition
  targetConversion: 3.0, // Conversion rate %
};

// Meta Ads campaigns (budget en KD)
export const metaCampaigns = [
  {
    name: "Ramadan Collection 2026",
    status: "active" as const,
    budget: 920,
    spent: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    objective: "Sales",
  },
  {
    name: "New Arrivals - Dishdashas",
    status: "draft" as const,
    budget: 615,
    spent: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    objective: "Sales",
  },
  {
    name: "Brand Awareness Kuwait",
    status: "draft" as const,
    budget: 460,
    spent: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    objective: "Awareness",
  },
  {
    name: "Retargeting - Cart Abandoners",
    status: "draft" as const,
    budget: 460,
    spent: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    objective: "Retargeting",
  },
];

// Instagram Reels Ideas
export const reelsIdeas = [
  {
    category: "Coulisses",
    color: "#e1306c",
    ideas: [
      { title: "Processus de couture du bisht", description: "Time-lapse du tissu à la pièce finie. Musique traditionnelle en fond.", hook: "Comment on fabrique un bisht en 60 secondes", trending: true },
      { title: "Sélection des tissus au souk", description: "Visite du marché aux tissus, toucher des matières, explication de la qualité.", hook: "Ce tissu coûte 60 KD le mètre... voici pourquoi", trending: true },
      { title: "Atelier broderie", description: "Gros plan sur les artisans qui brodent les détails dorés.", hook: "500 heures de travail dans cette broderie", trending: false },
      { title: "Emballage et expédition", description: "ASMR pliage, emballage cadeau, étiquetage.", hook: "L'expérience unboxing Blue Marine", trending: true },
    ],
  },
  {
    category: "Style et mode",
    color: "#8b5cf6",
    ideas: [
      { title: "3 façons de porter le bisht", description: "Reel transition montrant 3 styles différents avec le même bisht.", hook: "1 bisht, 3 looks totalement différents", trending: true },
      { title: "OOTD traditionnel", description: "GRWM (Get Ready With Me) pour un événement en tenue traditionnelle.", hook: "GRWM pour un mariage koweïtien", trending: true },
      { title: "Moderne vs Traditionnel", description: "Split screen comparant style moderne et traditionnel.", hook: "Quand la tradition rencontre 2026", trending: true },
      { title: "Couleurs de la saison", description: "Palette tendance de la saison avec les produits.", hook: "5 couleurs que tout le Golfe va porter cet été", trending: false },
    ],
  },
  {
    category: "Éducatif",
    color: "#3b82f6",
    ideas: [
      { title: "Histoire du bisht", description: "Mini-documentaire sur l'origine et l'évolution du bisht.", hook: "Tu ne connais pas la vraie histoire du bisht", trending: false },
      { title: "Reconnaître un tissu de qualité", description: "Astuces pour distinguer les bons des mauvais tissus.", hook: "Test simple : brûle un fil pour vérifier la qualité", trending: true },
      { title: "Guide d'entretien des tenues", description: "Comment laver, repasser et préserver les tenues traditionnelles.", hook: "L'erreur n°1 qui abîme tes bishts", trending: true },
      { title: "Sens des motifs de broderie", description: "Chaque motif a une histoire — explication de la symbolique.", hook: "Ce motif a une signification très spéciale", trending: false },
    ],
  },
  {
    category: "Avis clients et UGC",
    color: "#22c55e",
    ideas: [
      { title: "Réaction client à la livraison", description: "Filmer les réactions des clientes à l'ouverture du colis.", hook: "Sa réaction en ouvrant le colis", trending: true },
      { title: "Avant/Après retouches", description: "Montrer la transformation après retouches sur-mesure.", hook: "Elle n'arrivait pas à croire que c'était le même bisht", trending: true },
      { title: "Avis client en vidéo", description: "Témoignage authentique d'une cliente satisfaite.", hook: "Ce que nos clientes disent vraiment de nous", trending: false },
      { title: "Compilation commandes du jour", description: "Montrer toutes les commandes préparées dans la journée.", hook: "Un lundi normal chez Blue Marine (15 commandes)", trending: true },
    ],
  },
];

// Content Calendar Template
export const contentCalendar = {
  monday: { type: "Reel", theme: "Coulisses / Atelier", platform: "Instagram + TikTok" },
  tuesday: { type: "Story", theme: "Produit du jour + Sondage", platform: "Instagram" },
  wednesday: { type: "Reel", theme: "Style / OOTD / Lookbook", platform: "Instagram + TikTok" },
  thursday: { type: "Carousel", theme: "Éducatif / Guide / Conseils", platform: "Instagram" },
  friday: { type: "Story", theme: "Jumu'ah vibes + Promo week-end", platform: "Instagram" },
  saturday: { type: "Reel", theme: "UGC / Témoignage client", platform: "Instagram + TikTok" },
  sunday: { type: "Story + Post", theme: "Nouveautés / Récap de la semaine", platform: "Instagram" },
};

// Budget Allocation
export const budgetAllocation = [
  { category: "Meta Ads (Facebook/Instagram)", percentage: 40, amount: 0, color: "#1877f2" },
  { category: "Google Ads (Search + Shopping)", percentage: 15, amount: 0, color: "#ea4335" },
  { category: "TikTok Ads", percentage: 10, amount: 0, color: "#000000" },
  { category: "Influencers / KOL", percentage: 15, amount: 0, color: "#e1306c" },
  { category: "Content (Photo/Video)", percentage: 10, amount: 0, color: "#8b5cf6" },
  { category: "Email Marketing", percentage: 5, amount: 0, color: "#22c55e" },
  { category: "SEO & Blog", percentage: 5, amount: 0, color: "#f59e0b" },
];

// KPI Definitions
export const kpiDefinitions = {
  AOV: { name: "Panier moyen (AOV)", target: 60, unit: "KD", description: "Montant moyen par commande" },
  CAC: { name: "Coût d'acquisition client", target: 8, unit: "KD", description: "Coût pour acquérir 1 client" },
  LTV: { name: "Valeur vie client", target: 180, unit: "KD", description: "Revenu moyen total par client" },
  ROAS: { name: "Retour sur dépenses pub", target: 4.0, unit: "x", description: "4 KD de revenu pour 1 KD dépensé" },
  conversionRate: { name: "Taux de conversion", target: 2.5, unit: "%", description: "% de visiteurs qui achètent" },
  repeatRate: { name: "Taux de fidélisation", target: 30, unit: "%", description: "% de clients qui rachètent" },
  marginRate: { name: "Marge brute", target: 65, unit: "%", description: "% de marge sur chaque vente" },
};

// Product categories (avgPrice en KD)
export const productCategories = [
  { name: "Dishdashas hommes", avgPrice: 55, margin: 65, bestSeller: true },
  { name: "Bishts femmes", avgPrice: 75, margin: 70, bestSeller: true },
  { name: "Jalabiya", avgPrice: 60, margin: 68, bestSeller: false },
  { name: "Accessoires (Ghutra, Agal)", avgPrice: 15, margin: 75, bestSeller: false },
  { name: "Collections Ramadan", avgPrice: 90, margin: 60, bestSeller: true },
  { name: "Sur-mesure", avgPrice: 150, margin: 55, bestSeller: false },
];

// Seasonal events (Kuwait specific)
export const seasonalEvents = [
  { name: "Ramadan", month: "Mars", impact: "very-high", strategy: "Capsule Ramadan + ads 2 semaines avant" },
  { name: "Aïd Al-Fitr", month: "Avril", impact: "very-high", strategy: "Ventes flash + coffrets cadeaux + livraison express" },
  { name: "Rentrée", month: "Septembre", impact: "medium", strategy: "Nouveautés automne + bundles famille" },
  { name: "Fête nationale (25-26 fév.)", month: "Février", impact: "high", strategy: "Capsule couleurs nationales + promo patriotique" },
  { name: "Aïd Al-Adha", month: "Juin", impact: "high", strategy: "Tenues de fête + offres famille" },
  { name: "Hala February", month: "Février", impact: "medium", strategy: "Collaboration festival + pop-up store" },
  { name: "Black Friday / White Friday", month: "Novembre", impact: "high", strategy: "Promos agressives + bundles + campagne email" },
  { name: "Fin d'année", month: "Décembre", impact: "medium", strategy: "Cartes cadeaux + coffrets premium" },
];
