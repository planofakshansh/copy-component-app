import { describe, expect, it } from "vitest";
import {
  appendRenderings,
  insertionIndex,
  parseLayoutXml,
  primaryDeviceId,
  renderingsForDevice,
  uidSelector,
  withoutDeltaMarks,
} from "./layout-xml";
import { DEFAULT_DEVICE_ID, type Rendering } from "../types";

const DEVICE = "{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}";

const SAMPLE = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEVICE}" l="{4A6F1F9C-1B0E-4A2D-8C8F-2B4E0D9A1C3E}"><r uid="{11111111-1111-1111-1111-111111111111}" s:id="{AAAAAAAA-1111-1111-1111-111111111111}" s:ds="{DDDDDDDD-1111-1111-1111-111111111111}" s:par="w=1&amp;h=2" s:ph="headless-main" /><r uid="{22222222-2222-2222-2222-222222222222}" s:id="{AAAAAAAA-2222-2222-2222-222222222222}" s:ph="/headless-main/container-1-{11111111-1111-1111-1111-111111111111}-0" /></d></r>`;

function rendering(overrides: Partial<Rendering> = {}): Rendering {
  return {
    uid: "{99999999-9999-9999-9999-999999999999}",
    renderingItemId: "{AAAAAAAA-9999-9999-9999-999999999999}",
    placeholderKey: "headless-main",
    dataSource: "",
    parameters: "",
    extraAttributes: {},
    ...overrides,
  };
}

describe("parseLayoutXml", () => {
  it("reads renderings with their attributes", () => {
    const parsed = parseLayoutXml(SAMPLE);
    expect(parsed.devices).toHaveLength(1);
    const [first, second] = parsed.devices[0].renderings;
    expect(first.uid).toBe("{11111111-1111-1111-1111-111111111111}");
    expect(first.dataSource).toBe("{DDDDDDDD-1111-1111-1111-111111111111}");
    expect(first.placeholderKey).toBe("headless-main");
    expect(second.placeholderKey).toContain("container-1-");
  });

  it("decodes escaped ampersands in rendering parameters", () => {
    const [first] = parseLayoutXml(SAMPLE).devices[0].renderings;
    expect(first.parameters).toBe("w=1&h=2");
  });

  it("returns nothing for empty or unparseable values", () => {
    expect(parseLayoutXml("").devices).toEqual([]);
    expect(parseLayoutXml(null).devices).toEqual([]);
    expect(parseLayoutXml("not xml at all <<<").devices).toEqual([]);
  });

  it("preserves attributes it does not model", () => {
    const xml = `<r xmlns:s="s"><d id="${DEVICE}"><r uid="{1}" s:id="{2}" s:cac="1" s:vbd="1" /></d></r>`;
    const [only] = parseLayoutXml(xml).devices[0].renderings;
    expect(only.extraAttributes).toEqual({ "@_s:cac": "1", "@_s:vbd": "1" });
  });
});

describe("renderingsForDevice", () => {
  it("matches the requested device regardless of guid formatting", () => {
    const parsed = parseLayoutXml(SAMPLE);
    const bare = DEVICE.replace(/[{}]/g, "").toLowerCase();
    expect(renderingsForDevice(parsed, bare)).toHaveLength(2);
  });

  it("falls back to the first device when the requested one is absent", () => {
    const parsed = parseLayoutXml(SAMPLE);
    expect(renderingsForDevice(parsed, "{00000000-0000-0000-0000-000000000000}")).toHaveLength(2);
  });
});

describe("primaryDeviceId", () => {
  it("prefers a device that actually holds renderings", () => {
    const xml = `<r xmlns:s="s"><d id="{00000000-0000-0000-0000-000000000001}" /><d id="${DEVICE}"><r uid="{1}" /></d></r>`;
    expect(primaryDeviceId(parseLayoutXml(xml))).toBe(DEFAULT_DEVICE_ID);
  });

  it("falls back to the default device for an empty layout", () => {
    expect(primaryDeviceId(parseLayoutXml(""))).toBe(DEFAULT_DEVICE_ID);
  });
});

describe("appendRenderings", () => {
  it("adds to an existing device without disturbing what is there", () => {
    const result = appendRenderings(SAMPLE, DEVICE, [rendering({ placeholderKey: "headless-footer" })]);
    const renderings = parseLayoutXml(result).devices[0].renderings;
    expect(renderings).toHaveLength(3);
    expect(renderings[0].uid).toBe("{11111111-1111-1111-1111-111111111111}");
    expect(renderings[2].placeholderKey).toBe("headless-footer");
  });

  it("keeps the delta marker so the page still inherits its base presentation", () => {
    const result = appendRenderings("", DEVICE, [rendering()]);
    expect(result).toContain('p:p="1"');
    expect(result).toContain('xmlns:p="p"');
    expect(result).toContain('xmlns:s="s"');
  });

  it("creates the device when the existing delta does not have one", () => {
    const existing = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="{00000000-0000-0000-0000-000000000009}"><r uid="{5}" /></d></r>`;
    const parsed = parseLayoutXml(appendRenderings(existing, DEVICE, [rendering()]));
    expect(parsed.devices).toHaveLength(2);
    expect(parsed.devices[1].renderings[0].uid).toBe("{99999999-9999-9999-9999-999999999999}");
  });

  it("re-escapes parameters on the way out", () => {
    const result = appendRenderings("", DEVICE, [rendering({ parameters: "a=1&b=2" })]);
    expect(result).toContain("a=1&amp;b=2");
    expect(parseLayoutXml(result).devices[0].renderings[0].parameters).toBe("a=1&b=2");
  });

  it("round-trips a full document unchanged when nothing is appended", () => {
    expect(appendRenderings(SAMPLE, DEVICE, [])).toBe(SAMPLE);
  });

  // A parameter value that survives the read but not the write would be
  // written back to the CMS as malformed XML, so pin the escaping down.
  it.each([
    ['a quote', 'title=He said "hi"'],
    ["an angle bracket", "html=<b>bold</b>"],
    ["an apostrophe", "name=it's"],
    ["an ampersand and equals", "q=a&b=c%20d"],
  ])("round-trips a parameter containing %s", (_label, parameters) => {
    const result = appendRenderings("", DEVICE, [rendering({ parameters })]);
    expect(parseLayoutXml(result).devices[0].renderings[0].parameters).toBe(parameters);
  });

  it("round-trips a datasource path with an ampersand", () => {
    const dataSource = "/sitecore/content/Site/Data/R&D";
    const result = appendRenderings("", DEVICE, [rendering({ dataSource })]);
    expect(parseLayoutXml(result).devices[0].renderings[0].dataSource).toBe(dataSource);
  });

  it("starts a fresh delta rather than losing the component when the value is corrupt", () => {
    const result = appendRenderings("<<<garbage", DEVICE, [rendering()]);
    expect(parseLayoutXml(result).devices[0].renderings).toHaveLength(1);
  });
});

describe("delta markers", () => {
  const A = "{11111111-1111-1111-1111-111111111111}";
  const B = "{22222222-2222-2222-2222-222222222222}";
  const NEW = "{99999999-9999-9999-9999-999999999999}";

  // The shapes below are what Sitecore itself writes into __Final Renderings.
  it("reads p:before and p:after as a position, not as extra attributes", () => {
    const xml = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEVICE}"><r uid="${NEW}" p:before="r[@uid='${A}']" s:ph="main" /><r uid="${B}" p:after="r[@uid='${A}']" s:ph="main" /></d></r>`;
    const [before, after] = parseLayoutXml(xml).devices[0].renderings;

    expect(before.position).toEqual({ before: `r[@uid='${A}']` });
    expect(after.position).toEqual({ after: `r[@uid='${A}']` });
    expect(before.extraAttributes).toEqual({});
  });

  it("reads <p:d /> as the removal of an inherited rendering", () => {
    const xml = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEVICE}"><r uid="${A}"><p:d /></r><r uid="${B}" s:ph="main" /></d></r>`;
    const [removed, kept] = parseLayoutXml(xml).devices[0].renderings;

    expect(removed.deleted).toBe(true);
    expect(kept.deleted).toBeUndefined();
  });

  it("strips both markers from a rendering that is about to be reused", () => {
    const marked = rendering({ position: { before: "*" }, deleted: true });
    const clean = withoutDeltaMarks(marked);
    expect(clean).not.toHaveProperty("position");
    expect(clean).not.toHaveProperty("deleted");
    expect(marked.position).toBeDefined();
  });
});

describe("insertionIndex", () => {
  const A = "{11111111-1111-1111-1111-111111111111}";
  const B = "{22222222-2222-2222-2222-222222222222}";
  const C = "{33333333-3333-3333-3333-333333333333}";
  const siblings = [A, B, C];
  const index = (position: Parameters<typeof insertionIndex<string>>[2]) =>
    insertionIndex(siblings, (uid) => uid, position);

  it("puts an entry in front of the sibling it names", () => {
    expect(index({ before: uidSelector(B) })).toBe(1);
  });

  it("puts an entry after the sibling it names", () => {
    expect(index({ after: uidSelector(B) })).toBe(2);
  });

  it("reads * as the very start", () => {
    expect(index({ before: "*" })).toBe(0);
  });

  it("appends when there is no position, or it names nothing here", () => {
    expect(index(undefined)).toBe(-1);
    expect(index({ before: uidSelector("{00000000-0000-0000-0000-000000000000}") })).toBe(-1);
    expect(index({ before: "not a selector" })).toBe(-1);
  });

  it("matches a uid however it is spelled", () => {
    const bare = B.replace(/[{}]/g, "").toLowerCase();
    expect(index({ before: `r[@uid="${bare}"]` })).toBe(1);
  });

  it("falls through to `after` when `before` finds nothing", () => {
    expect(
      index({ before: uidSelector("{00000000-0000-0000-0000-000000000000}"), after: uidSelector(A) }),
    ).toBe(1);
  });
});

describe("appendRenderings with a position", () => {
  const A = "{11111111-1111-1111-1111-111111111111}";
  const B = "{22222222-2222-2222-2222-222222222222}";
  const NEW = "{99999999-9999-9999-9999-999999999999}";

  const DELTA = `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEVICE}"><r uid="${A}" p:after="*" s:ph="main" /></d></r>`;
  const COMPLETE = `<r xmlns:s="s"><d id="${DEVICE}"><r uid="${A}" s:ph="main" /><r uid="${B}" s:ph="main" /></d></r>`;

  function uids(xml: string): string[] {
    return parseLayoutXml(xml).devices[0].renderings.map((r) => r.uid);
  }

  it("writes p:before on a delta so the copy lands in front of the rendering it names", () => {
    const result = appendRenderings(DELTA, DEVICE, [
      rendering({ uid: NEW, position: { before: uidSelector(B) } }),
    ]);

    const added = parseLayoutXml(result).devices[0].renderings.find((r) => r.uid === NEW);
    expect(added?.position).toEqual({ before: uidSelector(B) });
    expect(result).toContain("p:before=");
  });

  it("writes an entry with no position as a plain append", () => {
    const result = appendRenderings(DELTA, DEVICE, [rendering({ uid: NEW })]);
    expect(result).not.toMatch(/uid="\{99999999[^>]*p:(before|after)/);
    expect(uids(result)).toEqual([A, NEW]);
  });

  it("leaves what the delta already says untouched", () => {
    const result = appendRenderings(DELTA, DEVICE, [
      rendering({ uid: NEW, position: { before: uidSelector(A) } }),
    ]);
    const [existing] = parseLayoutXml(result).devices[0].renderings;
    expect(existing.uid).toBe(A);
    expect(existing.position).toEqual({ after: "*" });
  });

  // A complete layout has no delta engine to read p:before, and may not even
  // declare the `p` prefix — so the entry has to be physically in place.
  it("places the entry in the document, not in an attribute, when the layout is complete", () => {
    const result = appendRenderings(COMPLETE, DEVICE, [
      rendering({ uid: NEW, position: { before: uidSelector(B) } }),
    ]);

    expect(uids(result)).toEqual([A, NEW, B]);
    expect(result).not.toContain("p:before");
  });

  it("never writes the p prefix into a layout that does not declare it", () => {
    const result = appendRenderings(COMPLETE, DEVICE, [
      rendering({ uid: NEW, position: { before: uidSelector(B) } }),
    ]);
    expect(result).not.toContain("p:");
  });

  it("appends to a complete layout when the rendering it names is not there", () => {
    const result = appendRenderings(COMPLETE, DEVICE, [
      rendering({ uid: NEW, position: { before: uidSelector("{00000000-0000-0000-0000-000000000000}") } }),
    ]);
    expect(uids(result)).toEqual([A, B, NEW]);
  });

  it("positions only the entry that asks, appending the rest after it", () => {
    const CHILD = "{88888888-8888-8888-8888-888888888888}";
    const result = appendRenderings(COMPLETE, DEVICE, [
      rendering({ uid: NEW, position: { before: uidSelector(A) } }),
      rendering({ uid: CHILD, placeholderKey: `main/inner-${NEW}-0` }),
    ]);
    expect(uids(result)).toEqual([NEW, A, B, CHILD]);
  });
});
