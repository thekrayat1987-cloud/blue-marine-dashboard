import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shop = request.nextUrl.searchParams.get("shop");

  if (!code || !shop) {
    return NextResponse.json({ error: "Missing code or shop parameter" }, { status: 400 });
  }

  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json({ error: `Token exchange failed: ${errorText}` }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token as string;

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Token Shopify généré</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0c1015; color: #e8ebf0; padding: 40px; max-width: 720px; margin: 0 auto; line-height: 1.6; }
  h1 { color: #c9a961; margin-bottom: 8px; }
  p { color: #a0a8b4; }
  .token { background: #1a2030; border: 1px solid #2c3447; padding: 16px; border-radius: 8px; font-family: ui-monospace, monospace; word-break: break-all; font-size: 13px; margin: 16px 0; user-select: all; }
  button { background: #c9a961; color: #0c1015; border: 0; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; }
  button:hover { background: #d4b574; }
  .ok { color: #4ade80; margin-top: 12px; display: none; }
  .step { background: #1a2030; padding: 16px; border-radius: 8px; margin-top: 24px; border-left: 3px solid #c9a961; }
</style>
</head>
<body>
  <h1>Token Shopify généré</h1>
  <p>Copie ce token et envoie-le-moi (à Claude) — je le mettrai dans Vercel et je redéploierai.</p>
  <div class="token" id="token">${accessToken}</div>
  <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent).then(() => { document.getElementById('ok').style.display = 'block'; })">Copier le token</button>
  <div class="ok" id="ok">Copié dans le presse-papier.</div>
  <div class="step">
    <strong>Prochaine étape :</strong> colle ce token dans le chat avec Claude. Il s'occupe du reste.
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
