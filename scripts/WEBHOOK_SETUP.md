# Webhook auto-standardisation des images — Setup

## Ce que ça fait
À chaque fois que tu crées ou modifies un produit dans Shopify, le dashboard
reçoit une notification via webhook et standardise automatiquement l'image
principale au format **864×1536** (l'original reste dans la galerie).

Tu n'as plus rien à faire manuellement.

---

## Setup (à faire une seule fois)

### 1. Récupérer le secret de l'app Shopify

Le webhook est signé avec la clé secrète de ton app Shopify Custom (la même app
qui contient le `shpat_` token). Pour la trouver :

1. Shopify Admin → **Settings** → **Apps and sales channels**
2. Click **Develop apps**
3. Ouvre ton app (celle où tu as créé le token `SHOPIFY_ACCESS_TOKEN`)
4. Onglet **API credentials**
5. Section **API secret key** → copie la valeur (commence par `shpss_…`)

### 2. Ajouter le secret à Vercel

```
vercel env add SHOPIFY_WEBHOOK_SECRET production
```
Colle la valeur copiée ci-dessus quand demandé. **Important** : utiliser
`printf` (pas `echo`) si tu passes par pipe — `echo` ajoute un `\n` et casse
silencieusement la signature.

Aussi recommandé de l'ajouter pour `preview` et `development` au cas où.

### 3. Déployer le dashboard

```
vercel --prod
```

### 4. Enregistrer le webhook auprès de Shopify

Une fois le déploiement terminé, depuis le dossier `dashboard/` :

```
WEBHOOK_BASE=https://ton-app.vercel.app node scripts/register-image-webhook.mjs
```

(Remplace `ton-app.vercel.app` par l'URL de production Vercel du dashboard.)

Le script enregistre 2 abonnements :
- `PRODUCTS_CREATE` → déclenché à chaque nouveau produit
- `PRODUCTS_UPDATE` → déclenché à chaque modification

Ré-exécuter le script est sans risque — les abonnements existants sont détectés
et ignorés.

---

## Vérifier que ça marche

1. Crée un nouveau produit dans Shopify avec une image qui n'est pas en 864×1536
2. Attends ~10 secondes
3. Recharge la page produit dans Shopify Admin
4. L'image principale est maintenant au format 864×1536, l'originale est en
   2e position dans la galerie

Pour debug, regarde les logs Vercel — chaque webhook log une ligne :
```
[shopify-webhook] PRODUCTS_UPDATE gid://shopify/Product/12345 → standardized
```

Statuts possibles :
- `standardized` → image redimensionnée et remplacée
- `skipped (already 864×1536)` → rien à faire
- `skipped (perfume)` → produit parfum, exclu par la règle
- `no-image` → produit sans image principale

---

## Désactiver / lister / supprimer les webhooks

Lister :
```
node -e 'fetch("https://STORE/admin/api/2024-10/graphql.json", { method:"POST", headers:{"X-Shopify-Access-Token":"shpat_…","Content-Type":"application/json"}, body: JSON.stringify({query:"{webhookSubscriptions(first:50){edges{node{id topic endpoint{...on WebhookHttpEndpoint{callbackUrl}}}}}}"})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))'
```

Supprimer (par ID GID `gid://shopify/WebhookSubscription/...`) :
```graphql
mutation { webhookSubscriptionDelete(id: "gid://...") { userErrors { message } } }
```

---

## Limitations

- **Délai** : ~5-10 secondes après l'ajout/modif (Shopify livre les webhooks ~immédiatement)
- **Coût** : essentiellement gratuit (~5 min de calcul + ~200 MB/mois pour ton volume)
- **Boucle** : impossible — quand le webhook redimensionne et re-update le produit,
  le 2e webhook qui suit voit que l'image est déjà 864×1536 et ne fait rien
