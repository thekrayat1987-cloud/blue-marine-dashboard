"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Upload,
  Loader2,
  AlertCircle,
  ImageIcon,
  Copy,
  Check,
  Heart,
  Megaphone,
  Hash,
  X,
  Camera,
  Music2,
  Award,
  Languages,
  Target,
  Wand2,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Platform = "instagram" | "tiktok";
type Language = "ar" | "fr" | "en";
type Framework = "AIDA" | "PAS" | "STORYTELLING" | "CURIOSITY_GAP" | "AUTO";
type Tone =
  | "luxe_discret"
  | "emotionnel"
  | "playful"
  | "autorite"
  | "storytelling";
type Objective =
  | "vente_directe"
  | "engagement"
  | "awareness"
  | "dm_whatsapp";
type Angle = "EMOTIONAL" | "DIRECT_SELLER" | "ENGAGEMENT";

type CaptionVariant = {
  platform: Platform;
  language: Language;
  framework: "AIDA" | "PAS" | "STORYTELLING" | "CURIOSITY_GAP";
  angle: Angle;
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

type HistoryItem = {
  id: string;
  created_at: string;
  keywords: string;
  occasion: string | null;
  platforms: Platform[];
  languages: Language[];
  variants: CaptionVariant[];
};

const platformLabels: Record<Platform, { label: string; Icon: typeof Camera; color: string }> = {
  instagram: { label: "Instagram", Icon: Camera, color: "text-instagram" },
  tiktok: { label: "TikTok", Icon: Music2, color: "text-foreground" },
};

const languageLabels: Record<Language, string> = {
  ar: "Arabe",
  fr: "Français",
  en: "Anglais",
};

const angleLabels: Record<Angle, { label: string; tagline: string; color: string }> = {
  EMOTIONAL: {
    label: "Émotionnel",
    tagline: "Storytelling, soft, archetype",
    color: "bg-info-soft text-info",
  },
  DIRECT_SELLER: {
    label: "Vendeur direct",
    tagline: "AIDA/PAS, drive WhatsApp",
    color: "bg-success-soft text-success",
  },
  ENGAGEMENT: {
    label: "Engagement",
    tagline: "Question, conversation opener",
    color: "bg-warning-soft text-warning",
  },
};

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "luxe_discret", label: "Luxe discret" },
  { value: "emotionnel", label: "Émotionnel" },
  { value: "playful", label: "Playful" },
  { value: "autorite", label: "Autorité" },
  { value: "storytelling", label: "Storytelling" },
];

const objectiveOptions: Array<{ value: Objective; label: string }> = [
  { value: "dm_whatsapp", label: "DM WhatsApp" },
  { value: "vente_directe", label: "Vente directe" },
  { value: "engagement", label: "Engagement (commentaires)" },
  { value: "awareness", label: "Awareness (notoriété)" },
];

const frameworkOptions: Array<{ value: Framework; label: string; hint: string }> = [
  { value: "AUTO", label: "Auto (Claude choisit)", hint: "Laisse l'IA choisir le meilleur" },
  { value: "AIDA", label: "AIDA", hint: "Attention → Intérêt → Désir → Action" },
  { value: "PAS", label: "PAS", hint: "Problème → Agitation → Solution" },
  { value: "STORYTELLING", label: "Storytelling", hint: "Héroïne dans son moment" },
  { value: "CURIOSITY_GAP", label: "Curiosity Gap", hint: "Ouvre une boucle, résous à la fin" },
];

const occasionPresets = [
  "mariage",
  "henna",
  "soirée",
  "eid",
  "formal",
  "gathering",
  "fiançailles",
];

const MAX_IMAGES = 5;
const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo brut autorisé — l'image sera resize côté navigateur avant envoi
const MAX_DIMENSION = 1568; // Sweet spot vision Claude
const JPEG_QUALITY = 0.85;
const IG_LIMIT = 2200;
const TIKTOK_VISIBLE = 150;

async function resizeImageForUpload(file: File): Promise<File> {
  // Decode the image
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file; // fallback: send original
  }
  ctx.drawImage(bitmap, 0, 0, newW, newH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;

  // If resize made it heavier (rare with small originals), keep original
  if (blob.size >= file.size && scale === 1) return file;

  const safeName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], safeName, { type: "image/jpeg" });
}

export default function CaptionsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [occasion, setOccasion] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram", "tiktok"]);
  const [languages, setLanguages] = useState<Language[]>(["ar", "fr"]);
  const [tone, setTone] = useState<Tone>("luxe_discret");
  const [objective, setObjective] = useState<Objective>("dm_whatsapp");
  const [framework, setFramework] = useState<Framework>("AUTO");
  const [regenerateNote, setRegenerateNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<CaptionVariant[]>([]);
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(
    null,
  );

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  useEffect(() => {
    fetch("/api/captions/history?limit=10")
      .then((r) => r.json())
      .then((d) => setHistory(d.items ?? []))
      .catch(() => setHistory([]));
  }, []);

  function onFilesPicked(picked: FileList | null) {
    if (!picked) return;
    const incoming = Array.from(picked);
    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_BYTES) {
        setError(`${f.name} dépasse 20 Mo — ignorée`);
        continue;
      }
      valid.push(f);
    }
    const combined = [...files, ...valid].slice(0, MAX_IMAGES);
    const newPreviews = combined.map((f) => URL.createObjectURL(f));
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles(combined);
    setPreviews(newPreviews);
  }

  function removeImage(idx: number) {
    URL.revokeObjectURL(previews[idx]);
    setFiles(files.filter((_, i) => i !== idx));
    setPreviews(previews.filter((_, i) => i !== idx));
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }
  function toggleLanguage(l: Language) {
    setLanguages((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  }

  async function handleGenerate() {
    setError(null);
    if (files.length === 0) {
      setError("Ajoute au moins 1 photo");
      return;
    }
    if (!keywords.trim()) {
      setError("Donne des mots-clés");
      return;
    }
    if (platforms.length === 0) {
      setError("Choisis au moins 1 plateforme");
      return;
    }
    if (languages.length === 0) {
      setError("Choisis au moins 1 langue");
      return;
    }

    setLoading(true);
    setVariants([]);
    try {
      const resized = await Promise.all(files.map((f) => resizeImageForUpload(f)));

      const fd = new FormData();
      for (const f of resized) fd.append("images", f);
      fd.append("keywords", keywords.trim());
      if (occasion.trim()) fd.append("occasion", occasion.trim());
      for (const p of platforms) fd.append("platforms", p);
      for (const l of languages) fd.append("languages", l);
      fd.append("tone", tone);
      fd.append("objective", objective);
      fd.append("framework", framework);
      if (regenerateNote.trim()) fd.append("regenerateNote", regenerateNote.trim());

      const res = await fetch("/api/captions/generate", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      let json: { variants?: CaptionVariant[]; usage?: { input_tokens: number; output_tokens: number }; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        if (res.status === 413 || /too large|request entity/i.test(text)) {
          throw new Error(
            "Photos trop lourdes pour Vercel (limite 4.5 Mo). Réduis la taille ou enlève une photo.",
          );
        }
        throw new Error(`Réponse serveur invalide (${res.status}). ${text.slice(0, 100)}`);
      }
      if (!res.ok) throw new Error(json.error ?? "Erreur de génération");
      setVariants(json.variants ?? []);
      setUsage(json.usage ?? null);
      // refresh history
      fetch("/api/captions/history?limit=10")
        .then((r) => r.json())
        .then((d) => setHistory(d.items ?? []))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 md:px-10 py-8 md:py-10 max-w-[1400px] mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" strokeWidth={1.75} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Captions IA — Instagram & TikTok
          </h1>
        </div>
        <p className="text-sm text-foreground-muted ml-13">
          Copywriter expert intégré : Pack Pro (AIDA/PAS/Story + Scroll-Stop Score + écriture sensorielle).
          3 variantes par plateforme/langue.
        </p>
      </header>

      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        {/* LEFT — Inputs */}
        <div className="space-y-5">
          {/* Images */}
          <section className="bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-accent" strokeWidth={1.75} />
                Photos ({files.length}/{MAX_IMAGES})
              </h2>
              {files.length < MAX_IMAGES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Ajouter
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onFilesPicked(e.target.files)}
            />
            {files.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-border-strong rounded-xl flex flex-col items-center justify-center gap-2 text-foreground-muted hover:border-accent hover:text-accent transition-colors"
              >
                <Upload className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm">Glisse ou clique pour ajouter</span>
                <span className="text-[10px]">JPG/PNG/WebP — compressées auto avant envoi, jusqu&apos;à 5</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((url, i) => (
                  <div key={i} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-surface-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-6 h-6 bg-foreground/70 hover:bg-danger text-white rounded-full flex items-center justify-center"
                      aria-label="Retirer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Keywords + occasion */}
          <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5">
                Mots-clés <span className="text-danger">*</span>
              </label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="ex: bisht velours bordeaux, broderie or, mariée moderne"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5">
                Occasion
              </label>
              <input
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="mariage, henna, eid…"
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {occasionPresets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setOccasion(p)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border text-foreground-muted hover:border-accent hover:text-accent"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Platforms */}
          <section className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-accent" strokeWidth={1.75} />
              Plateformes
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(platformLabels) as Platform[]).map((p) => {
                const { label, Icon, color } = platformLabels[p];
                const active = platforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      active
                        ? "border-accent bg-accent-soft text-foreground font-medium"
                        : "border-border text-foreground-muted hover:border-accent-hover"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? color : ""}`} strokeWidth={1.75} />
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Languages */}
          <section className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
              <Languages className="w-4 h-4 text-accent" strokeWidth={1.75} />
              Langues
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(languageLabels) as Language[]).map((l) => {
                const active = languages.includes(l);
                return (
                  <button
                    key={l}
                    onClick={() => toggleLanguage(l)}
                    className={`px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      active
                        ? "border-accent bg-accent-soft text-foreground font-medium"
                        : "border-border text-foreground-muted hover:border-accent-hover"
                    }`}
                  >
                    {languageLabels[l]}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Tone + Objective + Framework */}
          <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Heart className="w-3 h-3" /> Ton
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              >
                {toneOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Target className="w-3 h-3" /> Objectif
              </label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as Objective)}
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              >
                {objectiveOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Award className="w-3 h-3" /> Framework copywriting
              </label>
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value as Framework)}
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              >
                {frameworkOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-foreground-subtle mt-1.5">
                {frameworkOptions.find((o) => o.value === framework)?.hint}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-1.5">
                Note de régénération (optionnel)
              </label>
              <input
                value={regenerateNote}
                onChange={(e) => setRegenerateNote(e.target.value)}
                placeholder="plus court / plus émotionnel / plus vendeur…"
                className="w-full px-3 py-2 text-sm bg-surface-muted border border-border rounded-lg focus:outline-none focus:border-accent"
              />
            </div>
          </section>

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" strokeWidth={1.75} />
                Générer 3 variantes
              </>
            )}
          </button>

          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-xl p-3 flex items-start gap-2 text-sm text-danger">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* RIGHT — Results */}
        <div className="space-y-4">
          {loading && (
            <div className="bg-surface border border-border rounded-2xl p-10 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto mb-3" />
              <p className="font-display text-lg text-foreground">
                Claude analyse les photos et écrit…
              </p>
              <p className="text-xs text-foreground-muted mt-1.5">
                Pack Pro actif : Scroll-Stop ≥ 8/10 + écriture sensorielle forcée
              </p>
            </div>
          )}

          {!loading && variants.length === 0 && (
            <div className="bg-surface border border-border rounded-2xl p-10 text-center">
              <Sparkles className="w-10 h-10 text-accent-soft mx-auto mb-3" strokeWidth={1.5} />
              <p className="font-display text-lg text-foreground">
                Prête à générer
              </p>
              <p className="text-sm text-foreground-muted mt-1.5 max-w-md mx-auto">
                Ajoute tes photos, des mots-clés, choisis plateforme et langue, puis clique sur Générer.
              </p>
            </div>
          )}

          {variants.length > 0 && usage && (
            <div className="bg-accent-soft border border-accent/30 rounded-xl px-4 py-2.5 text-xs text-foreground-muted flex items-center justify-between">
              <span>
                <strong className="text-foreground">{variants.length} variantes</strong> générées
              </span>
              <span>
                {usage.input_tokens} in · {usage.output_tokens} out tokens
              </span>
            </div>
          )}

          {variants.length > 0 &&
            groupVariants(variants).map((group, gi) => (
              <section
                key={gi}
                className="bg-surface border border-border rounded-2xl p-5"
              >
                <header className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const { Icon, color, label } = platformLabels[group.platform];
                      return (
                        <>
                          <Icon className={`w-5 h-5 ${color}`} strokeWidth={1.75} />
                          <span className="font-display text-lg font-semibold">{label}</span>
                        </>
                      );
                    })()}
                    <span className="text-foreground-subtle">·</span>
                    <span className="text-sm text-foreground-muted">
                      {languageLabels[group.language]}
                    </span>
                  </div>
                </header>
                <div className="space-y-4">
                  {group.variants.map((v, i) => (
                    <VariantCard key={i} variant={v} />
                  ))}
                </div>
              </section>
            ))}

          {/* History */}
          <section className="bg-surface border border-border rounded-2xl">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-display text-base font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-accent" strokeWidth={1.75} />
                Historique ({history.length})
              </span>
              {historyOpen ? (
                <ChevronUp className="w-4 h-4 text-foreground-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-foreground-muted" />
              )}
            </button>
            {historyOpen && history.length > 0 && (
              <ul className="border-t border-border divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground font-medium truncate">
                        {h.keywords}
                      </span>
                      <span className="text-[11px] text-foreground-subtle ml-3 shrink-0">
                        {new Date(h.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="text-[11px] text-foreground-muted mt-0.5">
                      {h.platforms.join(", ")} · {h.languages.join(", ")} ·{" "}
                      {h.variants.length} variantes
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {historyOpen && history.length === 0 && (
              <div className="px-5 py-4 text-sm text-foreground-muted border-t border-border">
                Aucun historique pour le moment.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

type VariantGroup = {
  platform: Platform;
  language: Language;
  variants: CaptionVariant[];
};
function groupVariants(variants: CaptionVariant[]): VariantGroup[] {
  const map = new Map<string, VariantGroup>();
  for (const v of variants) {
    const k = `${v.platform}__${v.language}`;
    if (!map.has(k)) {
      map.set(k, { platform: v.platform, language: v.language, variants: [] });
    }
    map.get(k)!.variants.push(v);
  }
  return Array.from(map.values());
}

function VariantCard({ variant }: { variant: CaptionVariant }) {
  const [copied, setCopied] = useState(false);
  const angleStyle = angleLabels[variant.angle] ?? angleLabels.EMOTIONAL;
  const isRtl = variant.language === "ar";
  const limit = variant.platform === "instagram" ? IG_LIMIT : TIKTOK_VISIBLE;
  const overLimit = variant.char_count > limit;

  async function copy() {
    try {
      await navigator.clipboard.writeText(variant.full_caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="border border-border rounded-xl p-4 hover:border-accent/40 transition-colors">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${angleStyle.color}`}
          >
            {angleStyle.label}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-muted text-foreground-muted">
            {variant.framework}
          </span>
          <ScrollStopBadge score={variant.scroll_stop_score.total} />
        </div>
        <button
          onClick={copy}
          className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-accent-soft transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copié
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copier
            </>
          )}
        </button>
      </div>

      <p className="text-[11px] text-foreground-subtle mb-2 italic">{angleStyle.tagline}</p>

      <pre
        dir={isRtl ? "rtl" : "ltr"}
        className={`whitespace-pre-wrap font-sans text-sm text-foreground bg-surface-muted/60 rounded-lg p-3 leading-relaxed ${
          isRtl ? "text-right" : "text-left"
        }`}
      >
        {variant.full_caption}
      </pre>

      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[11px] text-foreground-muted">
          <span className={overLimit ? "text-danger font-medium" : ""}>
            {variant.char_count} car. {overLimit && `(>${limit})`}
          </span>
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {variant.hashtags.tier1.length +
              variant.hashtags.tier2.length +
              variant.hashtags.tier3.length}
          </span>
        </div>
        {variant.sensorial_anchors.length > 0 && (
          <div className="text-[10px] text-foreground-subtle italic">
            🌿 {variant.sensorial_anchors.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

function ScrollStopBadge({ score }: { score: number }) {
  const ok = score >= 8;
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
      }`}
      title="Scroll-Stop Score (pattern + émotion + curiosité + visuel)"
    >
      Scroll-Stop {score}/10
    </span>
  );
}
