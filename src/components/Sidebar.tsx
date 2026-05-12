"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  Megaphone,
  Calendar,
  PieChart,
  Settings,
  MessageCircle,
  Ghost,
  Sparkles,
  FolderPlus,
  Wand2,
  Target,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { useAnnualGoal } from "@/hooks/useAnnualGoal";

const formatKD = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

const navItems = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/analytics", label: "Analyses", icon: LineChart },
  { href: "/meta-ads", label: "Meta Ads", icon: Megaphone },
  { href: "/meta-ad-planner", label: "Meta Ad Planner", icon: Target },
  { href: "/broadcast-planner", label: "Broadcast WhatsApp", icon: MessageCircle },
  { href: "/snapchat", label: "Snapchat Ads", icon: Ghost },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/product-photo", label: "Photos IA", icon: Sparkles },
  { href: "/captions", label: "Captions IA", icon: Wand2 },
  { href: "/collection-creator", label: "Créer collection", icon: FolderPlus },
  { href: "/content", label: "Contenu", icon: Calendar },
  { href: "/budget", label: "Budget", icon: PieChart },
  { href: "/settings", label: "Connexions", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { goal, monthly } = useAnnualGoal();
  const goalYear = new Date().getFullYear();

  if (pathname === "/login") return null;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Blue Marine" width={28} height={28} className="rounded-md" />
          <span className="font-display text-base font-semibold text-foreground">Blue Marine</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-foreground p-1 rounded-md hover:bg-surface-muted"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          w-64 shrink-0 border-r border-border bg-surface flex flex-col h-full
          transition-transform duration-200 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          top-0 left-0
        `}
      >
        {/* Brand */}
        <div className="px-7 pt-8 pb-6">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Blue Marine"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground tracking-tight leading-none">
                Blue Marine
              </h1>
              <p className="text-[10px] uppercase tracking-[0.18em] text-foreground-subtle mt-1.5">
                Atelier
              </p>
            </div>
          </div>
          <div className="mt-5 gold-rule" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`
                  group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                  ${
                    isActive
                      ? "bg-accent-soft text-accent font-medium"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface-muted"
                  }
                `}
              >
                <Icon
                  className={`w-[17px] h-[17px] ${isActive ? "text-accent" : "text-foreground-subtle group-hover:text-foreground"}`}
                  strokeWidth={1.75}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer — Goal */}
        <div className="px-5 py-5 border-t border-border space-y-3">
          <Link
            href="/settings"
            className="block rounded-xl border border-accent/30 bg-gradient-to-br from-accent-soft to-surface px-4 py-4 hover:border-accent transition-colors"
            title="Modifier l'objectif annuel"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-accent font-medium">
              Objectif {goalYear}
            </p>
            <p className="font-display text-2xl font-semibold text-foreground mt-1.5 tabular-nums">
              {formatKD(goal)} KD
            </p>
            <p className="text-[11px] text-foreground-muted mt-1 tabular-nums">
              ~{formatKD(monthly)} KD / mois
            </p>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground-muted hover:text-foreground hover:bg-surface-muted transition-colors"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}
