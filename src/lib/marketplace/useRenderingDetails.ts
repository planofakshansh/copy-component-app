"use client";

import { useEffect, useState } from "react";
import { describeRenderings } from "../describe/rendering-details";
import type { Rendering, RenderingHint } from "../types";
import type { AuthoringClient } from "./authoring";

export interface RenderingDetails {
  /** Component names, by rendering item id. */
  names: Map<string, string>;
  /** Titles and alt text, by normalised rendering uid. */
  hints: Map<string, RenderingHint[]>;
  /** Why the titles could not be read, when they could not. The names are independent of this. */
  hintsError: string | null;
}

/**
 * What an author needs to tell the components on a page apart: what each one
 * is called, and what its datasource says.
 *
 * Both are conveniences. The pickers work with a fallback label, so a failed
 * lookup never blocks one — but a failed title lookup is reported rather than
 * swallowed, because "no titles anywhere" otherwise looks exactly like "none
 * of these components has a title".
 */
export function useRenderingDetails(
  authoring: AuthoringClient | null,
  page: { path: string; itemId?: string } | null,
  language: string | undefined,
  renderings: Rendering[],
): RenderingDetails {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [hints, setHints] = useState<Map<string, RenderingHint[]>>(new Map());
  const [hintsError, setHintsError] = useState<string | null>(null);

  const pagePath = page?.path;
  const pageItemId = page?.itemId;

  useEffect(() => {
    if (!authoring || renderings.length === 0) return;
    let active = true;

    authoring
      .getItemNames(renderings.map((r) => r.renderingItemId))
      .then((resolved) => {
        if (active) setNames(resolved);
      })
      .catch(() => {
        // Names are a nicety — the picker still works with the fallback label.
      });

    if (pagePath) {
      setHintsError(null);
      describeRenderings(authoring, { path: pagePath, itemId: pageItemId }, language, renderings)
        .then((described) => {
          if (active) setHints(described);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setHints(new Map());
          setHintsError(error instanceof Error ? error.message : String(error));
        });
    }

    return () => {
      active = false;
    };
  }, [authoring, pagePath, pageItemId, language, renderings]);

  return { names, hints, hintsError };
}
