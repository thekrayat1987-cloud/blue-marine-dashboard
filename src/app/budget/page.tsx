"use client";

import {
  DollarSign,
  Package,
  TrendingUp,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { budgetAllocation, productCategories, kpiDefinitions, ANNUAL_TARGET } from "@/data/dashboardData";

const totalBudget = budgetAllocation.reduce((sum, b) => sum + b.percentage, 0);
// Budget marketing annuel ~16% du chiffre d'affaires cible (50 000 KD)
const ANNUAL_AD_BUDGET = Math.round(ANNUAL_TARGET * 0.16);
const budgetWithAmounts = budgetAllocation.map((b) => ({
  ...b,
  amount: Math.round((b.percentage / 100) * ANNUAL_AD_BUDGET),
}));

const COLORS = ["#1877f2", "#ea4335", "#000000", "#e1306c", "#8b5cf6", "#22c55e", "#f59e0b"];

export default function BudgetPage() {
  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-8 py-5">
        <h1 className="text-xl font-bold text-foreground">Budget & Products</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Budget allocation and product categories</p>
      </header>

      <div className="p-8 space-y-8">
        {/* Budget Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="rounded-xl bg-surface border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-1">Marketing Budget Breakdown</h2>
            <p className="text-xs text-foreground-subtle mb-6">Allocation by channel</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={budgetWithAmounts}
                    dataKey="percentage"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {budgetWithAmounts.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0", fontSize: 13 }}
                    formatter={(value) => [`${value}%`, undefined]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                    formatter={(value) => <span className="text-foreground-muted text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Budget Table */}
          <div className="rounded-xl bg-surface border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Channel Details</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium text-right">%</th>
                  <th className="px-6 py-3 font-medium text-right">Budget / an</th>
                </tr>
              </thead>
              <tbody>
                {budgetWithAmounts.map((b, i) => (
                  <tr key={b.category} className="border-b border-border hover:bg-surface-muted transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-foreground">{b.category}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-accent font-medium">{b.percentage}%</td>
                    <td className="px-6 py-3.5 text-right text-foreground font-medium">{b.amount.toLocaleString()} KD</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="px-6 py-3 font-semibold text-foreground">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">{totalBudget}%</td>
                  <td className="px-6 py-3 text-right font-semibold text-foreground">
                    {budgetWithAmounts.reduce((s, b) => s + b.amount, 0).toLocaleString()} KD
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* KPI Targets */}
        <div className="rounded-xl bg-surface border border-border p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Target KPIs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(kpiDefinitions).map(([key, kpi]) => (
              <div key={key} className="text-center p-4 rounded-lg bg-surface-muted border border-border">
                <p className="text-2xl font-bold text-foreground">
                  {kpi.target}{kpi.unit === "KD" ? " KD" : kpi.unit === "%" ? "%" : kpi.unit === "x" ? "x" : ""}
                </p>
                <p className="text-xs text-foreground-muted mt-1">{kpi.name}</p>
                <p className="text-[10px] text-foreground-subtle mt-1">{kpi.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Product Categories */}
        <div className="rounded-xl bg-surface border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Product Categories</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-subtle border-b border-border">
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Avg Price</th>
                <th className="px-4 py-3 font-medium text-right">Margin</th>
                <th className="px-6 py-3 font-medium text-center">Best Seller</th>
              </tr>
            </thead>
            <tbody>
              {productCategories.map((p) => (
                <tr key={p.name} className="border-b border-border hover:bg-surface-muted transition-colors">
                  <td className="px-6 py-3.5 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3.5 text-right text-foreground">{p.avgPrice} KD</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-medium ${p.margin >= 70 ? "text-green-400" : p.margin >= 60 ? "text-accent" : "text-orange-400"}`}>
                      {p.margin}%
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {p.bestSeller ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Best Seller</span>
                    ) : (
                      <span className="text-foreground-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
