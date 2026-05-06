"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, Shield, Loader2 } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import { shopifyAuditChecklist } from "@/data/dashboardData";

const taskKey = (category: string, task: string) => `${category}|${task}`;

type AuditEntry = { task_key: string; done: boolean };

export default function ShopifyAuditPage() {
  const [checklist, setChecklist] = useState(shopifyAuditChecklist);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/audit/checklist")
      .then((r) => r.json())
      .then((res: { entries?: AuditEntry[] }) => {
        if (cancelled) return;
        const map = new Map((res.entries ?? []).map((e) => [e.task_key, e.done]));
        setChecklist((prev) =>
          prev.map((cat) => ({
            ...cat,
            items: cat.items.map((item) => ({
              ...item,
              done: map.get(taskKey(cat.category, item.task)) ?? false,
            })),
          }))
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalTasks = checklist.reduce((sum, cat) => sum + cat.items.length, 0);
  const doneTasks = checklist.reduce((sum, cat) => sum + cat.items.filter((i) => i.done).length, 0);
  const percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const toggleTask = (catIndex: number, itemIndex: number) => {
    const cat = checklist[catIndex];
    const item = cat.items[itemIndex];
    const newDone = !item.done;
    const key = taskKey(cat.category, item.task);

    setChecklist((prev) =>
      prev.map((c, ci) =>
        ci !== catIndex
          ? c
          : {
              ...c,
              items: c.items.map((it, ii) =>
                ii === itemIndex ? { ...it, done: newDone } : it
              ),
            }
      )
    );

    fetch("/api/audit/checklist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_key: key, done: newDone }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
      })
      .catch(() => {
        setChecklist((prev) =>
          prev.map((c, ci) =>
            ci !== catIndex
              ? c
              : {
                  ...c,
                  items: c.items.map((it, ii) =>
                    ii === itemIndex ? { ...it, done: !newDone } : it
                  ),
                }
          )
        );
      });
  };

  const categoryIcons: Record<string, string> = {
    Performance: "text-blue-400",
    SEO: "text-green-400",
    Conversion: "text-orange-400",
    "Trust & Branding": "text-purple-400",
  };

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <h1 className="text-xl font-bold text-foreground">Shopify Audit</h1>
        <p className="text-sm text-foreground-muted mt-0.5">E-commerce optimization checklist</p>
      </header>

      <div className="p-8 space-y-8">
        {/* Global Progress */}
        <div className="rounded-xl bg-surface border border-border p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Overall Progress</h2>
            </div>
            <div className="flex items-center gap-2">
              {!loaded && <Loader2 className="w-3.5 h-3.5 text-foreground-subtle animate-spin" />}
              <span className="text-sm font-bold text-accent">{percentage}%</span>
            </div>
          </div>
          <ProgressBar value={doneTasks} max={totalTasks} color="bg-accent" size="md" />
          <p className="text-xs text-foreground-subtle mt-2">{doneTasks} / {totalTasks} tasks completed</p>
        </div>

        {/* Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {checklist.map((category, catIndex) => {
            const catDone = category.items.filter((i) => i.done).length;
            const catTotal = category.items.length;
            const colorClass = categoryIcons[category.category] || "text-accent";

            return (
              <div key={category.category} className="rounded-xl bg-surface border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${colorClass}`}>{category.category}</h3>
                  <span className="text-xs text-foreground-subtle">{catDone}/{catTotal}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {category.items.map((item, itemIndex) => (
                    <button
                      key={item.task}
                      onClick={() => toggleTask(catIndex, itemIndex)}
                      disabled={!loaded}
                      className="w-full flex items-center gap-3 px-6 py-3.5 text-left hover:bg-surface-muted transition-colors disabled:opacity-60 disabled:cursor-wait"
                    >
                      {item.done ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-foreground-subtle shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${item.done ? "text-foreground-subtle line-through" : "text-foreground"}`}>
                        {item.task}
                      </span>
                      {item.priority === "high" && !item.done && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          High priority
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
