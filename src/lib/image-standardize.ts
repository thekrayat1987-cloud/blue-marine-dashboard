import sharp from "sharp";

export const TARGET_W = 864;
export const TARGET_H = 1536;

export interface ShopifyMediaImageNode {
  id: string;
  image?: { url: string; width: number; height: number } | null;
  status?: string;
}

interface ShopifyGqlConfig {
  store: string;
  token: string;
  version?: string;
}

async function gql<T = unknown>(
  cfg: ShopifyGqlConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${cfg.store}/admin/api/${cfg.version || "2024-10"}/graphql.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as { data: T; errors?: unknown };
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface StandardizeResult {
  status: "skipped" | "standardized" | "no-image";
  reason?: string;
  newImageUrl?: string;
}

/**
 * Resize a product's featured image to TARGET_W×TARGET_H if it isn't already,
 * upload as new media, promote to position 1. Original stays in gallery.
 */
export async function standardizeFeaturedImage(
  cfg: ShopifyGqlConfig,
  productId: string,
): Promise<StandardizeResult> {
  type ProductQuery = {
    product: {
      id: string;
      title: string;
      featuredImage?: { url: string; width: number; height: number; altText?: string } | null;
      media: { edges: Array<{ node: { id: string } }> };
    } | null;
  };
  const data = await gql<ProductQuery>(
    cfg,
    `query($id: ID!) {
      product(id: $id) {
        id title
        featuredImage { url width height altText }
        media(first: 50) { edges { node { id } } }
      }
    }`,
    { id: productId },
  );
  const p = data.product;
  if (!p) return { status: "skipped", reason: "product not found" };
  if (!p.featuredImage) return { status: "no-image" };
  if (p.featuredImage.width === TARGET_W && p.featuredImage.height === TARGET_H) {
    return { status: "skipped", reason: "already 864×1536" };
  }

  const imgRes = await fetch(p.featuredImage.url);
  if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
  const origBuf = Buffer.from(await imgRes.arrayBuffer());

  const resized = await sharp(origBuf)
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const filename = `${productId.split("/").pop()}-864x1536.jpg`;

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
    cfg,
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
          fileSize: String(resized.length),
          httpMethod: "POST",
        },
      ],
    },
  );
  if (staged.stagedUploadsCreate.userErrors.length) {
    throw new Error(JSON.stringify(staged.stagedUploadsCreate.userErrors));
  }
  const target = staged.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const par of target.parameters) form.append(par.name, par.value);
  form.append(
    "file",
    new Blob([new Uint8Array(resized)], { type: "image/jpeg" }),
    filename,
  );
  const upRes = await fetch(target.url, { method: "POST", body: form });
  if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
    throw new Error(`upload status ${upRes.status}`);
  }

  type CreateRes = {
    productCreateMedia: {
      media: Array<{ id: string }>;
      mediaUserErrors: Array<{ field: string[]; message: string }>;
    };
  };
  const created = await gql<CreateRes>(
    cfg,
    `mutation($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) {
        media { id }
        mediaUserErrors { field message }
      }
    }`,
    {
      id: productId,
      media: [
        {
          originalSource: target.resourceUrl,
          mediaContentType: "IMAGE",
          alt: p.featuredImage.altText || p.title,
        },
      ],
    },
  );
  if (created.productCreateMedia.mediaUserErrors.length) {
    throw new Error(JSON.stringify(created.productCreateMedia.mediaUserErrors));
  }
  const newMediaId = created.productCreateMedia.media[0].id;

  // Wait until READY (max ~30s) before reordering
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    type StatusRes = { node: { status?: string } | null };
    const chk = await gql<StatusRes>(
      cfg,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { status } } }`,
      { id: newMediaId },
    );
    if (chk.node?.status === "READY") break;
  }

  type AfterRes = { product: { media: { edges: Array<{ node: { id: string } }> } } };
  const after = await gql<AfterRes>(
    cfg,
    `query($id: ID!) { product(id: $id) { media(first: 50) { edges { node { id } } } } }`,
    { id: productId },
  );
  const ordered = [
    newMediaId,
    ...after.product.media.edges.map((e) => e.node.id).filter((id) => id !== newMediaId),
  ];
  const moves = ordered.map((id, i) => ({ id, newPosition: String(i) }));

  type ReorderRes = {
    productReorderMedia: { userErrors: Array<{ field: string[]; message: string }> };
  };
  const re = await gql<ReorderRes>(
    cfg,
    `mutation($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job { id }
        userErrors { field message }
      }
    }`,
    { id: productId, moves },
  );
  if (re.productReorderMedia.userErrors.length) {
    throw new Error(JSON.stringify(re.productReorderMedia.userErrors));
  }

  return { status: "standardized", newImageUrl: target.resourceUrl };
}

/**
 * Resize a collection's cover image to TARGET_W×TARGET_H if it isn't already.
 * Unlike products, collections have a single image (no gallery), so the
 * resized version replaces the original via collectionUpdate(image.src).
 */
export async function standardizeCollectionImage(
  cfg: ShopifyGqlConfig,
  collectionId: string,
): Promise<StandardizeResult> {
  type CollectionQuery = {
    collection: {
      id: string;
      handle: string;
      title: string;
      image?: { url: string; width: number; height: number; altText?: string } | null;
    } | null;
  };
  const data = await gql<CollectionQuery>(
    cfg,
    `query($id: ID!) {
      collection(id: $id) {
        id handle title
        image { url width height altText }
      }
    }`,
    { id: collectionId },
  );
  const c = data.collection;
  if (!c) return { status: "skipped", reason: "collection not found" };
  if (!c.image) return { status: "no-image" };
  if (c.image.width === TARGET_W && c.image.height === TARGET_H) {
    return { status: "skipped", reason: "already 864×1536" };
  }

  const imgRes = await fetch(c.image.url);
  if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
  const origBuf = Buffer.from(await imgRes.arrayBuffer());

  const resized = await sharp(origBuf)
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const filename = `${c.handle}-cover-864x1536.jpg`;

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
    cfg,
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
          fileSize: String(resized.length),
          httpMethod: "POST",
        },
      ],
    },
  );
  if (staged.stagedUploadsCreate.userErrors.length) {
    throw new Error(JSON.stringify(staged.stagedUploadsCreate.userErrors));
  }
  const target = staged.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const par of target.parameters) form.append(par.name, par.value);
  form.append(
    "file",
    new Blob([new Uint8Array(resized)], { type: "image/jpeg" }),
    filename,
  );
  const upRes = await fetch(target.url, { method: "POST", body: form });
  if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
    throw new Error(`upload status ${upRes.status}`);
  }

  type UpdRes = {
    collectionUpdate: {
      collection: { id: string; image: { width: number; height: number } | null } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  };
  const upd = await gql<UpdRes>(
    cfg,
    `mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id image { width height } }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: collectionId,
        image: {
          src: target.resourceUrl,
          altText: c.image.altText || c.title,
        },
      },
    },
  );
  if (upd.collectionUpdate.userErrors.length) {
    throw new Error(JSON.stringify(upd.collectionUpdate.userErrors));
  }

  return { status: "standardized", newImageUrl: target.resourceUrl };
}
