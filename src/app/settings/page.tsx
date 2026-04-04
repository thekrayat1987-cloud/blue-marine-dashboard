"use client";

import { ShoppingBag, AtSign, Megaphone, CheckCircle2, ExternalLink } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <h1 className="text-xl font-bold text-white">Connexions API</h1>
        <p className="text-sm text-slate-400 mt-0.5">Connecte tes comptes pour alimenter le dashboard</p>
      </header>

      <div className="p-8 space-y-6 max-w-2xl">
        {/* Shopify */}
        <div className="rounded-xl bg-card border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#96bf48]/20 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-[#96bf48]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Shopify</h2>
              <p className="text-xs text-slate-500">Commandes, produits, revenue</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Clique sur le bouton pour autoriser l'acces a ta boutique Shopify. Tu seras redirige vers Shopify pour confirmer.
          </p>
          <a
            href="/api/auth/shopify"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#96bf48] text-white text-sm font-medium hover:bg-[#7da63a] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Connecter Shopify
          </a>
        </div>

        {/* Meta / Facebook Ads */}
        <div className="rounded-xl bg-card border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#1877f2]/20 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-[#1877f2]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Meta Ads (Facebook)</h2>
              <p className="text-xs text-slate-500">Campagnes, depenses, ROAS</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-2">
            Pour connecter Meta Ads, ajoute ton token dans le fichier <code className="text-accent">.env.local</code> :
          </p>
          <div className="bg-black/30 rounded-lg p-3 text-xs font-mono text-slate-300 mb-3">
            META_ACCESS_TOKEN=ton_token_ici<br />
            META_AD_ACCOUNT_ID=act_xxxxxxxxx<br />
            META_INSTAGRAM_ID=xxxxxxxxx
          </div>
          <p className="text-[10px] text-slate-500">
            Trouve ces infos sur <a href="https://developers.facebook.com/tools/explorer/" target="_blank" className="text-blue-400 hover:underline">Graph API Explorer</a>
          </p>
        </div>

        {/* Instagram */}
        <div className="rounded-xl bg-card border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#e1306c]/20 flex items-center justify-center">
              <AtSign className="w-5 h-5 text-[#e1306c]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Instagram</h2>
              <p className="text-xs text-slate-500">Followers, engagement, reach</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Instagram utilise le meme token Meta. Une fois Meta Ads connecte, Instagram est automatiquement connecte aussi.
          </p>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            Partage le meme token que Meta Ads
          </div>
        </div>
      </div>
    </div>
  );
}
