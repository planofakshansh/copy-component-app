"use client";

import type { Rendering, RenderingHint } from "@/src/lib/types";
import { describeDataSource } from "@/src/lib/describe/hints";
import { normalizeGuid } from "@/src/lib/guid";
import { collectSubtree } from "@/src/lib/layout/presentation";
import { RenderingSummary } from "./RenderingSummary";

interface Props {
  renderings: Rendering[];
  names: Map<string, string>;
  /** Titles and alt text, by normalised uid — what tells two "Image"s apart. */
  hints: Map<string, RenderingHint[]>;
  selectedUid: string | null;
  onSelect: (uid: string) => void;
}

/**
 * Lists what is on the page, grouped by placeholder.
 *
 * Pages cannot put a button on the component itself — a Marketplace app only
 * gets the context panel — so the panel has to make "which component" an
 * explicit choice. Nesting counts are shown because picking a container copies
 * everything inside it, and each component carries its title or image alt text
 * because a page with three "Image"s is otherwise a guessing game.
 */
export function RenderingPicker({ renderings, names, hints, selectedUid, onSelect }: Props) {
  if (renderings.length === 0) {
    return <p className="notice">This page has no components to copy.</p>;
  }

  const groups = groupByPlaceholder(renderings);

  return (
    <div className="section">
      <p className="section__label">Component to copy</p>
      {groups.map(([placeholderKey, items]) => (
        <div key={placeholderKey} className="section">
          <p className="option__meta">{placeholderKey}</p>
          <ul className="list">
            {items.map((rendering) => {
              const nested = countNested(renderings, rendering.uid);
              return (
                <li key={rendering.uid}>
                  <button
                    type="button"
                    className="option"
                    aria-pressed={isSelected(selectedUid, rendering.uid)}
                    onClick={() => onSelect(rendering.uid)}
                  >
                    <RenderingSummary
                      name={names.get(rendering.renderingItemId) ?? "Component"}
                      hints={hints.get(normalizeGuid(rendering.uid)) ?? []}
                      detail={describeDataSource(rendering.dataSource)}
                    />
                    {nested > 0 && (
                      <span className="badge">+{nested} nested</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function isSelected(selectedUid: string | null, uid: string): boolean {
  return selectedUid !== null && normalizeGuid(selectedUid) === normalizeGuid(uid);
}

/** Top-level placeholders first, so the page reads roughly top to bottom. */
function groupByPlaceholder(renderings: Rendering[]): Array<[string, Rendering[]]> {
  const groups = new Map<string, Rendering[]>();
  for (const rendering of renderings) {
    const key = rendering.placeholderKey || "(no placeholder)";
    const existing = groups.get(key);
    if (existing) existing.push(rendering);
    else groups.set(key, [rendering]);
  }
  return [...groups.entries()].sort(
    ([a], [b]) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
}

function countNested(renderings: Rendering[], uid: string): number {
  return collectSubtree(renderings, uid)?.descendants.length ?? 0;
}
