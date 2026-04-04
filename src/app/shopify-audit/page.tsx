"use client";

import { useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, Shield } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import { shopifyAuditChecklist } from "@/data/dashboardData";

export default function ShopifyAuditPage() {
  const [checklist, setChecklist] = useState(shopifyAuditChecklist);

  const totalTasks = checklist.reduce((sum, cat) => sum + cat.items.length, 0);
  const doneTasks = checklist.reduce((sum, cat) => sum + cat.items.filter((i) => i.done).length, 0);
  const percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const toggleTask = (catIndex: number, itemIndex: number) => {
    setChecklist((prev) => {
      const updated = prev.map((cat, ci) => {
        if (ci !== catIndex) return cat;
        return {
          ...cat,
          items: cat.items.map((item, ii) =>
            ii === itemIndex ? { ...item, done: !item.done } : item
          ),
        };
      });
      return updated;
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
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <h1 className="text-xl font-bold text-white">Shopify Audit</h1>
        <p className="text-sm text-slate-400 mt-0.5">E-commerce optimization checklist</p>
      </header>

      <div className="p-8 space-y-8">
        {/* Global Progress */}
        <div className="rounded-xl bg-card border border-white/5 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-accent" />
              <h2 className="text-sm font-semibold text-white">Overall Progress</h2>
            </div>
            <span className="text-sm font-bold text-accent">{percentage}%</span>
          </div>
          <ProgressBar value={doneTasks} max={totalTasks} color="bg-accent" size="md" />
          <p className="text-xs text-slate-500 mt-2">{doneTasks} / {totalTasks} tasks completed</p>
        </div>

        {/* Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {checklist.map((category, catIndex) => {
            const catDone = category.items.filter((i) => i.done).length;
            const catTotal = category.items.length;
            const colorClass = categoryIcons[category.category] || "text-accent";

            return (
              <div key={category.category} className="rounded-xl bg-card border border-white/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <h3 className={`text-sm font-semibold ${colorClass}`}>{category.category}</h3>
                  <span className="text-xs text-slate-500">{catDone}/{catTotal}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {category.items.map((item, itemIndex) => (
                    <button
                      key={item.task}
                      onClick={() => toggleTask(catIndex, itemIndex)}
                      className="w-full flex items-center gap-3 px-6 py-3.5 text-left hover:bg-white/[.02] transition-colors"
                    >
                      {item.done ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${item.done ? "text-slate-500 line-through" : "text-white"}`}>
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
