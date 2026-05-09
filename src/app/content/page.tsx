"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Video,
  Image as ImageIcon,
  MessageSquare,
  Flame,
  Calendar,
  AtSign,
  Clock,
  Hash,
  CheckCircle2,
  Circle,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { contentCalendar, reelsIdeas } from "@/data/dashboardData";

const dayLabels: Record<string, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

const typeIcons: Record<string, typeof Video> = {
  Reel: Video,
  Story: MessageSquare,
  Carousel: ImageIcon,
  "Story + Post": ImageIcon,
};

type Status = "draft" | "ready" | "posted";
type Preset = "studio" | "lookbook" | "lifestyle" | "riad" | "palais" | "desert";

type SlotTemplate = {
  time: string;
  type: string;
  topic: string;
  caption: string;
  hashtags: string;
  preset: Preset;
};

const publicationPlan: { day: string; dayKey: string; posts: SlotTemplate[] }[] = [
  { day: "Lundi", dayKey: "monday", posts: [
    { time: "12:00", type: "Reel", topic: "Coulisses / Atelier", caption: "Processus de couture ou sélection des tissus", hashtags: "#BlueMarine #MadeInKuwait #Bisht #HandMade #KuwaitFashion", preset: "studio" },
  ]},
  { day: "Mardi", dayKey: "tuesday", posts: [
    { time: "18:00", type: "Story", topic: "Produit du jour + Sondage", caption: "Quelle couleur tu préfères ? Sondage interactif", hashtags: "#OOTD #KuwaitStyle #ModestFashion", preset: "studio" },
    { time: "20:00", type: "Story", topic: "Q&R / Boîte à questions", caption: "Pose-nous toutes tes questions sur nos collections", hashtags: "#AskBlueMarine #Kuwait", preset: "studio" },
  ]},
  { day: "Mercredi", dayKey: "wednesday", posts: [
    { time: "12:00", type: "Reel", topic: "Style / OOTD / Lookbook", caption: "3 façons de porter le bisht ou GRWM événement", hashtags: "#BishtStyle #ModestFashion #KuwaitFashion #GRWM #Lookbook", preset: "lookbook" },
  ]},
  { day: "Jeudi", dayKey: "thursday", posts: [
    { time: "17:00", type: "Carousel", topic: "Éducatif / Guide / Conseils", caption: "Comment reconnaître un tissu de qualité / Guide d'entretien", hashtags: "#FashionTips #QualityFabric #BlueMarine #KuwaitLife", preset: "studio" },
  ]},
  { day: "Vendredi", dayKey: "friday", posts: [
    { time: "10:00", type: "Story", topic: "Jumu'ah Vibes", caption: "Tenue du vendredi + message inspirant", hashtags: "#JumuahMubarak #FridayVibes #Kuwait", preset: "lifestyle" },
    { time: "19:00", type: "Story", topic: "Promo week-end", caption: "Offre spéciale week-end / Nouveau produit", hashtags: "#WeekendSale #BlueMarine #ShopNow", preset: "lookbook" },
  ]},
  { day: "Samedi", dayKey: "saturday", posts: [
    { time: "13:00", type: "Reel", topic: "UGC / Témoignage client", caption: "Réaction unboxing client ou avant/après retouches", hashtags: "#CustomerReview #Unboxing #BlueMarine #KuwaitShopping", preset: "lifestyle" },
  ]},
  { day: "Dimanche", dayKey: "sunday", posts: [
    { time: "18:00", type: "Post", topic: "Récap de la semaine", caption: "Nouveautés + best-sellers + aperçu semaine prochaine", hashtags: "#WeeklyRecap #NewArrivals #BlueMarine #KuwaitFashion", preset: "lookbook" },
    { time: "20:00", type: "Story", topic: "Teaser semaine prochaine", caption: "Aperçu du contenu à venir", hashtags: "#ComingSoon #StayTuned", preset: "studio" },
  ]},
];

type Entry = {
  week_start: string;
  day: string;
  time: string;
  status: Status;
  posted_at: string | null;
  custom_caption: string | null;
  custom_hashtags: string | null;
  notes?: string | null;
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayKey(): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

function nextStatus(s: Status): Status {
  if (s === "draft") return "ready";
  if (s === "ready") return "posted";
  return "draft";
}

function statusStyles(s: Status) {
  switch (s) {
    case "posted":
      return { label: "Publié", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "ready":
      return { label: "Prêt", icon: CircleDot, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    default:
      return { label: "Brouillon", icon: Circle, cls: "bg-white/5 text-foreground-subtle border-white/10" };
  }
}

export default function ContentPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftCaption, setDraftCaption] = useState("");
  const [draftHashtags, setDraftHashtags] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const todayKey = useMemo(() => getTodayKey(), []);
  const weekIso = useMemo(() => toIsoDate(weekStart), [weekStart]);

  const isCurrentWeek = useMemo(() => {
    const thisMonday = getMondayOf(new Date());
    return toIsoDate(thisMonday) === weekIso;
  }, [weekIso]);

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${fmt(weekStart)} – ${fmt(end)} ${end.getFullYear()}`;
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/content/status?week_start=${weekIso}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Failed to load");
        return json.entries as Entry[];
      })
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, Entry> = {};
        list.forEach((e) => { map[`${e.day}|${e.time}`] = e; });
        setEntries(map);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekIso]);

  async function patchSlot(dayKey: string, time: string, body: Partial<Entry>) {
    const res = await fetch("/api/content/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: weekIso, day: dayKey, time, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    return json.entry as Entry;
  }

  async function cycleStatus(dayKey: string, time: string) {
    const key = `${dayKey}|${time}`;
    if (pending[key]) return;
    const current: Status = entries[key]?.status ?? "draft";
    const target = nextStatus(current);

    setPending((p) => ({ ...p, [key]: true }));
    setEntries((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          week_start: weekIso,
          day: dayKey,
          time,
          custom_caption: existing?.custom_caption ?? null,
          custom_hashtags: existing?.custom_hashtags ?? null,
          notes: existing?.notes ?? null,
          status: target,
          posted_at: target === "posted" ? new Date().toISOString() : null,
        },
      };
    });

    try {
      const entry = await patchSlot(dayKey, time, { status: target });
      setEntries((prev) => ({ ...prev, [key]: entry }));
    } catch (e) {
      setError((e as Error).message);
      setEntries((prev) => ({ ...prev, [key]: { ...(prev[key] as Entry), status: current } }));
    } finally {
      setPending((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  function startEdit(key: string, template: SlotTemplate) {
    const e = entries[key];
    setDraftCaption(e?.custom_caption ?? template.caption);
    setDraftHashtags(e?.custom_hashtags ?? template.hashtags);
    setDraftNotes(e?.notes ?? "");
    setEditingKey(key);
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraftCaption("");
    setDraftHashtags("");
    setDraftNotes("");
  }

  async function saveEdit(dayKey: string, time: string, template: SlotTemplate) {
    const key = `${dayKey}|${time}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const entry = await patchSlot(dayKey, time, {
        custom_caption: draftCaption.trim() === template.caption ? null : draftCaption,
        custom_hashtags: draftHashtags.trim() === template.hashtags ? null : draftHashtags,
        notes: draftNotes.trim() || null,
      });
      setEntries((prev) => ({ ...prev, [key]: entry }));
      cancelEdit();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending((p) => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  function shiftWeek(deltaDays: number) {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + deltaDays);
      return n;
    });
  }

  function goToCurrentWeek() {
    setWeekStart(getMondayOf(new Date()));
  }

  const totalSlots = publicationPlan.reduce((acc, d) => acc + d.posts.length, 0);
  const postedCount = Object.values(entries).filter((e) => e.status === "posted").length;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Contenu et publications</h1>
            <p className="text-sm text-foreground-muted mt-0.5">Calendrier de contenu + plan de publication Instagram</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-foreground-muted">
              <span className="font-mono text-foreground">{postedCount}</span> / {totalSlots} publiés
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1">
              <button onClick={() => shiftWeek(-7)} className="p-1.5 hover:bg-white/5 rounded transition-colors" aria-label="Semaine précédente">
                <ChevronLeft className="w-4 h-4 text-foreground-muted" />
              </button>
              <span className="text-xs font-medium text-foreground px-2 min-w-[150px] text-center">{weekLabel}</span>
              <button onClick={() => shiftWeek(7)} className="p-1.5 hover:bg-white/5 rounded transition-colors" aria-label="Semaine suivante">
                <ChevronRight className="w-4 h-4 text-foreground-muted" />
              </button>
            </div>
            {!isCurrentWeek && (
              <button onClick={goToCurrentWeek} className="text-xs px-2.5 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 transition-colors">
                Cette semaine
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-400">⚠ {error}</p>
        )}
      </header>

      <div className="p-8 space-y-8">
        {/* Weekly Calendar */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            Calendrier hebdomadaire
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {Object.entries(contentCalendar).map(([day, data]) => {
              const Icon = typeIcons[data.type] || Video;
              const isToday = isCurrentWeek && day === todayKey;
              return (
                <div
                  key={day}
                  className={`rounded-xl bg-surface border p-4 transition-colors ${isToday ? "border-accent ring-1 ring-accent/40" : "border-border"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-accent">{dayLabels[day]}</p>
                    {isToday && <span className="text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/15 px-1.5 py-0.5 rounded">Aujourd&apos;hui</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="w-3.5 h-3.5 text-foreground-muted" />
                    <span className="text-xs font-medium text-foreground">{data.type}</span>
                  </div>
                  <p className="text-[11px] text-foreground-muted leading-relaxed">{data.theme}</p>
                  <p className="text-[10px] text-foreground-subtle mt-2">{data.platform}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Instagram Publication Plan */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AtSign className="w-4 h-4 text-instagram" />
            Plan de publication Instagram
          </h2>
          <p className="text-xs text-foreground-muted mb-4">
            Horaires optimisés pour le Koweït (GMT+3) — Clique sur le statut pour changer : Brouillon → Prêt → Publié
            {loading && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
          </p>
          <div className="space-y-4">
            {publicationPlan.map((day) => {
              const isToday = isCurrentWeek && day.dayKey === todayKey;
              return (
                <div key={day.dayKey} className={`rounded-xl bg-surface border overflow-hidden ${isToday ? "border-accent ring-1 ring-accent/40" : "border-border"}`}>
                  <div className="px-5 py-3 border-b border-border bg-surface-muted flex items-center justify-between">
                    <span className="text-sm font-semibold text-accent">{day.day}</span>
                    {isToday && <span className="text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/15 px-1.5 py-0.5 rounded">Aujourd&apos;hui</span>}
                  </div>
                  <div className="divide-y divide-white/5">
                    {day.posts.map((post) => {
                      const key = `${day.dayKey}|${post.time}`;
                      const entry = entries[key];
                      const status: Status = entry?.status ?? "draft";
                      const styles = statusStyles(status);
                      const StatusIcon = styles.icon;
                      const isPending = pending[key];
                      const isEditing = editingKey === key;
                      const captionText = entry?.custom_caption || post.caption;
                      const hashtagsText = entry?.custom_hashtags || post.hashtags;
                      return (
                        <div key={post.time} className="px-5 py-4">
                          <div className="flex flex-col md:flex-row md:items-start gap-4">
                            <div className="flex items-center gap-2 shrink-0 w-24">
                              <Clock className="w-3.5 h-3.5 text-foreground-subtle" />
                              <span className="text-sm font-mono font-medium text-foreground">{post.time}</span>
                            </div>
                            <div className="shrink-0">
                              <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                                post.type === "Reel" ? "bg-pink-500/20 text-pink-400" :
                                post.type === "Story" ? "bg-purple-500/20 text-purple-400" :
                                post.type === "Carousel" ? "bg-blue-500/20 text-blue-400" :
                                "bg-green-500/20 text-green-400"
                              }`}>
                                {post.type}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${status === "posted" ? "text-foreground-muted line-through" : "text-foreground"}`}>{post.topic}</p>
                              {!isEditing && (
                                <>
                                  <p className="text-xs text-foreground-muted mt-1">{captionText}</p>
                                  <div className="flex items-center gap-1 mt-2">
                                    <Hash className="w-3 h-3 text-foreground-subtle" />
                                    <p className="text-[10px] text-foreground-subtle truncate">{hashtagsText}</p>
                                  </div>
                                  {entry?.notes && (
                                    <p className="text-[11px] text-amber-400/90 mt-2 italic">📝 {entry.notes}</p>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isEditing && (
                                <>
                                  <Link
                                    href={`/product-photo?preset=${post.preset}`}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors"
                                    title={`Générer image (preset ${post.preset})`}
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Image
                                  </Link>
                                  <button
                                    onClick={() => startEdit(key, post)}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-foreground-muted hover:bg-white/10 transition-colors"
                                    title="Modifier la légende"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Modifier
                                  </button>
                                  <button
                                    onClick={() => cycleStatus(day.dayKey, post.time)}
                                    disabled={isPending || loading}
                                    className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors hover:opacity-80 disabled:opacity-50 ${styles.cls}`}
                                    title="Clique pour changer le statut"
                                  >
                                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <StatusIcon className="w-3 h-3" />}
                                    {styles.label}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {isEditing && (
                            <div className="mt-3 ml-0 md:ml-[152px] space-y-2 rounded-lg border border-border bg-background/40 p-3">
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-foreground-subtle font-medium">Légende</label>
                                <textarea
                                  value={draftCaption}
                                  onChange={(e) => setDraftCaption(e.target.value)}
                                  rows={2}
                                  className="w-full mt-1 px-2 py-1.5 rounded border border-border bg-surface text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-foreground-subtle font-medium">Hashtags</label>
                                <textarea
                                  value={draftHashtags}
                                  onChange={(e) => setDraftHashtags(e.target.value)}
                                  rows={2}
                                  className="w-full mt-1 px-2 py-1.5 rounded border border-border bg-surface text-xs text-foreground font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-foreground-subtle font-medium">Notes (privées)</label>
                                <textarea
                                  value={draftNotes}
                                  onChange={(e) => setDraftNotes(e.target.value)}
                                  rows={2}
                                  placeholder="ex. Utiliser le nouveau bisht du shoot de la semaine dernière"
                                  className="w-full mt-1 px-2 py-1.5 rounded border border-border bg-surface text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  onClick={cancelEdit}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded border border-border bg-surface text-foreground-muted hover:bg-white/5"
                                >
                                  <X className="w-3 h-3" />
                                  Annuler
                                </button>
                                <button
                                  onClick={() => saveEdit(day.dayKey, post.time, post)}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
                                >
                                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  Enregistrer
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reels Ideas */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-pink-400" />
            Idées de Reels
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reelsIdeas.map((category) => (
              <div key={category.category} className="rounded-xl bg-surface border border-border overflow-hidden">
                <div className="px-5 py-3 border-b border-border" style={{ borderLeftWidth: 3, borderLeftColor: category.color }}>
                  <span className="text-sm font-semibold text-foreground">{category.category}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {category.ideas.map((idea) => (
                    <div key={idea.title} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">{idea.title}</span>
                        {idea.trending && (
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded-full">
                            <Flame className="w-2.5 h-2.5" />
                            Tendance
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground-muted mt-1">{idea.description}</p>
                      <p className="text-[11px] text-accent mt-2 italic">&ldquo;{idea.hook}&rdquo;</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
