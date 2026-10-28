import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { guidsEqual, normalizeGuid } from "../guid";
import { DEFAULT_DEVICE_ID, type Rendering, type RenderingPosition } from "../types";

/**
 * `__Final Renderings` holds an XML *delta* against the shared layout, not a
 * standalone document: `p:p="1"` marks it as a patch, and a `<r>` element whose
 * uid is absent from the base is an addition. Appending to the delta is what
 * keeps a copied component from severing the page's inheritance of its
 * standard-values presentation — so every write here is an append, never a
 * rewrite of the resolved layout.
 */
const DELTA_ROOT_ATTRS: Record<string, string> = {
  "@_xmlns:p": "p",
  "@_xmlns:s": "s",
  "@_p:p": "1",
};

/** Attributes we model explicitly; everything else rides along in extraAttributes. */
const UID = "@_uid";
const RENDERING_ID = "@_s:id";
const DATASOURCE = "@_s:ds";
const PARAMETERS = "@_s:par";
const PLACEHOLDER = "@_s:ph";

/** Delta instructions, kept out of `extraAttributes` so they never ride along onto a copy. */
const BEFORE = "@_p:before";
const AFTER = "@_p:after";
/** `<r uid="…"><p:d /></r>` is how a delta removes a rendering its base supplies. */
const DELETE_TAG = "p:d";

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  // Layout attributes are opaque strings — coercing "1" to a number or "" to
  // true corrupts parameters and cache flags on the way back out.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  preserveOrder: true,
} as const;

const parser = new XMLParser(parserOptions);
const builder = new XMLBuilder({ ...parserOptions, suppressEmptyNode: true });

/** preserveOrder nodes are `{ tag: children[], ":@"?: attrs }`. */
type OrderedNode = Record<string, unknown> & { ":@"?: Record<string, string> };

function tagOf(node: OrderedNode): string | undefined {
  return Object.keys(node).find((k) => k !== ":@");
}

function childrenOf(node: OrderedNode): OrderedNode[] {
  const tag = tagOf(node);
  const value = tag ? node[tag] : undefined;
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
}

function attrsOf(node: OrderedNode): Record<string, string> {
  return node[":@"] ?? {};
}

function findByTag(nodes: OrderedNode[], tag: string): OrderedNode | undefined {
  return nodes.find((n) => tagOf(n) === tag);
}

function toRendering(node: OrderedNode): Rendering {
  const attrs = attrsOf(node);
  const known = new Set([UID, RENDERING_ID, DATASOURCE, PARAMETERS, PLACEHOLDER, BEFORE, AFTER]);
  const extraAttributes: Record<string, string> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (!known.has(name)) extraAttributes[name] = value;
  }
  const rendering: Rendering = {
    uid: attrs[UID] ?? "",
    renderingItemId: attrs[RENDERING_ID] ?? "",
    placeholderKey: attrs[PLACEHOLDER] ?? "",
    dataSource: attrs[DATASOURCE] ?? "",
    parameters: attrs[PARAMETERS] ?? "",
    extraAttributes,
  };
  if (attrs[BEFORE] || attrs[AFTER]) {
    rendering.position = {
      ...(attrs[BEFORE] ? { before: attrs[BEFORE] } : {}),
      ...(attrs[AFTER] ? { after: attrs[AFTER] } : {}),
    };
  }
  if (childrenOf(node).some((child) => tagOf(child) === DELETE_TAG)) rendering.deleted = true;
  return rendering;
}

/** A copy without the delta-only markers: what a resolved or relocated rendering should look like. */
export function withoutDeltaMarks(rendering: Rendering): Rendering {
  const copy = { ...rendering };
  delete copy.position;
  delete copy.deleted;
  return copy;
}

/** The selector a delta uses to point at a sibling rendering. */
export function uidSelector(uid: string): string {
  return `r[@uid='${uid}']`;
}

/** The uid a selector like `r[@uid='{…}']` points at; null for `*` and anything unrecognised. */
function selectorUid(selector: string | undefined): string | null {
  const match = /^\s*r\[\s*@uid\s*=\s*(['"])(.+?)\1\s*\]\s*$/.exec(selector ?? "");
  return match ? match[2] : null;
}

/**
 * Where an entry lands among its siblings: the index to insert at, or -1 for
 * "append". It is the one reading of `p:before` / `p:after` shared by the
 * merge that resolves a layout and the writer that edits a complete one, so
 * the two cannot disagree about order. A selector that matches nothing falls
 * back to appending, as Sitecore does.
 */
export function insertionIndex<T>(
  siblings: T[],
  uidOf: (sibling: T) => string,
  position: RenderingPosition | undefined,
): number {
  const indexOf = (selector: string | undefined) => {
    const uid = selectorUid(selector);
    return uid ? siblings.findIndex((sibling) => guidsEqual(uidOf(sibling), uid)) : -1;
  };

  if (position?.before !== undefined) {
    if (position.before.trim() === "*") return 0;
    const at = indexOf(position.before);
    if (at >= 0) return at;
  }
  if (position?.after !== undefined) {
    const at = indexOf(position.after);
    if (at >= 0) return at + 1;
  }
  return -1;
}

function toNode(rendering: Rendering, writePosition: boolean): OrderedNode {
  // Sitecore reads attributes by name, but keeping uid first and the s:*
  // attributes in their usual order makes the stored XML diffable by hand.
  const attrs: Record<string, string> = { [UID]: rendering.uid };
  if (writePosition && rendering.position?.before) attrs[BEFORE] = rendering.position.before;
  if (writePosition && rendering.position?.after) attrs[AFTER] = rendering.position.after;
  if (rendering.renderingItemId) attrs[RENDERING_ID] = rendering.renderingItemId;
  if (rendering.dataSource) attrs[DATASOURCE] = rendering.dataSource;
  if (rendering.parameters) attrs[PARAMETERS] = rendering.parameters;
  if (rendering.placeholderKey) attrs[PLACEHOLDER] = rendering.placeholderKey;
  Object.assign(attrs, rendering.extraAttributes);
  return { r: [], ":@": attrs };
}

export interface ParsedLayout {
  /** Devices in document order, with their renderings. */
  devices: Array<{ id: string; renderings: Rendering[] }>;
}

/** Read every rendering out of a layout field value (delta or full). */
export function parseLayoutXml(xml: string | null | undefined): ParsedLayout {
  if (!xml || !xml.trim()) return { devices: [] };
  let tree: OrderedNode[];
  try {
    tree = parser.parse(xml) as OrderedNode[];
  } catch {
    return { devices: [] };
  }
  const root = findByTag(tree, "r");
  if (!root) return { devices: [] };

  const devices = childrenOf(root)
    .filter((n) => tagOf(n) === "d")
    .map((deviceNode) => ({
      id: attrsOf(deviceNode)["@_id"] ?? "",
      renderings: childrenOf(deviceNode)
        .filter((n) => tagOf(n) === "r")
        .map(toRendering),
    }));

  return { devices };
}

/** Flatten to the renderings of one device — the Default device unless told otherwise. */
export function renderingsForDevice(
  layout: ParsedLayout,
  deviceId?: string,
): Rendering[] {
  if (layout.devices.length === 0) return [];
  const match = deviceId
    ? layout.devices.find((d) => guidsEqual(d.id, deviceId))
    : undefined;
  return (match ?? layout.devices[0]).renderings;
}

/** The device a page's layout is written against, for pages that already have one. */
export function primaryDeviceId(layout: ParsedLayout): string {
  const withRenderings = layout.devices.find((d) => d.renderings.length > 0);
  return normalizeGuid(withRenderings?.id ?? layout.devices[0]?.id ?? DEFAULT_DEVICE_ID);
}

/**
 * Add renderings to a layout field value, preserving whatever is already
 * there. They go at the end unless a rendering carries a `position`. An empty
 * or unparseable value yields a fresh delta so the page keeps inheriting its
 * base presentation.
 */
export function appendRenderings(
  existingXml: string | null | undefined,
  deviceId: string,
  renderings: Rendering[],
): string {
  if (renderings.length === 0) return existingXml ?? "";

  let tree: OrderedNode[] = [];
  if (existingXml && existingXml.trim()) {
    try {
      tree = parser.parse(existingXml) as OrderedNode[];
    } catch {
      tree = [];
    }
  }

  let root = findByTag(tree, "r");
  if (!root) {
    root = { r: [], ":@": { ...DELTA_ROOT_ATTRS } };
    tree = [root];
  }

  // `p:before` / `p:after` are instructions to the delta engine. A complete
  // layout has no such thing — document order *is* the order — and does not
  // necessarily declare the `p` prefix, so writing one there would produce
  // malformed XML rather than a position.
  const isDelta = attrsOf(root)["@_p:p"] === "1";

  const deviceNodes = childrenOf(root);
  let device = deviceNodes.find(
    (n) => tagOf(n) === "d" && guidsEqual(attrsOf(n)["@_id"] ?? "", deviceId),
  );
  if (!device) {
    device = { d: [], ":@": { "@_id": normalizeGuid(deviceId) } };
    deviceNodes.push(device);
  }

  const entries = childrenOf(device);
  for (const rendering of renderings) {
    const node = toNode(rendering, isDelta);
    const at = isDelta
      ? -1
      : insertionIndex(entries, (entry) => attrsOf(entry)["@_uid"] ?? "", rendering.position);
    if (at >= 0) entries.splice(at, 0, node);
    else entries.push(node);
  }
  return builder.build(tree);
}
