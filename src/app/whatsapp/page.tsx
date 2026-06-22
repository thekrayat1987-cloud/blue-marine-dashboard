"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircle,
  Phone,
  Search,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  History,
  Crown,
  ExternalLink,
  ShoppingBag,
  X,
} from "lucide-react";
import KPICard from "@/components/KPICard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface WhatsAppProfile {
  verifiedName: string;
  displayPhoneNumber: string;
  qualityRating: string;
  phoneId: string;
}

interface ProfileResponse {
  profile: WhatsAppProfile | null;
}

interface AttributionData {
  currentMonth: { revenue: number; orders: number; customers: number };
  previousMonth: { revenue: number; orders: number; customers: number };
  monthlyHistory: Array<{ month: string; revenue: number; orders: number }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
    email: string | null;
    phone: string | null;
    ordersCount: number;
    totalSpent: number;
    lastOrderAt: string;
  }>;
  currency: string;
  totalScanned: number;
  attributedCount: number;
  error?: string;
}

interface BroadcastHistoryItem {
  id: string;
  created_at: string;
  campaign_type: string;
  segment_type: string;
  segment_preview: { count?: number; totalSpentKwd?: number } | null;
  occasion: string | null;
  promo_code: string | null;
  promo_deadline: string | null;
  selected_product: { title?: string; handle?: string } | null;
}

interface ShopifyProductLite {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
}

const SHOP_DOMAIN = "bluemarineatelier.com";
const WA_NUMBER = "96599592234"; // wa.me format, no +/spaces
const CAMPAIGN_LABELS: Record<string, string> = {
  new_collection: "Nouvelle collection",
  promo_flash: "Promo flash",
  restock: "Restock",
  seasonal_occasion: "Occasion saison",
  vip_exclusive: "VIP exclusif",
  recovery: "Récupération",
};
const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP",
  inactive_60: "Inactives 60j",
  inactive_90: "Inactives 90j",
  by_country: "Par pays",
  by_product_tag: "Par tag produit",
  all_buyers: "Toutes acheteuses",
};

function formatKD(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function computeTrend(current: number, previous: number): { value: string; positive: boolean } | undefined {
  if (previous === 0) {
    if (current === 0) return undefined;
    return { value: "Nouveau", positive: true };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: `${pct >= 0 ? "+" : ""}${pct}%`, positive: pct >= 0 };
}

export default function WhatsAppPage() {
  const [profile, setProfile] = useState<WhatsAppProfile | null>(null);
  const [attribution, setAttribution] = useState<AttributionData | null>(null);
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [profileRes, attribRes, histRes] = await Promise.allSettled([
        fetch("/api/whatsapp").then((r) => r.json() as Promise<ProfileResponse>),
        fetch("/api/whatsapp/attribution").then((r) => r.json() as Promise<AttributionData>),
        fetch("/api/broadcast-planner/history?limit=10").then((r) => r.json() as Promise<{ items: BroadcastHistoryItem[] }>),
      ]);
      if (profileRes.status === "fulfilled") setProfile(profileRes.value.profile);
      if (attribRes.status === "fulfilled") setAttribution(attribRes.value);
      if (histRes.status === "fulfilled") setHistory(histRes.value.items ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const revenueTrend = useMemo(() => {
    if (!attribution) return undefined;
    return computeTrend(attribution.currentMonth.revenue, attribution.previousMonth.revenue);
  }, [attribution]);
  const ordersTrend = useMemo(() => {
    if (!attribution) return undefined;
    return computeTrend(attribution.currentMonth.orders, attribution.previousMonth.orders);
  }, [attribution]);

  const qualityColor =
    profile?.qualityRating === "GREEN"
      ? "bg-green-500/15 text-green-600 border-green-500/30"
      : profile?.qualityRating === "YELLOW"
      ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/30"
      : profile?.qualityRating === "RED"
      ? "bg-red-500/15 text-red-600 border-red-500/30"
      : "bg-surface-muted text-foreground-muted border-border";

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">WhatsApp Performance</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              Revenus, broadcasts et meilleures clientes WhatsApp
            </p>
          </div>
          <div className="flex items-center gap-3">
            {profile && (
              <div className="hidden md:flex items-center gap-2 text-xs">
                <Phone className="w-3.5 h-3.5 text-[#25d366]" />
                <span className="text-foreground-muted">{profile.displayPhoneNumber}</span>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${qualityColor}`}>
                  {profile.qualityRating}
                </span>
              </div>
            )}
            <button
              onClick={fetchAll}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-xs text-foreground-muted transition-colors disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Actualiser
            </button>
          </div>
        </div>
      </header>

      <div className="p-8 space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard
            label="Revenu WhatsApp (mois)"
            value={loading ? "…" : `${formatKD(attribution?.currentMonth.revenue ?? 0)} KD`}
            subtitle={
              attribution
                ? `Mois préc. ${formatKD(attribution.previousMonth.revenue)} KD`
                : "Chargement…"
            }
            icon={Wallet}
            variant="hero"
            trend={revenueTrend}
            loading={loading}
          />
          <KPICard
            label="Commandes via WhatsApp"
            value={loading ? "…" : String(attribution?.currentMonth.orders ?? 0)}
            subtitle={
              attribution
                ? `${attribution.currentMonth.customers} cliente(s) unique(s)`
                : "Chargement…"
            }
            icon={ShoppingBag}
            trend={ordersTrend}
            loading={loading}
          />
          <KPICard
            label="Broadcasts envoyés (30j)"
            value={
              loading
                ? "…"
                : String(
                    history.filter(
                      (h) => new Date(h.created_at).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000,
                    ).length,
                  )
            }
            subtitle={`${history.length} broadcasts au total`}
            icon={History}
            loading={loading}
          />
        </div>

        {/* Product Link Generator */}
        <ProductLinkGenerator />

        {/* Revenue Trend Chart */}
        {attribution && attribution.monthlyHistory.some((m) => m.revenue > 0) && (
          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              Tendance 12 mois — revenu attribué à WhatsApp
            </h2>
            <p className="text-xs text-foreground-subtle mb-4">
              {attribution.attributedCount} commande(s) attribuée(s) sur {attribution.totalScanned} scannée(s).
              Détection automatique : utm_source=whatsapp, SuperLemon, wa.me referrer.
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height={224}>
                <LineChart data={attribution.monthlyHistory}>
                  <CartesianGrid stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "#e2e8f0",
                      fontSize: 12,
                    }}
                    formatter={(v) => [`${formatKD(Number(v) || 0)} KD`, "Revenu"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#25d366"
                    strokeWidth={2.5}
                    dot={{ fill: "#25d366", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Broadcast History */}
        <div className="rounded-xl bg-surface border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Historique des broadcasts</h2>
            <span className="text-xs text-foreground-subtle ml-auto">
              {history.length} broadcast{history.length > 1 ? "s" : ""}
            </span>
          </div>
          {history.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-foreground-subtle">
              Aucun broadcast créé pour l&apos;instant.{" "}
              <a href="/broadcast-planner" className="text-accent hover:underline">
                Créer un broadcast
              </a>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 font-medium text-right">Destinataires</th>
                  <th className="px-4 py-3 font-medium">Promo</th>
                  <th className="px-6 py-3 font-medium">Produit</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-border hover:bg-surface-muted transition-colors">
                    <td className="px-6 py-3.5 text-foreground-muted whitespace-nowrap">
                      {formatDate(h.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-foreground">
                      {CAMPAIGN_LABELS[h.campaign_type] ?? h.campaign_type}
                    </td>
                    <td className="px-4 py-3.5 text-foreground-muted">
                      {SEGMENT_LABELS[h.segment_type] ?? h.segment_type}
                    </td>
                    <td className="px-4 py-3.5 text-right text-foreground tabular-nums">
                      {h.segment_preview?.count ?? "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {h.promo_code ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-accent uppercase">
                          {h.promo_code}
                        </span>
                      ) : (
                        <span className="text-foreground-subtle">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-foreground-muted text-xs">
                      {h.selected_product?.title ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Customers */}
        <div className="rounded-xl bg-surface border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Crown className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Meilleures clientes WhatsApp (12 mois)</h2>
            <span className="text-xs text-foreground-subtle ml-auto">
              {attribution?.topCustomers.length ?? 0} cliente(s)
            </span>
          </div>
          {!attribution || attribution.topCustomers.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-foreground-subtle">
              {attribution?.error ? (
                <span className="text-orange-500">Erreur attribution : {attribution.error}</span>
              ) : (
                <>
                  Aucune commande attribuée à WhatsApp encore détectée.<br />
                  Ajoute <code className="px-1.5 py-0.5 rounded bg-surface-muted text-xs">?utm_source=whatsapp</code> à tes liens de partage pour suivre les conversions.
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                  <th className="px-6 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Téléphone</th>
                  <th className="px-4 py-3 font-medium text-right">Commandes</th>
                  <th className="px-4 py-3 font-medium text-right">Dépensé</th>
                  <th className="px-4 py-3 font-medium">Dernière</th>
                  <th className="px-6 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {attribution.topCustomers.map((c, i) => {
                  const cleanPhone = c.phone?.replace(/[^0-9]/g, "") ?? "";
                  return (
                    <tr key={c.customerId} className="border-b border-border hover:bg-surface-muted transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          {i < 3 && <Crown className="w-3.5 h-3.5 text-accent" />}
                          <span className="font-medium text-foreground">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-foreground-muted tabular-nums">
                        {c.phone ?? <span className="text-foreground-subtle">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right text-foreground tabular-nums">
                        {c.ordersCount}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-foreground tabular-nums">
                        {formatKD(c.totalSpent)} {attribution.currency === "KWD" ? "KD" : attribution.currency}
                      </td>
                      <td className="px-4 py-3.5 text-foreground-muted text-xs">
                        {formatDate(c.lastOrderAt)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {cleanPhone ? (
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#25d366] text-xs font-medium transition-colors"
                          >
                            <MessageCircle className="w-3 h-3" />
                            Contacter
                          </a>
                        ) : (
                          <span className="text-foreground-subtle text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Link Generator
// ─────────────────────────────────────────────────────────────────────────────

function ProductLinkGenerator() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShopifyProductLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ShopifyProductLite | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && q.length > 0) return;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shopify/products?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.products ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const productUrl = selected ? `https://${SHOP_DOMAIN}/products/${selected.handle}?utm_source=whatsapp&utm_medium=share` : "";
  const defaultMessage = selected
    ? `Bonjour 🌸 je suis intéressée par "${selected.title}"\n${productUrl}`
    : "";
  const message = customMessage || defaultMessage;
  const waLink = selected
    ? `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`
    : "";

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers — silent fail
    }
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-[#25d366]/8 to-surface border border-[#25d366]/20 overflow-hidden">
      <div className="px-6 py-4 border-b border-[#25d366]/15 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#25d366]" />
        <h2 className="text-sm font-semibold text-foreground">Générateur de lien produit WhatsApp</h2>
        <span className="text-[10px] text-foreground-subtle ml-auto">
          Pour stories, DMs, pubs — message pré-rempli avec le produit
        </span>
      </div>

      <div className="p-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setCustomMessage("");
            }}
            placeholder="Chercher un produit (titre, SKU)…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface-muted border border-border focus:border-[#25d366] focus:outline-none text-sm text-foreground placeholder:text-foreground-subtle"
          />
          {searching && (
            <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#25d366]" />
          )}
        </div>

        {/* Results grid */}
        {!selected && results.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {results.slice(0, 12).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="group text-left bg-surface border border-border rounded-lg overflow-hidden hover:border-[#25d366] transition-colors"
              >
                <div className="aspect-[9/16] bg-surface-muted overflow-hidden">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-foreground-subtle text-xs">
                      Sans image
                    </div>
                  )}
                </div>
                <div className="px-2 py-2">
                  <p className="text-xs font-medium text-foreground line-clamp-2">{p.title}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected — link generator */}
        {selected && (
          <div className="rounded-lg bg-surface border border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              {selected.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.imageUrl}
                  alt={selected.title}
                  className="w-16 h-24 object-cover rounded-md"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{selected.title}</p>
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-foreground-muted hover:text-accent flex items-center gap-1 mt-1 truncate"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate">/products/{selected.handle}</span>
                </a>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setCustomMessage("");
                }}
                className="p-1 text-foreground-subtle hover:text-foreground"
                aria-label="Désélectionner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-foreground-subtle font-medium">
                Message pré-rempli (modifiable)
              </label>
              <textarea
                value={message}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={3}
                className="mt-1.5 w-full px-3 py-2 rounded-lg bg-surface-muted border border-border focus:border-[#25d366] focus:outline-none text-sm text-foreground resize-none"
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-foreground-subtle font-medium">
                Lien WhatsApp à partager
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  readOnly
                  value={waLink}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-border font-mono text-xs text-[#25d366] select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copyToClipboard(waLink)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25d366] hover:bg-[#22c55e] text-white text-xs font-semibold transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copier
                    </>
                  )}
                </button>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Tester
                </a>
              </div>
              <p className="text-[10px] text-foreground-subtle mt-2">
                Ce lien ouvre WhatsApp avec ton numéro <span className="font-medium">+965 9959 2234</span> et un message déjà tapé avec le produit. UTM <code className="px-1 py-0.5 rounded bg-surface-muted">whatsapp</code> ajouté automatiquement pour suivre les conversions.
              </p>
            </div>
          </div>
        )}

        {!selected && results.length === 0 && query.trim().length >= 2 && !searching && (
          <p className="text-sm text-foreground-subtle text-center py-6">
            Aucun produit ne correspond à « {query} »
          </p>
        )}
        {!selected && query.trim().length === 0 && (
          <div className="flex items-center gap-3 px-4 py-4 rounded-lg bg-surface-muted/50 border border-dashed border-border">
            <Users className="w-5 h-5 text-foreground-subtle shrink-0" />
            <p className="text-xs text-foreground-muted">
              Tape le nom ou le SKU d&apos;un produit pour générer un lien WhatsApp avec message pré-rempli. Idéal pour stories Instagram, DMs et descriptions de pubs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
