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
const budgetWithAmounts = budgetAllocation.map((b) => ({
  ...b,
  amount: Math.round((b.percentage / 100) * 158000), // ~$158k/year ad budget estimate
}));

const COLORS = ["#1877f2", "#ea4335", "#000000", "#e1306c", "#8b5cf6", "#22c55e", "#f59e0b"];

export default function BudgetPage() {
  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <h1 className="text-xl font-bold text-white">Budget & Products</h1>
        <p className="text-sm text-slate-400 mt-0.5">Budget allocation and product categories</p>
      </header>

      <div className="p-8 space-y-8">
        {/* Budget Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="rounded-xl bg-card border border-white/5 p-6">
            <h2 className="text-sm font-semibold text-white mb-1">Marketing Budget Breakdown</h2>
            <p className="text-xs text-slate-500 mb-6">Allocation by channel</p>
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
                    formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Budget Table */}
          <div className="rounded-xl bg-card border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Channel Details</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                  <th className="px-6 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium text-right">%</th>
                  <th className="px-6 py-3 font-medium text-right">Budget / year</th>
                </tr>
              </thead>
              <tbody>
                {budgetWithAmounts.map((b, i) => (
                  <tr key={b.category} className="border-b border-white/5 hover:bg-white/[.02] transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-white">{b.category}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-accent font-medium">{b.percentage}%</td>
                    <td className="px-6 py-3.5 text-right text-white font-medium">${b.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10">
                  <td className="px-6 py-3 font-semibold text-white">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">{totalBudget}%</td>
                  <td className="px-6 py-3 text-right font-semibold text-white">
                    ${budgetWithAmounts.reduce((s, b) => s + b.amount, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* KPI Targets */}
        <div className="rounded-xl bg-card border border-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Target KPIs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(kpiDefinitions).map(([key, kpi]) => (
              <div key={key} className="text-center p-4 rounded-lg bg-white/[.03] border border-white/5">
                <p className="text-2xl font-bold text-white">
                  {kpi.unit === "$" && "$"}{kpi.target}{kpi.unit === "%" && "%"}{kpi.unit === "x" && "x"}
                </p>
                <p className="text-xs text-slate-400 mt-1">{kpi.name}</p>
                <p className="text-[10px] text-slate-600 mt-1">{kpi.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Product Categories */}
        <div className="rounded-xl bg-card border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-white">Product Categories</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Avg Price</th>
                <th className="px-4 py-3 font-medium text-right">Margin</th>
                <th className="px-6 py-3 font-medium text-center">Best Seller</th>
              </tr>
            </thead>
            <tbody>
              {productCategories.map((p) => (
                <tr key={p.name} className="border-b border-white/5 hover:bg-white/[.02] transition-colors">
                  <td className="px-6 py-3.5 font-medium text-white">{p.name}</td>
                  <td className="px-4 py-3.5 text-right text-white">${p.avgPrice}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-medium ${p.margin >= 70 ? "text-green-400" : p.margin >= 60 ? "text-accent" : "text-orange-400"}`}>
                      {p.margin}%
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {p.bestSeller ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Best Seller</span>
                    ) : (
                      <span className="text-slate-600">—</span>
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
