"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  ShoppingBag,
  Calendar,
  PieChart,
  Settings,
  MessageCircle,
  Ghost,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/meta-ads", label: "Meta Ads", icon: Megaphone },
  { href: "/snapchat", label: "Snapchat Ads", icon: Ghost },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/shopify-audit", label: "Shopify Audit", icon: ShoppingBag },
  { href: "/content", label: "Content", icon: Calendar },
  { href: "/budget", label: "Budget", icon: PieChart },
  { href: "/settings", label: "Connections", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-white/10 bg-[#0b1120] flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
        <Image src="/logo.png" alt="Blue Marine" width={36} height={36} className="rounded-lg bg-white p-0.5" />
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Blue Marine</h1>
          <p className="text-[11px] text-slate-500">Marketing Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="rounded-lg bg-accent/10 px-4 py-3">
          <p className="text-xs font-semibold text-accent">2026 Goal</p>
          <p className="text-lg font-bold text-white">$1,000,000</p>
          <p className="text-[11px] text-slate-400 mt-1">~$83,333 / month</p>
        </div>
      </div>
    </aside>
  );
}
