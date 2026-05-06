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

// Shopify Audit Checklist
export const shopifyAuditChecklist = [
  {
    category: "Performance",
    items: [
      { task: "Page load speed < 3 seconds", done: false, priority: "high" as const },
      { task: "Optimized images (WebP, lazy loading)", done: false, priority: "high" as const },
      { task: "Mobile responsive design", done: false, priority: "high" as const },
      { task: "Core Web Vitals optimized", done: false, priority: "medium" as const },
    ],
  },
  {
    category: "SEO",
    items: [
      { task: "Meta titles & descriptions for each product", done: false, priority: "high" as const },
      { task: "Optimized URLs (clean slugs)", done: false, priority: "medium" as const },
      { task: "Schema markup (Product, BreadcrumbList)", done: false, priority: "medium" as const },
      { task: "Blog with SEO content (KW keywords)", done: false, priority: "medium" as const },
      { task: "XML Sitemap & robots.txt", done: false, priority: "high" as const },
    ],
  },
  {
    category: "Conversion",
    items: [
      { task: "High quality product photos (min 5 per product)", done: false, priority: "high" as const },
      { task: "Detailed descriptions in Arabic + English", done: false, priority: "high" as const },
      { task: "Clear size guide", done: false, priority: "high" as const },
      { task: "Customer reviews / Social proof", done: false, priority: "high" as const },
      { task: "Simplified checkout (< 3 steps)", done: false, priority: "high" as const },
      { task: "Payment: KNET + Apple Pay + Tabby (BNPL)", done: false, priority: "high" as const },
      { task: "Live chat / WhatsApp integrated", done: false, priority: "medium" as const },
      { task: "Email capture popup (10% off)", done: false, priority: "medium" as const },
    ],
  },
  {
    category: "Trust & Branding",
    items: [
      { task: "Professional logo & consistent branding", done: false, priority: "high" as const },
      { task: "About page with brand story", done: false, priority: "medium" as const },
      { task: "Clear return policy", done: false, priority: "high" as const },
      { task: "Free shipping > 30 KWD", done: false, priority: "medium" as const },
      { task: "Active SSL certificate", done: false, priority: "high" as const },
    ],
  },
];

// Instagram Reels Ideas
export const reelsIdeas = [
  {
    category: "Behind The Scenes",
    color: "#e1306c",
    ideas: [
      { title: "Dishdasha sewing process", description: "Time-lapse from fabric to finished piece. Traditional music in background.", hook: "How we make a dishdasha in 60 seconds", trending: true },
      { title: "Fabric sourcing at the souk", description: "Visit to the fabric market, feeling materials, explaining quality.", hook: "This fabric costs $200 per meter... here's why", trending: true },
      { title: "Embroidery workshop", description: "Close-up of artisans embroidering golden details.", hook: "500 hours of work in this embroidery", trending: false },
      { title: "Packaging & shipping", description: "ASMR folding, gift wrapping, labeling.", hook: "The Blue Marine unboxing experience", trending: true },
    ],
  },
  {
    category: "Style & Fashion",
    color: "#8b5cf6",
    ideas: [
      { title: "3 ways to wear the abaya", description: "Transition reel showing 3 different styles with the same abaya.", hook: "1 abaya, 3 completely different looks", trending: true },
      { title: "Traditional OOTD", description: "GRWM (Get Ready With Me) for an event with traditional outfit.", hook: "GRWM for a Kuwaiti wedding", trending: true },
      { title: "Modern vs Traditional", description: "Split screen comparing modern and traditional style.", hook: "Tradition meets 2026", trending: true },
      { title: "Colors of the season", description: "Trending color palette for the season with products.", hook: "5 colors all of Kuwait will wear this summer", trending: false },
    ],
  },
  {
    category: "Educational",
    color: "#3b82f6",
    ideas: [
      { title: "History of the dishdasha", description: "Mini-documentary on the origin and evolution of the dishdasha.", hook: "You don't know the real history of the dishdasha", trending: false },
      { title: "How to spot quality fabric", description: "Tips to identify good vs bad fabrics.", hook: "Simple test: burn a thread to check quality", trending: true },
      { title: "Garment care guide", description: "How to wash, iron and preserve traditional outfits.", hook: "Mistake #1 that destroys your dishdashas", trending: true },
      { title: "Meaning of embroidery patterns", description: "Each pattern has a story - explaining the symbolism.", hook: "This pattern means something very special", trending: false },
    ],
  },
  {
    category: "Social Proof & UGC",
    color: "#22c55e",
    ideas: [
      { title: "Customer delivery reaction", description: "Film customer reactions when they open the package.", hook: "His reaction when he opened the package", trending: true },
      { title: "Before/After alterations", description: "Show the transformation with custom alterations.", hook: "He couldn't believe it was the same dishdasha", trending: true },
      { title: "Video customer review", description: "Authentic testimonial from a satisfied customer.", hook: "What our customers really say about us", trending: false },
      { title: "Daily orders compilation", description: "Show all orders prepared during the day.", hook: "A normal Monday at Blue Marine (15 orders)", trending: true },
    ],
  },
];

// Content Calendar Template
export const contentCalendar = {
  monday: { type: "Reel", theme: "Behind the scenes / Crafting", platform: "Instagram + TikTok" },
  tuesday: { type: "Story", theme: "Product of the day + Poll", platform: "Instagram" },
  wednesday: { type: "Reel", theme: "Style / OOTD / Lookbook", platform: "Instagram + TikTok" },
  thursday: { type: "Carousel", theme: "Educational / Guide / Tips", platform: "Instagram" },
  friday: { type: "Story", theme: "Jumu'ah vibes + Weekend promo", platform: "Instagram" },
  saturday: { type: "Reel", theme: "UGC / Customer testimonial", platform: "Instagram + TikTok" },
  sunday: { type: "Story + Post", theme: "New arrivals / Weekly recap", platform: "Instagram" },
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
  AOV: { name: "Avg Order Value (AOV)", target: 60, unit: "KD", description: "Average amount per order" },
  CAC: { name: "Customer Acquisition Cost", target: 8, unit: "KD", description: "Cost to acquire 1 customer" },
  LTV: { name: "Customer Lifetime Value", target: 180, unit: "KD", description: "Total avg revenue per customer" },
  ROAS: { name: "Return on Ad Spend", target: 4.0, unit: "x", description: "$4 revenue for every $1 in ads" },
  conversionRate: { name: "Conversion Rate", target: 2.5, unit: "%", description: "% of visitors who purchase" },
  repeatRate: { name: "Repeat Rate", target: 30, unit: "%", description: "% of customers who buy again" },
  marginRate: { name: "Gross Margin", target: 65, unit: "%", description: "% margin on each sale" },
};

// Product categories (avgPrice en KD)
export const productCategories = [
  { name: "Men's Dishdashas", avgPrice: 55, margin: 65, bestSeller: true },
  { name: "Women's Abayas", avgPrice: 75, margin: 70, bestSeller: true },
  { name: "Jalabiya", avgPrice: 60, margin: 68, bestSeller: false },
  { name: "Accessories (Ghutra, Agal)", avgPrice: 15, margin: 75, bestSeller: false },
  { name: "Ramadan Collections", avgPrice: 90, margin: 60, bestSeller: true },
  { name: "Custom / Bespoke", avgPrice: 150, margin: 55, bestSeller: false },
];

// Seasonal events (Kuwait specific)
export const seasonalEvents = [
  { name: "Ramadan", month: "March", impact: "very-high", strategy: "Capsule Ramadan collection + heavy ads 2 weeks before" },
  { name: "Eid Al-Fitr", month: "April", impact: "very-high", strategy: "Flash sales + Gift sets + Express delivery" },
  { name: "Back to School", month: "September", impact: "medium", strategy: "Kids dishdashas + Family bundles" },
  { name: "National Day (25-26 Feb)", month: "February", impact: "high", strategy: "Flag colors collection + Patriotic promo" },
  { name: "Eid Al-Adha", month: "June", impact: "high", strategy: "Celebration outfits + Family packages" },
  { name: "Hala February", month: "February", impact: "medium", strategy: "Festival collaboration + Pop-up store" },
  { name: "Black Friday / White Friday", month: "November", impact: "high", strategy: "Aggressive discounts + Bundles + Email blast" },
  { name: "End of Year", month: "December", impact: "medium", strategy: "Gift cards + Premium gift boxes" },
];
