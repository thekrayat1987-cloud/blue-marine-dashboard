"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Phone,
  Send,
  CheckCheck,
  Eye,
  Inbox,
  FileText,
  RefreshCw,
  Loader2,
} from "lucide-react";
import KPICard from "@/components/KPICard";

interface WhatsAppData {
  profile: {
    verifiedName: string;
    displayPhoneNumber: string;
    qualityRating: string;
    phoneId: string;
  } | null;
  analytics: {
    sentMessages: number;
    deliveredMessages: number;
    readMessages: number;
    receivedMessages: number;
  } | null;
  templates: Array<{
    name: string;
    status: string;
    category: string;
    language: string;
  }>;
  lastUpdated: string;
}

export default function WhatsAppPage() {
  const [data, setData] = useState<WhatsAppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/whatsapp");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading WhatsApp data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const analytics = data?.analytics;
  const profile = data?.profile;
  const templates = data?.templates || [];

  return (
    <div className="flex-1 overflow-auto">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur-md px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">WhatsApp Business</h1>
            <p className="text-sm text-slate-400 mt-0.5">Messaging & customer communication</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
        {error && (
          <div className="mt-2 text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg">
            WhatsApp API error — {error}
          </div>
        )}
      </header>

      <div className="p-8 space-y-8">
        {/* Profile Card */}
        {profile && (
          <div className="rounded-xl bg-card border border-white/5 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#25d366]/20 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-[#25d366]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{profile.verifiedName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-400">{profile.displayPhoneNumber}</span>
                </div>
              </div>
              <div className="ml-auto">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  profile.qualityRating === "GREEN" ? "bg-green-500/20 text-green-400" :
                  profile.qualityRating === "YELLOW" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-slate-500/20 text-slate-400"
                }`}>
                  Quality: {profile.qualityRating}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Sent"
            value={(analytics?.sentMessages ?? 0).toLocaleString()}
            subtitle="Messages sent"
            icon={Send}
            color="text-[#25d366]"
          />
          <KPICard
            label="Delivered"
            value={(analytics?.deliveredMessages ?? 0).toLocaleString()}
            subtitle="Successfully delivered"
            icon={CheckCheck}
            color="text-blue-400"
          />
          <KPICard
            label="Read"
            value={(analytics?.readMessages ?? 0).toLocaleString()}
            subtitle="Messages read"
            icon={Eye}
            color="text-purple-400"
          />
          <KPICard
            label="Received"
            value={(analytics?.receivedMessages ?? 0).toLocaleString()}
            subtitle="Incoming messages"
            icon={Inbox}
            color="text-accent"
          />
        </div>

        {/* Message Templates */}
        <div className="rounded-xl bg-card border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#25d366]" />
            <h2 className="text-sm font-semibold text-white">Message Templates</h2>
            <span className="text-xs text-slate-500 ml-auto">{templates.length} templates</span>
          </div>
          {templates.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-white/5">
                  <th className="px-6 py-3 font-medium">Template Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Language</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const statusColor =
                    t.status === "APPROVED" ? "bg-green-500/20 text-green-400" :
                    t.status === "PENDING" ? "bg-yellow-500/20 text-yellow-400" :
                    t.status === "REJECTED" ? "bg-red-500/20 text-red-400" :
                    "bg-slate-500/20 text-slate-400";
                  return (
                    <tr key={t.name + t.language} className="border-b border-white/5 hover:bg-white/[.02] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-white">{t.name}</td>
                      <td className="px-4 py-3.5 text-slate-400">{t.category}</td>
                      <td className="px-4 py-3.5 text-slate-400">{t.language}</td>
                      <td className="px-6 py-3.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${statusColor}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              No templates yet. Create templates in WhatsApp Business Manager to send broadcast messages.
            </div>
          )}
        </div>

        {/* WhatsApp Link */}
        <div className="rounded-xl bg-[#25d366]/10 border border-[#25d366]/20 p-6">
          <h3 className="text-sm font-semibold text-white mb-2">Quick WhatsApp Link</h3>
          <p className="text-xs text-slate-400 mb-3">Share this link with customers to start a conversation:</p>
          <div className="bg-black/30 rounded-lg px-4 py-2.5 font-mono text-sm text-[#25d366] select-all">
            https://wa.me/{profile?.displayPhoneNumber?.replace(/[^0-9]/g, "") || "9659592234"}
          </div>
        </div>
      </div>
    </div>
  );
}
