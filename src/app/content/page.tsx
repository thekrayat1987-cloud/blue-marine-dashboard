"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { contentCalendar, reelsIdeas } from "@/data/dashboardData";

const dayLabels: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const typeIcons: Record<string, typeof Video> = {
  Reel: Video,
  Story: MessageSquare,
  Carousel: ImageIcon,
  "Story + Post": ImageIcon,
};

type Status = "draft" | "ready" | "posted";

type PostSlot = {
  day: string;
  dayKey: string;
  time: string;
  type: string;
  topic: string;
  caption: string;
  hashtags: string;
};

const publicationPlan: { day: string; dayKey: string; posts: Omit<PostSlot, "day" | "dayKey">[] }[] = [
  { day: "Monday", dayKey: "monday", posts: [
    { time: "12:00", type: "Reel", topic: "Behind the scenes / Crafting", caption: "Sewing process or fabric sourcing", hashtags: "#BlueMarine #MadeInKuwait #Dishdasha #HandMade #KuwaitFashion" },
  ]},
  { day: "Tuesday", dayKey: "tuesday", posts: [
    { time: "18:00", type: "Story", topic: "Product of the day + Poll", caption: "Which color do you prefer? Interactive poll", hashtags: "#OOTD #KuwaitStyle #TraditionalWear" },
    { time: "20:00", type: "Story", topic: "Q&A / Questions box", caption: "Ask us anything about our collections", hashtags: "#AskBlueMarine #Kuwait" },
  ]},
  { day: "Wednesday", dayKey: "wednesday", posts: [
    { time: "12:00", type: "Reel", topic: "Style / OOTD / Lookbook", caption: "3 ways to wear the abaya or GRWM event", hashtags: "#AbayaStyle #ModestFashion #KuwaitFashion #GRWM #Lookbook" },
  ]},
  { day: "Thursday", dayKey: "thursday", posts: [
    { time: "17:00", type: "Carousel", topic: "Educational / Guide / Tips", caption: "How to spot quality fabric / Care guide", hashtags: "#FashionTips #QualityFabric #BlueMarine #KuwaitLife" },
  ]},
  { day: "Friday", dayKey: "friday", posts: [
    { time: "10:00", type: "Story", topic: "Jumu'ah Vibes", caption: "Friday outfit + inspiring message", hashtags: "#JumuahMubarak #FridayVibes #Kuwait" },
    { time: "19:00", type: "Story", topic: "Weekend Promo", caption: "Weekend special offer / New product", hashtags: "#WeekendSale #BlueMarine #ShopNow" },
  ]},
  { day: "Saturday", dayKey: "saturday", posts: [
    { time: "13:00", type: "Reel", topic: "UGC / Customer testimonial", caption: "Customer unboxing reaction or before/after alterations", hashtags: "#CustomerReview #Unboxing #BlueMarine #KuwaitShopping" },
  ]},
  { day: "Sunday", dayKey: "sunday", posts: [
    { time: "18:00", type: "Post", topic: "Weekly recap", caption: "New arrivals + best-sellers + next week preview", hashtags: "#WeeklyRecap #NewArrivals #BlueMarine #KuwaitFashion" },
    { time: "20:00", type: "Story", topic: "Next week teaser", caption: "Preview of upcoming content", hashtags: "#ComingSoon #StayTuned" },
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
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun..6=Sat
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

function nextStatus(s: Status): Status {
  if (s === "draft") return "ready";
  if (s === "ready") return "posted";
  return "draft";
}

function statusStyles(s: Status) {
  switch (s) {
    case "posted":
      return { label: "Posted", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "ready":
      return { label: "Ready", icon: CircleDot, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    default:
      return { label: "Draft", icon: Circle, cls: "bg-white/5 text-foreground-subtle border-white/10" };
  }
}

export default function ContentPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const weekIso = useMemo(() => toIsoDate(weekStart), [weekStart]);

  const weekLabel = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
          status: target,
          posted_at: target === "posted" ? new Date().toISOString() : null,
        },
      };
    });

    try {
      const res = await fetch("/api/content/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekIso, day: dayKey, time, status: target }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setEntries((prev) => ({ ...prev, [key]: json.entry }));
    } catch (e) {
      setError((e as Error).message);
      setEntries((prev) => ({ ...prev, [key]: { ...(prev[key] as Entry), status: current } }));
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

  const totalSlots = publicationPlan.reduce((acc, d) => acc + d.posts.length, 0);
  const postedCount = Object.values(entries).filter((e) => e.status === "posted").length;

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Content & Publications</h1>
            <p className="text-sm text-foreground-muted mt-0.5">Content calendar + Instagram publication plan</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-foreground-muted">
              <span className="font-mono text-foreground">{postedCount}</span> / {totalSlots} posted
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-1 py-1">
              <button onClick={() => shiftWeek(-7)} className="p-1.5 hover:bg-white/5 rounded transition-colors" aria-label="Previous week">
                <ChevronLeft className="w-4 h-4 text-foreground-muted" />
              </button>
              <span className="text-xs font-medium text-foreground px-2 min-w-[140px] text-center">{weekLabel}</span>
              <button onClick={() => shiftWeek(7)} className="p-1.5 hover:bg-white/5 rounded transition-colors" aria-label="Next week">
                <ChevronRight className="w-4 h-4 text-foreground-muted" />
              </button>
            </div>
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
            Weekly Calendar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {Object.entries(contentCalendar).map(([day, data]) => {
              const Icon = typeIcons[data.type] || Video;
              return (
                <div key={day} className="rounded-xl bg-surface border border-border p-4">
                  <p className="text-xs font-semibold text-accent mb-2">{dayLabels[day]}</p>
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
            Instagram Publication Plan
          </h2>
          <p className="text-xs text-foreground-muted mb-4">
            Optimized times for Kuwait (GMT+3) — Click status pill to cycle: Draft → Ready → Posted
            {loading && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
          </p>
          <div className="space-y-4">
            {publicationPlan.map((day) => (
              <div key={day.dayKey} className="rounded-xl bg-surface border border-border overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-surface-muted">
                  <span className="text-sm font-semibold text-accent">{day.day}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {day.posts.map((post) => {
                    const key = `${day.dayKey}|${post.time}`;
                    const entry = entries[key];
                    const status: Status = entry?.status ?? "draft";
                    const styles = statusStyles(status);
                    const StatusIcon = styles.icon;
                    const isPending = pending[key];
                    return (
                      <div key={post.time} className="px-5 py-4 flex flex-col md:flex-row md:items-start gap-4">
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
                          <p className="text-xs text-foreground-muted mt-1">{entry?.custom_caption || post.caption}</p>
                          <div className="flex items-center gap-1 mt-2">
                            <Hash className="w-3 h-3 text-foreground-subtle" />
                            <p className="text-[10px] text-foreground-subtle truncate">{entry?.custom_hashtags || post.hashtags}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => cycleStatus(day.dayKey, post.time)}
                          disabled={isPending || loading}
                          className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors hover:opacity-80 disabled:opacity-50 ${styles.cls}`}
                          title="Click to change status"
                        >
                          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <StatusIcon className="w-3 h-3" />}
                          {styles.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reels Ideas */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-pink-400" />
            Reels Ideas
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
                            Trending
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
