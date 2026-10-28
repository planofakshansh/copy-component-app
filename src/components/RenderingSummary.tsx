"use client";

import type { RenderingHint } from "@/src/lib/types";

interface Props {
  name: string;
  /** Titles and alt text, shown under the name so two of the same component can be told apart. */
  hints: RenderingHint[];
  /** A quieter last line, e.g. where the datasource lives. */
  detail?: string;
}

/** One component, described the same way wherever an author has to choose between them. */
export function RenderingSummary({ name, hints, detail }: Props) {
  return (
    <span className="option__body">
      <span className="option__name">{name}</span>
      {hints.map((hint) => (
        <span key={hint.label} className="option__hint">
          <span className="option__hint-label">{hint.label}</span> {hint.text}
        </span>
      ))}
      {detail && <span className="option__meta">{detail}</span>}
    </span>
  );
}
