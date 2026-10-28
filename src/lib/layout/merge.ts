import { guidsEqual } from "../guid";
import type { Rendering } from "../types";
import {
  insertionIndex,
  parseLayoutXml,
  renderingsForDevice,
  withoutDeltaMarks,
} from "./layout-xml";

/**
 * Resolve a page's effective layout from its two stored fields.
 *
 * The Authoring API exposes no pre-resolved layout, so the merge Sitecore does
 * internally has to happen here: `__Renderings` is the base (already inherited
 * through standard values by the field read) and `__Final Renderings` is a
 * patch on top of it.
 *
 * Patch semantics that matter:
 * - A final entry whose uid exists in the base *overrides* it, and may carry
 *   only the attributes that changed — so attributes are overlaid one by one
 *   rather than the whole entry being swapped, or an unchanged datasource
 *   would be read as empty.
 * - A final entry with a new uid is an addition. `p:before` / `p:after` say
 *   where it goes; without either it lands at the end. Order is not cosmetic
 *   here — it is what the position picker shows and what a copy is placed
 *   against.
 * - `<p:d />` removes a base entry; the entry must not be offered as a
 *   component, or as a place to insert next to.
 * - Base entries the delta says nothing about survive untouched.
 */
export function resolveLayout(
  sharedXml: string | null | undefined,
  finalXml: string | null | undefined,
  deviceId?: string,
): Rendering[] {
  const base = renderingsForDevice(parseLayoutXml(sharedXml), deviceId);
  const delta = renderingsForDevice(parseLayoutXml(finalXml), deviceId);

  const merged = base.filter((rendering) => !rendering.deleted).map(withoutDeltaMarks);

  // Entries are applied in document order, as Sitecore does, so one may be
  // positioned against another that an earlier entry added.
  for (const entry of delta) {
    const existing = merged.findIndex((rendering) => guidsEqual(rendering.uid, entry.uid));

    if (entry.deleted) {
      if (existing >= 0) merged.splice(existing, 1);
    } else if (existing >= 0) {
      merged[existing] = overlay(merged[existing], entry);
    } else {
      const at = insertionIndex(merged, (rendering) => rendering.uid, entry.position);
      merged.splice(at >= 0 ? at : merged.length, 0, withoutDeltaMarks(entry));
    }
  }

  return merged;
}

/** Non-empty values from the patch win; anything it omits keeps the base value. */
function overlay(base: Rendering, patch: Rendering): Rendering {
  return {
    uid: base.uid,
    renderingItemId: patch.renderingItemId || base.renderingItemId,
    placeholderKey: patch.placeholderKey || base.placeholderKey,
    dataSource: patch.dataSource || base.dataSource,
    parameters: patch.parameters || base.parameters,
    extraAttributes: { ...base.extraAttributes, ...patch.extraAttributes },
  };
}
