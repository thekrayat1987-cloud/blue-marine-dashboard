// Shopify orchestrator for creating a complete collection (collection + AR translations
// + cover image + optional homepage placement + optional nav menu link with AR).

import { getIntegrationAccessToken } from "@/lib/integration-tokens";
import { sanitizeSimpleHtml } from "@/lib/html";
import { decodeBase64Image } from "@/lib/image-input";

const THEME_ID = process.env.SHOPIFY_THEME_ID || "182480240940";
const MENU_ID = process.env.SHOPIFY_MAIN_MENU_ID || "gid://shopify/Menu/300333334828";
const HOMEPAGE_COLLECTION_LIST_KEY =
  process.env.SHOPIFY_HOMEPAGE_COLLECTION_LIST_SECTION || "collection_list_DQRtyh";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getShopifyConfig(): Promise<{ store: string; token: string; version: string }> {
  const store = process.env.SHOPIFY_STORE_URL || "";
  const token = await getIntegrationAccessToken("shopify", "SHOPIFY_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  if (!store || !token) throw new Error("SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN missing");
  return { store, token, version };
}

async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const cfg = await getShopifyConfig();
  const url = `https://${cfg.store}/admin/api/${cfg.version}/graphql.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as { data: T; errors?: unknown };
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface CreateFullCollectionInput {
  enName: string;
  arName: string;
  bodyHtmlEn: string;
  bodyHtmlAr: string;
  seoTitleEn: string;
  seoTitleAr: string;
  seoDescEn: string;
  seoDescAr: string;
  productIds: string[]; // gid://shopify/Product/...
  coverImageBase64?: string; // standardized 864x1536 JPEG bytes
  addToHomepage?: boolean;
  addToNavMenu?: boolean;
  sortOrder?: "CREATED_DESC" | "MANUAL" | "BEST_SELLING";
}

export interface CreateFullCollectionResult {
  id: string;
  handle: string;
  adminUrl: string;
  storefrontUrl: string;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
}

export async function createFullCollection(
  input: CreateFullCollectionInput,
): Promise<CreateFullCollectionResult> {
  const cfg = await getShopifyConfig();
  const handle = slugify(input.enName);
  const bodyHtmlEn = sanitizeSimpleHtml(input.bodyHtmlEn);
  const bodyHtmlAr = sanitizeSimpleHtml(input.bodyHtmlAr);
  const steps: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // 1. Create the collection with EN content + products + sort order
  type CreateRes = {
    collectionCreate: {
      collection: { id: string; handle: string; title: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  };
  const create = await gql<CreateRes>(
    `mutation($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle title }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: input.enName,
        handle,
        descriptionHtml: bodyHtmlEn,
        seo: { title: input.seoTitleEn, description: input.seoDescEn },
        products: input.productIds,
        sortOrder: input.sortOrder || "CREATED_DESC",
      },
    },
  );
  if (create.collectionCreate.userErrors.length || !create.collectionCreate.collection) {
    throw new Error(
      "collectionCreate: " + JSON.stringify(create.collectionCreate.userErrors),
    );
  }
  const col = create.collectionCreate.collection;
  steps.push({ name: "Created collection", ok: true, detail: `${col.title} (${col.id})` });

  // 2. AR translations
  await sleep(800);
  type DigestRes = {
    translatableResource: {
      translatableContent: Array<{ key: string; digest: string; locale: string; value: string }>;
    } | null;
  };
  const digestData = await gql<DigestRes>(
    `query($id: ID!) {
      translatableResource(resourceId: $id) {
        translatableContent { key digest locale value }
      }
    }`,
    { id: col.id },
  );
  const digests = new Map<string, string>();
  for (const c of digestData.translatableResource?.translatableContent || []) {
    digests.set(c.key, c.digest);
  }
  const arTranslations: Array<{
    key: string;
    value: string;
    locale: string;
    translatableContentDigest: string;
  }> = [];
  const pushAr = (key: string, value: string) => {
    const d = digests.get(key);
    if (d) arTranslations.push({ key, value, locale: "ar", translatableContentDigest: d });
  };
  pushAr("title", input.arName);
  pushAr("body_html", bodyHtmlAr);
  pushAr("meta_title", input.seoTitleAr);
  pushAr("meta_description", input.seoDescAr);

  if (arTranslations.length) {
    type ArRes = {
      translationsRegister: { userErrors: Array<{ field: string[]; message: string }> };
    };
    const ar = await gql<ArRes>(
      `mutation($id: ID!, $t: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $t) {
          translations { key }
          userErrors { field message }
        }
      }`,
      { id: col.id, t: arTranslations },
    );
    if (ar.translationsRegister.userErrors.length) {
      throw new Error("AR translations: " + JSON.stringify(ar.translationsRegister.userErrors));
    }
    steps.push({ name: "AR translations", ok: true, detail: `${arTranslations.length} keys` });
  } else {
    steps.push({ name: "AR translations", ok: false, detail: "no digests resolved" });
  }

  // 3. Cover image (optional)
  if (input.coverImageBase64) {
    const buf = decodeBase64Image(input.coverImageBase64, "image/jpeg");
    const filename = `${handle}-cover.jpg`;
    type StagedRes = {
      stagedUploadsCreate: {
        stagedTargets: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };
    const staged = await gql<StagedRes>(
      `mutation($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      {
        input: [
          {
            resource: "IMAGE",
            filename,
            mimeType: "image/jpeg",
            fileSize: String(buf.length),
            httpMethod: "POST",
          },
        ],
      },
    );
    if (staged.stagedUploadsCreate.userErrors.length) {
      throw new Error("staged: " + JSON.stringify(staged.stagedUploadsCreate.userErrors));
    }
    const target = staged.stagedUploadsCreate.stagedTargets[0];
    const form = new FormData();
    for (const p of target.parameters) form.append(p.name, p.value);
    form.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), filename);
    const upRes = await fetch(target.url, { method: "POST", body: form });
    if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
      throw new Error(`upload status ${upRes.status}`);
    }

    type UpdRes = {
      collectionUpdate: { userErrors: Array<{ field: string[]; message: string }> };
    };
    const upd = await gql<UpdRes>(
      `mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id image { url width height } }
          userErrors { field message }
        }
      }`,
      {
        input: {
          id: col.id,
          image: {
            src: target.resourceUrl,
            altText: `${input.enName} — Atelier Blue Marine`,
          },
        },
      },
    );
    if (upd.collectionUpdate.userErrors.length) {
      throw new Error("collectionUpdate: " + JSON.stringify(upd.collectionUpdate.userErrors));
    }
    steps.push({ name: "Cover image uploaded", ok: true });
  }

  // 4. Homepage
  if (input.addToHomepage) {
    try {
      const baseUrl = `https://${cfg.store}/admin/api/${cfg.version}/themes/${THEME_ID}/assets.json`;
      const headers = { "X-Shopify-Access-Token": cfg.token, "Content-Type": "application/json" };
      const getR = await fetch(`${baseUrl}?asset[key]=templates/index.json`, { headers });
      if (!getR.ok) throw new Error(`GET index.json ${getR.status}`);
      const gj = (await getR.json()) as { asset: { value: string } };
      const parsed = JSON.parse(gj.asset.value);
      const sec = parsed.sections?.[HOMEPAGE_COLLECTION_LIST_KEY];
      if (sec?.settings?.collection_list && Array.isArray(sec.settings.collection_list)) {
        if (!sec.settings.collection_list.includes(col.handle)) {
          sec.settings.collection_list.push(col.handle);
          const putR = await fetch(baseUrl, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              asset: { key: "templates/index.json", value: JSON.stringify(parsed, null, 2) },
            }),
          });
          if (!putR.ok) throw new Error(`PUT index.json ${putR.status}`);
        }
        steps.push({ name: "Added to homepage", ok: true });
      } else {
        steps.push({
          name: "Added to homepage",
          ok: false,
          detail: `section ${HOMEPAGE_COLLECTION_LIST_KEY} not found`,
        });
      }
    } catch (e) {
      steps.push({
        name: "Added to homepage",
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
    }
  }

  // 5. Nav menu link + AR translation
  if (input.addToNavMenu) {
    try {
      type MenuRes = {
        menu: {
          handle: string;
          title: string;
          items: Array<{
            id: string;
            title: string;
            type: string;
            url: string;
            resourceId: string | null;
            tags: string[];
            items?: Array<{
              title: string;
              type: string;
              resourceId: string | null;
              url: string;
            }>;
          }>;
        } | null;
      };
      const m = await gql<MenuRes>(
        `query($id: ID!) {
          menu(id: $id) {
            handle title
            items { id title type url resourceId tags items { id title type url resourceId } }
          }
        }`,
        { id: MENU_ID },
      );
      if (!m.menu) throw new Error("menu not found");
      const items = m.menu.items.map((it) => ({
        title: it.title,
        type: it.type,
        resourceId: it.resourceId || null,
        url: it.url,
        tags: it.tags || [],
        items: (it.items || []).map((c) => ({
          title: c.title,
          type: c.type,
          resourceId: c.resourceId || null,
          url: c.url,
          tags: [] as string[],
        })),
      }));
      items.push({
        title: input.enName,
        type: "COLLECTION",
        resourceId: col.id,
        url: `/collections/${col.handle}`,
        tags: [],
        items: [],
      });

      type MenuUpdRes = {
        menuUpdate: {
          menu: { items: Array<{ id: string; title: string; url: string; type: string }> };
          userErrors: Array<{ field: string[]; message: string }>;
        };
      };
      const upd = await gql<MenuUpdRes>(
        `mutation($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
          menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
            menu { items { id title type url } }
            userErrors { field message }
          }
        }`,
        { id: MENU_ID, title: m.menu.title, handle: m.menu.handle, items },
      );
      if (upd.menuUpdate.userErrors.length) {
        throw new Error("menuUpdate: " + JSON.stringify(upd.menuUpdate.userErrors));
      }
      const newLink = upd.menuUpdate.menu.items.find(
        (it) => it.url === `/collections/${col.handle}`,
      );
      if (!newLink) throw new Error("new menu link not found after update");

      // Re-register AR translations on ALL link items (menuUpdate creates new IDs).
      // For collection-type items we use the collection's AR title; otherwise fallback.
      const FALLBACK_AR: Record<string, string> = {
        Home: "الرئيسية",
        "Shop All": "كل المنتجات",
        Parfum: "العطور",
      };
      await sleep(800);
      for (const it of upd.menuUpdate.menu.items) {
        const linkId = it.id.replace("MenuItem", "Link");
        let arTitle: string | null = FALLBACK_AR[it.title] || null;
        if (!arTitle) {
          const orig = m.menu.items.find((o) => o.title === it.title);
          if (orig?.resourceId) {
            type ColTrRes = {
              translatableResource: {
                translations: Array<{ key: string; value: string }>;
              } | null;
            };
            try {
              const tr = await gql<ColTrRes>(
                `query($id: ID!) {
                  translatableResource(resourceId: $id) { translations(locale: "ar") { key value } }
                }`,
                { id: orig.resourceId },
              );
              arTitle =
                tr.translatableResource?.translations?.find((t) => t.key === "title")?.value ||
                null;
            } catch {
              arTitle = null;
            }
          }
        }
        // For the new collection itself, we know the AR
        if (it.url === `/collections/${col.handle}`) arTitle = input.arName;

        if (!arTitle) continue;

        type LinkTrRes = {
          translatableResource: {
            translatableContent: Array<{ key: string; digest: string; locale: string; value: string }>;
            translations: Array<{ key: string; value: string }>;
          } | null;
        };
        try {
          const linkTr = await gql<LinkTrRes>(
            `query($id: ID!) {
              translatableResource(resourceId: $id) {
                translatableContent { key digest locale value }
                translations(locale: "ar") { key value }
              }
            }`,
            { id: linkId },
          );
          const existing = linkTr.translatableResource?.translations?.find(
            (t) => t.key === "title",
          );
          if (existing?.value === arTitle) continue;
          const titleEntry = linkTr.translatableResource?.translatableContent?.find(
            (c) => c.key === "title",
          );
          if (!titleEntry) continue;
          await gql(
            `mutation($id: ID!, $t: [TranslationInput!]!) {
              translationsRegister(resourceId: $id, translations: $t) {
                translations { key }
                userErrors { field message }
              }
            }`,
            {
              id: linkId,
              t: [
                {
                  key: "title",
                  value: arTitle,
                  locale: "ar",
                  translatableContentDigest: titleEntry.digest,
                },
              ],
            },
          );
          await sleep(150);
        } catch (e) {
          console.warn(
            `nav AR translation skipped for ${it.title}: ${e instanceof Error ? e.message.slice(0, 100) : ""}`,
          );
        }
      }
      steps.push({ name: "Nav menu link added (with AR)", ok: true });
    } catch (e) {
      steps.push({
        name: "Nav menu link added",
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
    }
  }

  return {
    id: col.id,
    handle: col.handle,
    adminUrl: `https://${cfg.store}/admin/collections/${col.id.split("/").pop()}`,
    storefrontUrl: `https://bluemarineatelier.com/collections/${col.handle}`,
    steps,
  };
}
