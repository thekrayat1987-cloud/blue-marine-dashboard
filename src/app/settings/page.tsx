"use client";

import { ShoppingBag, AtSign, Megaphone, MessageCircle, Ghost, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

type CheckResult = { ok: boolean; detail?: string; error?: string };
type StatusResponse = {
  shopify: CheckResult;
  meta: CheckResult;
  instagram: CheckResult;
  whatsapp: CheckResult;
  snapchat: CheckResult;
  checkedAt: string;
};

type Platform = {
  key: keyof Omit<StatusResponse, "checkedAt">;
  name: string;
  description: string;
  icon: typeof ShoppingBag;
  iconColor: string;
  bgColor: string;
};

const PLATFORMS: Platform[] = [
  { key: "shopify", name: "Shopify", description: "Commandes, produits, revenue", icon: ShoppingBag, iconColor: "#96bf48", bgColor: "#96bf48" },
  { key: "meta", name: "Meta Ads", description: "Facebook + Instagram Ads — campagnes, ROAS", icon: Megaphone, iconColor: "#1877f2", bgColor: "#1877f2" },
  { key: "instagram", name: "Instagram", description: "Followers, engagement, reach", icon: AtSign, iconColor: "#e1306c", bgColor: "#e1306c" },
  { key: "whatsapp", name: "WhatsApp Business", description: "Profil, messages, qualité", icon: MessageCircle, iconColor: "#25d366", bgColor: "#25d366" },
  { key: "snapchat", name: "Snapchat Ads", description: "Campagnes, dépenses", icon: Ghost, iconColor: "#fffc00", bgColor: "#fffc00" },
];

export default function SettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connections/status", { cache: "no-store" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const checkedTime = status ? new Date(status.checkedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Connexions API</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            État des intégrations · {checkedTime ? `Testé à ${checkedTime}` : "En cours..."}
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Re-tester
        </button>
      </header>

      <div className="p-8 space-y-4 max-w-2xl">
        <div className="rounded-xl bg-surface/50 border border-border/50 p-4 text-xs text-foreground-muted">
          Les tokens sont stockés dans Vercel (variables d&apos;environnement). Pour les mettre à jour,
          modifie-les dans le tableau de bord Vercel puis re-déploie. Aucune action OAuth n&apos;est nécessaire ici.
        </div>

        {PLATFORMS.map((platform) => {
          const result = status?.[platform.key];
          const Icon = platform.icon;
          const isLoading = loading && !result;
          const ok = result?.ok === true;
          const failed = result?.ok === false;

          return (
            <div
              key={platform.key}
              className={`rounded-xl bg-surface border p-6 ${
                ok ? "border-green-500/30" : failed ? "border-red-500/30" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${platform.bgColor}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: platform.iconColor }} />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-foreground">{platform.name}</h2>
                  <p className="text-xs text-foreground-subtle">{platform.description}</p>
                </div>
                <div className="shrink-0">
                  {isLoading && (
                    <span className="flex items-center gap-1.5 text-xs text-foreground-subtle bg-surface px-2.5 py-1 rounded-full border border-border">
                      <Loader2 className="w-3 h-3 animate-spin" /> Test...
                    </span>
                  )}
                  {ok && (
                    <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Connecté
                    </span>
                  )}
                  {failed && (
                    <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">
                      <AlertCircle className="w-3 h-3" /> Erreur
                    </span>
                  )}
                </div>
              </div>

              {ok && result?.detail && (
                <p className="text-xs text-foreground-muted pl-13 ml-13">
                  <span className="text-foreground-subtle">Compte&nbsp;:</span> {result.detail}
                </p>
              )}

              {failed && result?.error && (
                <div className="mt-2 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="break-all">{result.error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
