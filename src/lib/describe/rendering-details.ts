import { localSchemeRelativePath } from "../copy/datasource";
import { isGuid, normalizeGuid } from "../guid";
import type { AuthoringClient, ItemLocator } from "../marketplace/authoring";
import type { Rendering, RenderingHint } from "../types";
import { hintsFromFields } from "./hints";

type Authoring = Pick<AuthoringClient, "getItemById" | "getItemFields">;

/**
 * How to fetch a datasource item, or null when there is nothing to fetch: no
 * datasource at all, a query or token that only resolves when the page renders,
 * or a page-relative one on a page whose path we do not have.
 */
export function locateDataSource(
  dataSource: string,
  pagePath: string | undefined,
): ItemLocator | null {
  const value = (dataSource ?? "").trim();
  if (!value || /^(query:|\$)/i.test(value)) return null;

  const relative = localSchemeRelativePath(value);
  if (relative) return pagePath ? { by: "path", value: `${pagePath}/${relative}` } : null;

  if (value.startsWith("/")) return { by: "path", value };
  return isGuid(value) ? { by: "id", value } : null;
}

/**
 * What each rendering on a page is about, keyed by its normalised uid —
 * read from its datasource in a single round trip.
 *
 * Renderings that share a datasource share one lookup. A rendering with no
 * readable datasource, or no recognisable title or alt text, is simply absent.
 */
export async function describeRenderings(
  authoring: Authoring,
  page: { path: string; itemId?: string },
  language: string | undefined,
  renderings: Rendering[],
): Promise<Map<string, RenderingHint[]>> {
  const described = new Map<string, RenderingHint[]>();
  const dataSources = [...new Set(renderings.map((r) => r.dataSource.trim()).filter(Boolean))];
  if (dataSources.length === 0) return described;

  const pagePath = dataSources.some((ds) => localSchemeRelativePath(ds))
    ? await contentPathOf(authoring, page, language)
    : page.path;

  const lookups = dataSources
    .map((dataSource) => ({ dataSource, locator: locateDataSource(dataSource, pagePath) }))
    .filter((lookup): lookup is { dataSource: string; locator: ItemLocator } => lookup.locator !== null);
  if (lookups.length === 0) return described;

  const fields = await authoring.getItemFields(
    lookups.map((lookup) => lookup.locator),
    language,
  );
  const hintsByDataSource = new Map<string, RenderingHint[]>();
  lookups.forEach((lookup, index) => {
    const found = fields[index];
    const hints = found ? hintsFromFields(found) : [];
    if (hints.length > 0) hintsByDataSource.set(lookup.dataSource, hints);
  });

  for (const rendering of renderings) {
    const hints = hintsByDataSource.get(rendering.dataSource.trim());
    if (hints) described.set(normalizeGuid(rendering.uid), hints);
  }
  return described;
}

/**
 * `local:/Data/Promo` can only be addressed through the page's own content
 * path, and `pages.context` has not been shown to report one reliably — the
 * copy trusts the page's item id over it, so this does too.
 */
async function contentPathOf(
  authoring: Authoring,
  page: { path: string; itemId?: string },
  language: string | undefined,
): Promise<string> {
  if (page.itemId) {
    try {
      const item = await authoring.getItemById(page.itemId, language);
      if (item?.path) return item.path;
    } catch {
      // Fall back to what the caller was told.
    }
  }
  return page.path;
}
