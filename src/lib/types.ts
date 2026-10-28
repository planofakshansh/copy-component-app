/** Sitecore's Default device — used when a page has no layout to copy a device id from. */
export const DEFAULT_DEVICE_ID = "{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}";

/**
 * Where a rendering is slotted into a layout *delta*, as the raw `p:before` /
 * `p:after` selectors Sitecore writes: `r[@uid='{…}']` for a sibling, or `*`
 * for "first". These are delta instructions, not rendering attributes — they
 * exist while a delta is read or written and never survive onto a resolved or
 * copied rendering.
 */
export interface RenderingPosition {
  before?: string;
  after?: string;
}

/** What a component is "about", read from its datasource — enough to tell two of the same component apart. */
export interface RenderingHint {
  /** Where the text came from, e.g. "Title" or "Alt text". */
  label: string;
  text: string;
}

/** A single field of an item, as its raw stored value. */
export interface FieldValue {
  name: string;
  value: string;
}

/** A single rendering instance on a page. */
export interface Rendering {
  /** Instance uid, e.g. "{2E2C4B9B-...}". Unique per page. */
  uid: string;
  /** The rendering item's id (which component this is). */
  renderingItemId: string;
  /** Placeholder key this instance sits in, e.g. "/headless-main/container-1-{...}-0". */
  placeholderKey: string;
  /** Datasource, as stored: an id, a path, a query, or "" when unset. */
  dataSource: string;
  /** Raw rendering parameters string (url-encoded key=value pairs). */
  parameters: string;
  /** Any attributes we do not model explicitly, preserved verbatim on write. */
  extraAttributes: Record<string, string>;
  /** Delta only: where this entry is inserted among its siblings. */
  position?: RenderingPosition;
  /** Delta only: the entry removes a rendering the base layout supplies (`<p:d />`). */
  deleted?: boolean;
}

/** A rendering plus the renderings nested inside its own placeholders. */
export interface RenderingSubtree {
  root: Rendering;
  /** Descendants in document order, parents before children. */
  descendants: Rendering[];
}

/** How a datasource relates to the page that renders it. */
export type DataSourceScope =
  /** Lives under the page item (typically <page>/Data/...) — gets copied. */
  | "local"
  /** Lives anywhere else, or is a query/empty — left pointing at the original. */
  | "global"
  | "none";

export interface DataSourceClassification {
  scope: DataSourceScope;
  /** Path of the datasource item relative to the source page, e.g. "Data/Promo". Local only. */
  relativePath?: string;
}

/** A page the author can copy into. */
export interface PageSummary {
  itemId: string;
  name: string;
  displayName: string;
  path: string;
  hasChildren: boolean;
  hasPresentation: boolean;
}

/** What the author chose to do about the placeholder key on one target page. */
export type PlaceholderChoice =
  /** Reuse the source key verbatim — only offered when it exists on the target. */
  | { kind: "same" }
  /** Drop the subtree into a different placeholder that exists on the target. */
  | { kind: "pick"; placeholderKey: string };

/**
 * Where the copy lands among the components already in the chosen placeholder.
 * Anchored on an existing component's uid rather than an index, so it keeps
 * meaning the same thing if the page is edited between choosing and copying.
 */
export type PositionChoice =
  /** After everything already there. */
  | { kind: "end" }
  /** Immediately in front of one existing component. */
  | { kind: "before"; uid: string };

export const POSITION_END: PositionChoice = { kind: "end" };

export interface CopyRequest {
  source: {
    pageItemId: string;
    pagePath: string;
    language: string;
    /** Version the layout was read from; writes target the same version. */
    version?: number;
    subtree: RenderingSubtree;
  };
  targets: Array<{
    page: PageSummary;
    placeholder: PlaceholderChoice;
    /** Defaults to the end of the placeholder, which is where copies always used to go. */
    position?: PositionChoice;
  }>;
  language: string;
}

/**
 * One unit of work in an executed copy — surfaced to the author as a progress
 * line. Datasources that are deliberately *not* copied get a step too: a
 * silent skip is indistinguishable from a bug, which is exactly how a
 * misresolved datasource hid itself once already.
 */
export interface CopyStep {
  kind: "create-folder" | "copy-datasource" | "skip-datasource" | "write-layout";
  label: string;
  detail?: string;
  /** Marks a step the author probably wants to look at, without failing the copy. */
  warn?: boolean;
}

export interface CopyResult {
  targetPath: string;
  ok: boolean;
  steps: CopyStep[];
  error?: string;
}
