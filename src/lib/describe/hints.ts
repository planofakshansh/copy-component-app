import { localSchemeRelativePath } from "../copy/datasource";
import { isGuid } from "../guid";
import type { FieldValue, RenderingHint } from "../types";

/**
 * Turn a datasource's fields into the one or two lines that tell an author
 * which "Image" or which "Rich Text" this is.
 *
 * Templates name their fields differently — Title, Heading, PromoText — so the
 * choice is by name and by what the value looks like, not by a fixed schema.
 * The result is a hint, never an identity: anything not recognised is simply
 * left out.
 */

const MAX_LENGTH = 80;

/** Tried in this order, so a field called exactly "Title" beats "Subtitle". */
const TITLE_FIELDS = ["title", "heading", "headline", "header"];
const TITLE_LIKE = /title|heading|headline/;

/** The fallback for components with no title — rich text, mostly, which is the one authors stack most. */
const TEXT_FIELDS = ["text", "content", "body", "description", "summary", "teaser", "promotext"];
const TEXT_LIKE = /text|content|body|description|summary|teaser/;

export function hintsFromFields(fields: FieldValue[]): RenderingHint[] {
  const readable = readableFields(fields);
  const hints: RenderingHint[] = [];

  const title = pick(readable, TITLE_FIELDS, TITLE_LIKE);
  const text = title ? undefined : pick(readable, TEXT_FIELDS, TEXT_LIKE);
  if (title) hints.push({ label: "Title", text: shorten(title) });
  else if (text) hints.push({ label: "Text", text: shorten(text) });

  const image = describeImage(fields);
  if (image) hints.push(image);

  return hints;
}

/** How the picker words a datasource when there is nothing better to say about it. */
export function describeDataSource(dataSource: string): string {
  if (!dataSource) return "No datasource";
  if (dataSource.startsWith("/") || localSchemeRelativePath(dataSource)) return dataSource;
  if (/^(query:|\$)/i.test(dataSource)) return `Dynamic datasource (${dataSource})`;
  return "Datasource set";
}

interface ReadableField {
  /** Lower-case, letters and digits only — "Promo Text" and "PromoText" are the same field to us. */
  key: string;
  text: string;
}

/** Fields whose value is words. Image, link and id fields come out empty or are filtered, and are skipped. */
function readableFields(fields: FieldValue[]): ReadableField[] {
  const readable: ReadableField[] = [];
  for (const field of fields) {
    const text = plainText(field.value);
    if (!text || looksLikeIds(text)) continue;
    readable.push({ key: field.name.toLowerCase().replace(/[^a-z0-9]/g, ""), text });
  }
  return readable;
}

function pick(fields: ReadableField[], exact: string[], loose: RegExp): string | undefined {
  for (const key of exact) {
    const hit = fields.find((field) => field.key === key);
    if (hit) return hit.text;
  }
  return fields.find((field) => loose.test(field.key))?.text;
}

interface ImageValue {
  alt: string;
  mediaPath: string;
}

/** An Image field's raw value is `<image mediaid="…" alt="…" … />`; anything else is not one. */
function readImage(value: string): ImageValue | null {
  if (!/^\s*<image\b/i.test(value)) return null;
  const attribute = (name: string) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(value);
    return match ? decodeEntities(match[2]).trim() : "";
  };
  return { alt: attribute("alt"), mediaPath: attribute("mediapath") };
}

function describeImage(fields: FieldValue[]): RenderingHint | undefined {
  const images = fields
    .map((field) => readImage(field.value))
    .filter((image): image is ImageValue => image !== null);

  const withAlt = images.find((image) => image.alt);
  if (withAlt) return { label: "Alt text", text: shorten(withAlt.alt) };

  // No alt text is common. The media item's name still says which picture it is.
  const named = images.find((image) => image.mediaPath);
  if (named) return { label: "Image", text: shorten(named.mediaPath.split("/").pop() ?? "") };
  return undefined;
}

/** A droplist or treelist stores ids, which say nothing to an author. */
function looksLikeIds(text: string): boolean {
  return text.split("|").every((part) => isGuid(part.trim()));
}

/** Markup out, entities decoded, whitespace collapsed: what a rich-text value says, on one line. */
export function plainText(value: string): string {
  // Tags become spaces so "<p>a</p><p>b</p>" reads "a b", and entities are
  // decoded only afterwards so an escaped "&lt;b&gt;" stays text.
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Counted in characters, not UTF-16 units, so an emoji is never cut in half. */
function shorten(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= MAX_LENGTH) return text;
  return `${characters.slice(0, MAX_LENGTH - 1).join("").trimEnd()}…`;
}
