"use client";

import { Fragment } from "react";
import { describeDataSource } from "@/src/lib/describe/hints";
import { guidsEqual, normalizeGuid } from "@/src/lib/guid";
import {
  POSITION_END,
  type PositionChoice,
  type Rendering,
  type RenderingHint,
} from "@/src/lib/types";
import { RenderingSummary } from "./RenderingSummary";

interface Props {
  /** Radio group name — unique per target page, since several are on screen at once. */
  groupName: string;
  placeholderKey: string;
  /** What is already in the placeholder, in the order it renders. */
  existing: Rendering[];
  names: Map<string, string>;
  hints: Map<string, RenderingHint[]>;
  value: PositionChoice;
  onChange: (position: PositionChoice) => void;
}

/**
 * Where, among the components already in a placeholder, the copy should go.
 *
 * The existing components are drawn as the stack they are, with an insertion
 * point above, between and below them — so "after the second one" is something
 * an author points at rather than counts. The last point is the default: it is
 * where a copy has always gone, and it keeps the common case a single click.
 */
export function PositionPicker({
  groupName,
  placeholderKey,
  existing,
  names,
  hints,
  value,
  onChange,
}: Props) {
  const nameOf = (rendering: Rendering) => names.get(rendering.renderingItemId) ?? "Component";
  const atEnd = value.kind === "end";
  const last = existing[existing.length - 1];

  return (
    <div className="section">
      <p className="section__label">Position</p>
      <p className="option__meta">
        Where it goes among the components already in <strong>{placeholderKey}</strong>.
      </p>
      <div className="stack" role="radiogroup" aria-label={`Position in ${placeholderKey}`}>
        {existing.map((rendering, index) => {
          const selected = value.kind === "before" && guidsEqual(value.uid, rendering.uid);
          const rowHints = hints.get(normalizeGuid(rendering.uid)) ?? [];
          return (
            <Fragment key={rendering.uid}>
              <label className="slot" data-selected={selected}>
                <input
                  type="radio"
                  name={groupName}
                  checked={selected}
                  aria-label={`Insert before ${nameOf(rendering)}`}
                  onChange={() => onChange({ kind: "before", uid: rendering.uid })}
                />
                <span>{index === 0 ? "At the start" : "Here"}</span>
              </label>
              <div className="stack__item">
                <span className="stack__index">{index + 1}</span>
                <RenderingSummary
                  name={nameOf(rendering)}
                  hints={rowHints}
                  detail={rowHints.length === 0 ? describeDataSource(rendering.dataSource) : undefined}
                />
              </div>
            </Fragment>
          );
        })}
        <label className="slot" data-selected={atEnd}>
          <input
            type="radio"
            name={groupName}
            checked={atEnd}
            aria-label={`Insert after ${nameOf(last)}`}
            onChange={() => onChange(POSITION_END)}
          />
          <span>At the end</span>
        </label>
      </div>
    </div>
  );
}
