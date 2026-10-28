import { describe, expect, it } from "vitest";
import { describeRenderings, locateDataSource } from "./rendering-details";
import type { AuthoringClient, ItemLocator } from "../marketplace/authoring";
import type { FieldValue, Rendering } from "../types";

const PAGE = "/sitecore/content/Site/Home/About";
const ID_DS = "{DDDDDDDD-1111-1111-1111-111111111111}";
const UID_A = "{AAAA0001-0000-0000-0000-000000000000}";
const UID_B = "{AAAA0002-0000-0000-0000-000000000000}";
const UID_C = "{AAAA0003-0000-0000-0000-000000000000}";

function rendering(uid: string, dataSource: string): Rendering {
  return {
    uid,
    renderingItemId: "{BBBB0000-0000-0000-0000-000000000000}",
    placeholderKey: "/main",
    dataSource,
    parameters: "",
    extraAttributes: {},
  };
}

/** Answers lookups from a table keyed by `by:value`, and remembers what it was asked. */
class FakeAuthoring {
  asked: ItemLocator[][] = [];
  languages: Array<string | undefined> = [];
  fields = new Map<string, FieldValue[]>();
  pageItemPath: string | null = null;
  idLookups = 0;

  async getItemFields(locators: ItemLocator[], language?: string) {
    this.asked.push(locators);
    this.languages.push(language);
    return locators.map((l) => this.fields.get(`${l.by}:${l.value}`) ?? null);
  }

  async getItemById() {
    this.idLookups += 1;
    return this.pageItemPath ? { itemId: "{PAGE}", name: "About", path: this.pageItemPath } : null;
  }

  asClient() {
    return this as unknown as AuthoringClient;
  }
}

describe("locateDataSource", () => {
  it("addresses an id by id", () => {
    expect(locateDataSource(ID_DS, PAGE)).toEqual({ by: "id", value: ID_DS });
  });

  it("addresses a content path by path", () => {
    expect(locateDataSource("/sitecore/content/Site/Data/Promo", PAGE)).toEqual({
      by: "path",
      value: "/sitecore/content/Site/Data/Promo",
    });
  });

  it("resolves a page-relative datasource against the page", () => {
    expect(locateDataSource("local:/Data/Promo", PAGE)).toEqual({
      by: "path",
      value: `${PAGE}/Data/Promo`,
    });
  });

  it("has nothing to fetch for a page-relative datasource when the page path is unknown", () => {
    expect(locateDataSource("local:/Data/Promo", undefined)).toBeNull();
  });

  it.each([["empty", ""], ["a query", "query:./Data/*"], ["a token", "$name"], ["junk", "not an item"]])(
    "has nothing to fetch for %s",
    (_label, value) => {
      expect(locateDataSource(value, PAGE)).toBeNull();
    },
  );
});

describe("describeRenderings", () => {
  it("labels a rendering from its datasource's title", async () => {
    const authoring = new FakeAuthoring();
    authoring.fields.set(`id:${ID_DS}`, [{ name: "Title", value: "Summer sale" }]);

    const described = await describeRenderings(authoring.asClient(), { path: PAGE }, "en", [
      rendering(UID_A, ID_DS),
    ]);

    expect(described.get(UID_A)).toEqual([{ label: "Title", text: "Summer sale" }]);
  });

  it("looks every datasource up in one round trip", async () => {
    const authoring = new FakeAuthoring();

    await describeRenderings(authoring.asClient(), { path: PAGE }, "en", [
      rendering(UID_A, ID_DS),
      rendering(UID_B, "/sitecore/content/Site/Data/Promo"),
      rendering(UID_C, "local:/Data/Hero"),
    ]);

    expect(authoring.asked).toHaveLength(1);
    expect(authoring.asked[0]).toEqual([
      { by: "id", value: ID_DS },
      { by: "path", value: "/sitecore/content/Site/Data/Promo" },
      { by: "path", value: `${PAGE}/Data/Hero` },
    ]);
  });

  it("looks a shared datasource up once and labels every rendering that uses it", async () => {
    const authoring = new FakeAuthoring();
    authoring.fields.set(`id:${ID_DS}`, [{ name: "Title", value: "Shared" }]);

    const described = await describeRenderings(authoring.asClient(), { path: PAGE }, "en", [
      rendering(UID_A, ID_DS),
      rendering(UID_B, ` ${ID_DS} `),
    ]);

    expect(authoring.asked[0]).toHaveLength(1);
    expect(described.get(UID_A)).toEqual(described.get(UID_B));
    expect(described.size).toBe(2);
  });

  it("keys the result by normalised uid", async () => {
    const authoring = new FakeAuthoring();
    authoring.fields.set(`id:${ID_DS}`, [{ name: "Title", value: "T" }]);
    const loose = UID_A.replace(/[{}]/g, "").toLowerCase();

    const described = await describeRenderings(authoring.asClient(), { path: PAGE }, "en", [
      rendering(loose, ID_DS),
    ]);

    expect(described.has(UID_A)).toBe(true);
  });

  it("leaves out a rendering whose datasource has no recognisable title or alt text", async () => {
    const authoring = new FakeAuthoring();
    authoring.fields.set(`id:${ID_DS}`, [{ name: "CssClass", value: "dark" }]);

    const described = await describeRenderings(authoring.asClient(), { path: PAGE }, "en", [
      rendering(UID_A, ID_DS),
    ]);

    expect(described.size).toBe(0);
  });

  it("leaves out a rendering whose datasource could not be read", async () => {
    const described = await describeRenderings(new FakeAuthoring().asClient(), { path: PAGE }, "en", [
      rendering(UID_A, ID_DS),
    ]);
    expect(described.size).toBe(0);
  });

  it("asks nothing when no rendering has a datasource worth fetching", async () => {
    const authoring = new FakeAuthoring();

    const described = await describeRenderings(authoring.asClient(), { path: PAGE }, "en", [
      rendering(UID_A, ""),
      rendering(UID_B, "query:./Data/*"),
    ]);

    expect(described.size).toBe(0);
    expect(authoring.asked).toHaveLength(0);
  });

  it("passes the language through", async () => {
    const authoring = new FakeAuthoring();

    await describeRenderings(authoring.asClient(), { path: PAGE }, "de-DE", [rendering(UID_A, ID_DS)]);

    expect(authoring.languages).toEqual(["de-DE"]);
  });

  describe("page-relative datasources", () => {
    const local = [rendering(UID_A, "local:/Data/Hero")];

    it("resolves them against the page's content path from its item id, not the path it was given", async () => {
      const authoring = new FakeAuthoring();
      authoring.pageItemPath = PAGE;

      await describeRenderings(authoring.asClient(), { path: "/en/about", itemId: "{PAGE}" }, "en", local);

      expect(authoring.asked[0]).toEqual([{ by: "path", value: `${PAGE}/Data/Hero` }]);
    });

    it("falls back to the path it was given when the page id does not resolve", async () => {
      const authoring = new FakeAuthoring();

      await describeRenderings(authoring.asClient(), { path: PAGE, itemId: "{PAGE}" }, "en", local);

      expect(authoring.asked[0]).toEqual([{ by: "path", value: `${PAGE}/Data/Hero` }]);
    });

    it("falls back when the id lookup throws", async () => {
      const authoring = new FakeAuthoring();
      authoring.getItemById = async () => {
        throw new Error("boom");
      };

      await describeRenderings(authoring.asClient(), { path: PAGE, itemId: "{PAGE}" }, "en", local);

      expect(authoring.asked[0][0].value).toBe(`${PAGE}/Data/Hero`);
    });

    it("does not look the page up when no datasource needs its path", async () => {
      const authoring = new FakeAuthoring();

      await describeRenderings(authoring.asClient(), { path: PAGE, itemId: "{PAGE}" }, "en", [
        rendering(UID_A, ID_DS),
      ]);

      expect(authoring.idLookups).toBe(0);
    });
  });

  it("lets a failed lookup surface to the caller", async () => {
    const authoring = new FakeAuthoring();
    authoring.getItemFields = async () => {
      throw new Error("Unknown argument");
    };

    await expect(
      describeRenderings(authoring.asClient(), { path: PAGE }, "en", [rendering(UID_A, ID_DS)]),
    ).rejects.toThrow("Unknown argument");
  });
});
