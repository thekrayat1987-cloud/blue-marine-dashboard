import { NextResponse } from "next/server";
import { getPhoneProfile, getAnalytics, getTemplates } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [profile, analytics, templates] = await Promise.allSettled([
      getPhoneProfile(),
      getAnalytics(),
      getTemplates(),
    ]);

    return NextResponse.json({
      profile: profile.status === "fulfilled" ? profile.value : null,
      analytics: analytics.status === "fulfilled" ? analytics.value : null,
      templates: templates.status === "fulfilled" ? templates.value : [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
