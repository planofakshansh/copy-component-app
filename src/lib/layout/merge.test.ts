import { describe, expect, it } from "vitest";
import { resolveLayout } from "./merge";

const DEVICE = "{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}";
const A = "{11111111-1111-1111-1111-111111111111}";
const B = "{22222222-2222-2222-2222-222222222222}";

function layout(...renderings: string[]): string {
  return `<r xmlns:p="p" xmlns:s="s" p:p="1"><d id="${DEVICE}">${renderings.join("")}</d></r>`;
}

const SHARED = layout(
  `<r uid="${A}" s:id="{AAAA0001-0000-0000-0000-000000000000}" s:ds="{DDDD0001-0000-0000-0000-000000000000}" s:par="w=1" s:ph="headless-main" />`,
);

describe("resolveLayout", () => {
  it("returns the shared layout when there is no delta", () => {
    const resolved = resolveLayout(SHARED, "");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].uid).toBe(A);
    expect(resolved[0].dataSource).toBe("{DDDD0001-0000-0000-0000-000000000000}");
  });

  it("returns the delta alone when there is no shared layout", () => {
    const resolved = resolveLayout("", layout(`<r uid="${B}" s:ph="headless-footer" />`));
    expect(resolved.map((r) => r.uid)).toEqual([B]);
  });

  it("treats a delta entry with a new uid as an addition", () => {
    const resolved = resolveLayout(
      SHARED,
      layout(`<r uid="${B}" s:id="{AAAA0002-0000-0000-0000-000000000000}" s:ph="headless-footer" />`),
    );
    expect(resolved.map((r) => r.uid)).toEqual([A, B]);
  });

  // The case that silently breaks a copy: a partial patch must not blank out
  // the datasource the base already carries.
  it("keeps base attributes the patch does not mention", () => {
    const resolved = resolveLayout(SHARED, layout(`<r uid="${A}" s:ph="headless-footer" />`));
    expect(resolved).toHaveLength(1);
    expect(resolved[0].placeholderKey).toBe("headless-footer");
    expect(resolved[0].dataSource).toBe("{DDDD0001-0000-0000-0000-000000000000}");
    expect(resolved[0].parameters).toBe("w=1");
  });

  it("lets the patch override an attribute it does specify", () => {
    const resolved = resolveLayout(
      SHARED,
      layout(`<r uid="${A}" s:ds="{DDDD0002-0000-0000-0000-000000000000}" />`),
    );
    expect(resolved[0].dataSource).toBe("{DDDD0002-0000-0000-0000-000000000000}");
    expect(resolved[0].placeholderKey).toBe("headless-main");
  });

  it("matches uids regardless of formatting", () => {
    const bare = A.replace(/[{}]/g, "").toLowerCase();
    const resolved = resolveLayout(SHARED, layout(`<r uid="${bare}" s:ph="moved" />`));
    expect(resolved).toHaveLength(1);
    expect(resolved[0].placeholderKey).toBe("moved");
  });

  it("merges extra attributes rather than dropping them", () => {
    const resolved = resolveLayout(
      layout(`<r uid="${A}" s:cac="1" s:ph="main" />`),
      layout(`<r uid="${A}" s:vbd="1" />`),
    );
    expect(resolved[0].extraAttributes).toEqual({ "@_s:cac": "1", "@_s:vbd": "1" });
  });

  it("returns nothing when the page has no layout at all", () => {
    expect(resolveLayout("", "")).toEqual([]);
    expect(resolveLayout(null, undefined)).toEqual([]);
  });
});

describe("resolveLayout ordering", () => {
  const C = "{33333333-3333-3333-3333-333333333333}";
  const N = "{99999999-9999-9999-9999-999999999999}";
  const M = "{88888888-8888-8888-8888-888888888888}";

  const entry = (uid: string, ph = "/main") => `<r uid="${uid}" s:id="{AAAA0001-0000-0000-0000-000000000000}" s:ph="${ph}" />`;
  const STACK = layout(entry(A), entry(B), entry(C));
  const order = (shared: string, final: string) => resolveLayout(shared, final).map((r) => r.uid);

  it("puts an addition in front of the rendering named by p:before", () => {
    const final = layout(`<r uid="${N}" p:before="r[@uid='${B}']" s:ph="/main" />`);
    expect(order(STACK, final)).toEqual([A, N, B, C]);
  });

  it("puts an addition after the rendering named by p:after", () => {
    const final = layout(`<r uid="${N}" p:after="r[@uid='${B}']" s:ph="/main" />`);
    expect(order(STACK, final)).toEqual([A, B, N, C]);
  });

  it("reads p:before=\"*\" as the very start", () => {
    const final = layout(`<r uid="${N}" p:before="*" s:ph="/main" />`);
    expect(order(STACK, final)).toEqual([N, A, B, C]);
  });

  it("appends an addition that has no position", () => {
    expect(order(STACK, layout(entry(N)))).toEqual([A, B, C, N]);
  });

  it("appends an addition whose anchor is nowhere to be found", () => {
    const final = layout(`<r uid="${N}" p:before="r[@uid='{00000000-0000-0000-0000-000000000000}']" s:ph="/main" />`);
    expect(order(STACK, final)).toEqual([A, B, C, N]);
  });

  // Entries apply in document order, so one can be placed against another
  // that an earlier entry added — which is what two copies in a row produce.
  it("lets an entry be positioned against one the same delta added", () => {
    const final = layout(
      `<r uid="${N}" p:before="r[@uid='${C}']" s:ph="/main" />`,
      `<r uid="${M}" p:before="r[@uid='${N}']" s:ph="/main" />`,
    );
    expect(order(STACK, final)).toEqual([A, B, M, N, C]);
  });

  it("removes a rendering the delta deletes", () => {
    const final = layout(`<r uid="${B}"><p:d /></r>`);
    expect(order(STACK, final)).toEqual([A, C]);
  });

  it("does not invent a rendering out of a deletion for something it never had", () => {
    const final = layout(`<r uid="${N}"><p:d /></r>`);
    expect(order(STACK, final)).toEqual([A, B, C]);
  });

  it("leaves no delta markers on what it returns", () => {
    const final = layout(
      `<r uid="${N}" p:before="r[@uid='${B}']" s:ph="/main" />`,
      `<r uid="${A}" p:after="r[@uid='${C}']" s:ph="/main" />`,
    );
    for (const rendering of resolveLayout(STACK, final)) {
      expect(rendering).not.toHaveProperty("position");
      expect(rendering).not.toHaveProperty("deleted");
      expect(rendering.extraAttributes).toEqual({});
    }
  });

  it("does not reorder an existing rendering that the delta merely overrides", () => {
    const final = layout(`<r uid="${A}" p:after="r[@uid='${C}']" s:ph="/elsewhere" />`);
    expect(order(STACK, final)).toEqual([A, B, C]);
  });
});
