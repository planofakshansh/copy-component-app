"use client";

import { renderingsInPlaceholder, resolvePlaceholderKey } from "@/src/lib/layout/placeholders";
import type { AuthoringClient } from "@/src/lib/marketplace/authoring";
import { useRenderingDetails } from "@/src/lib/marketplace/useRenderingDetails";
import {
  POSITION_END,
  type PageSummary,
  type PlaceholderChoice,
  type PositionChoice,
  type Rendering,
} from "@/src/lib/types";
import { PositionPicker } from "./PositionPicker";

export interface TargetPlaceholders {
  page: PageSummary;
  /** Placeholder keys the target page actually uses. */
  available: string[];
  /** True when the source's own key is one of them. */
  sameKeyExists: boolean;
  /** The target's resolved layout — what a position is chosen against. */
  renderings: Rendering[];
  error?: string;
}

interface Props {
  authoring: AuthoringClient | null;
  language: string;
  sourceKey: string;
  targets: TargetPlaceholders[];
  choices: Record<string, PlaceholderChoice>;
  positions: Record<string, PositionChoice>;
  onChange: (itemId: string, choice: PlaceholderChoice) => void;
  onPositionChange: (itemId: string, position: PositionChoice) => void;
  isLoading: boolean;
}

/**
 * The last questions before the copy runs, asked per target page: which
 * placeholder, then where in it.
 *
 * Nested placeholder keys embed the parent rendering's uid, so the source key
 * usually does not exist on another page — offering it blindly would drop the
 * component into a placeholder nothing renders. "Same key" is therefore only
 * offered when the target genuinely has it.
 */
export function PlaceholderPrompt({
  authoring,
  language,
  sourceKey,
  targets,
  choices,
  positions,
  onChange,
  onPositionChange,
  isLoading,
}: Props) {
  if (isLoading) {
    return <p className="spinner">Reading placeholders on the target pages…</p>;
  }

  return (
    <div className="section">
      <p className="section__label">Where should it land?</p>
      <p className="option__meta">
        On this page it sits in <strong>{sourceKey}</strong>.
      </p>

      {targets.map((target) => (
        <TargetCard
          key={target.page.itemId}
          authoring={authoring}
          language={language}
          sourceKey={sourceKey}
          target={target}
          choice={choices[target.page.itemId]}
          position={positions[target.page.itemId] ?? POSITION_END}
          onChange={(choice) => onChange(target.page.itemId, choice)}
          onPositionChange={(position) => onPositionChange(target.page.itemId, position)}
        />
      ))}
    </div>
  );
}

interface CardProps {
  authoring: AuthoringClient | null;
  language: string;
  sourceKey: string;
  target: TargetPlaceholders;
  choice: PlaceholderChoice | undefined;
  position: PositionChoice;
  onChange: (choice: PlaceholderChoice) => void;
  onPositionChange: (position: PositionChoice) => void;
}

function TargetCard({
  authoring,
  language,
  sourceKey,
  target,
  choice,
  position,
  onChange,
  onPositionChange,
}: CardProps) {
  const { page, available, sameKeyExists, renderings, error } = target;
  const { names, hints, hintsError } = useRenderingDetails(
    authoring,
    { path: page.path },
    language,
    renderings,
  );

  // Once the placeholder is settled, what is already in it is what the
  // position is chosen from. An empty placeholder has nothing to choose between.
  const placeholderKey = choice ? resolvePlaceholderKey(choice, sourceKey) : sourceKey;
  const existing = error ? [] : renderingsInPlaceholder(renderings, placeholderKey);

  return (
    <div className="result">
      <span className="option__name">{page.displayName}</span>

      {/* A failed read is not a blocker: the copy can still go ahead
          using the source key, so say that rather than dead-ending. */}
      {error && (
        <p className="notice notice--error">
          Could not read this page&apos;s placeholders, so they cannot be listed.
          You can still copy into <strong>{sourceKey}</strong>. {error}
        </p>
      )}

      {!error && available.length === 0 && (
        <p className="option__meta">
          This page has no components yet, so it exposes no placeholder to
          read. The component will be added to <strong>{sourceKey}</strong>.
        </p>
      )}

      {!error && available.length > 0 && (
        <>
          <label className="radio">
            <input
              type="radio"
              name={`ph-${page.itemId}`}
              checked={choice?.kind === "same"}
              disabled={!sameKeyExists}
              onChange={() => onChange({ kind: "same" })}
            />
            <span>
              Same placeholder
              {!sameKeyExists && (
                <span className="option__meta"> — not present on this page</span>
              )}
            </span>
          </label>

          <label className="radio">
            <input
              type="radio"
              name={`ph-${page.itemId}`}
              checked={choice?.kind === "pick"}
              onChange={() => onChange({ kind: "pick", placeholderKey: available[0] })}
            />
            <span>A different placeholder</span>
          </label>

          {choice?.kind === "pick" && (
            <div className="field">
              <select
                value={choice.placeholderKey}
                onChange={(event) =>
                  onChange({ kind: "pick", placeholderKey: event.target.value })
                }
              >
                {available.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {existing.length > 0 && (
        <PositionPicker
          groupName={`pos-${page.itemId}`}
          placeholderKey={placeholderKey}
          existing={existing}
          names={names}
          hints={hints}
          value={position}
          onChange={onPositionChange}
        />
      )}

      {existing.length > 0 && hintsError && (
        <p className="option__meta">
          Could not read titles for these components, so only their names are shown. {hintsError}
        </p>
      )}
    </div>
  );
}
