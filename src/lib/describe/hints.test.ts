import { describe, expect, it } from "vitest";
import { describeDataSource, hintsFromFields, plainText } from "./hints";

const field = (name: string, value: string) => ({ name, value });
const image = (attributes: string) => `<image ${attributes} />`;

describe("hintsFromFields", () => {
  it("reads the title", () => {
    expect(hintsFromFields([field("Title", "Summer sale")])).toEqual([
      { label: "Title", text: "Summer sale" },
    ]);
  });

  it("prefers a field called exactly Title over a looser match", () => {
    const hints = hintsFromFields([field("Subtitle", "Up to 50% off"), field("Title", "Summer sale")]);
    expect(hints[0]).toEqual({ label: "Title", text: "Summer sale" });
  });

  it("works down the usual names when there is no Title", () => {
    expect(hintsFromFields([field("Headline", "H"), field("Heading", "G")])[0].text).toBe("G");
    expect(hintsFromFields([field("Header", "Only one")])[0].text).toBe("Only one");
  });

  it("finds a title whose field name has a prefix", () => {
    expect(hintsFromFields([field("PromoTitle", "Free shipping")])[0]).toEqual({
      label: "Title",
      text: "Free shipping",
    });
    expect(hintsFromFields([field("Hero Heading", "Welcome")])[0].text).toBe("Welcome");
  });

  it("treats spacing and case in the field name as irrelevant", () => {
    expect(hintsFromFields([field("PROMO text", "Hello")])[0]).toEqual({ label: "Text", text: "Hello" });
  });

  describe("text", () => {
    it("falls back to the start of the text when there is no title", () => {
      expect(hintsFromFields([field("Text", "<p>Welcome to our store</p>")])).toEqual([
        { label: "Text", text: "Welcome to our store" },
      ]);
    });

    it("does not add the text when there is a title", () => {
      const hints = hintsFromFields([field("Title", "Hi"), field("Text", "Body copy")]);
      expect(hints).toEqual([{ label: "Title", text: "Hi" }]);
    });

    it("strips markup and decodes entities", () => {
      const [hint] = hintsFromFields([
        field("Content", "<h2>Q&amp;A</h2><p>Ask&nbsp;us&#33; &lt;anything&gt;</p>"),
      ]);
      expect(hint.text).toBe("Q&A Ask us! <anything>");
    });

    it("keeps words from adjacent blocks apart", () => {
      expect(hintsFromFields([field("Text", "<p>one</p><p>two</p>")])[0].text).toBe("one two");
    });

    it("shortens a long passage with an ellipsis", () => {
      const [hint] = hintsFromFields([field("Text", "word ".repeat(60))]);
      expect(Array.from(hint.text)).toHaveLength(80);
      expect(hint.text.endsWith("…")).toBe(true);
    });

    it("does not cut an emoji in half", () => {
      const [hint] = hintsFromFields([field("Title", "🎉".repeat(100))]);
      expect(hint.text).toBe(`${"🎉".repeat(79)}…`);
    });
  });

  describe("images", () => {
    it("reads the alt text", () => {
      const hints = hintsFromFields([
        field("Image", image('mediaid="{ABC}" alt="Team on the beach" width="800"')),
      ]);
      expect(hints).toEqual([{ label: "Alt text", text: "Team on the beach" }]);
    });

    it("decodes entities in the alt text", () => {
      const [hint] = hintsFromFields([
        field("Image", image('alt="Tom &amp; Jerry &quot;live&quot;"')),
      ]);
      expect(hint.text).toBe('Tom & Jerry "live"');
    });

    it("accepts single-quoted attributes and keeps an apostrophe in the text", () => {
      const [hint] = hintsFromFields([field("Image", `<image alt='our "team"' />`)]);
      expect(hint.text).toBe('our "team"');
      const [other] = hintsFromFields([field("Image", `<image alt="it's us" />`)]);
      expect(other.text).toBe("it's us");
    });

    it("uses the media item's name when the image has no alt text", () => {
      const hints = hintsFromFields([
        field("Image", image('mediaid="{ABC}" alt="" mediapath="/Project/Site/Images/hero banner"')),
      ]);
      expect(hints).toEqual([{ label: "Image", text: "hero banner" }]);
    });

    it("says nothing for an image with neither", () => {
      expect(hintsFromFields([field("Image", image('mediaid="{ABC}"'))])).toEqual([]);
    });

    it("takes the first image that actually has alt text", () => {
      const hints = hintsFromFields([
        field("Background", image('alt=""')),
        field("Photo", image('alt="Founders"')),
      ]);
      expect(hints[0].text).toBe("Founders");
    });

    it("recognises an image field whatever it is called", () => {
      expect(hintsFromFields([field("PromoIcon", image('alt="Rocket"'))])[0].text).toBe("Rocket");
    });

    it("gives the title and the alt text together, title first", () => {
      expect(
        hintsFromFields([field("Image", image('alt="Beach"')), field("Title", "Summer sale")]),
      ).toEqual([
        { label: "Title", text: "Summer sale" },
        { label: "Alt text", text: "Beach" },
      ]);
    });

    it("does not read an image field as text", () => {
      expect(hintsFromFields([field("Text", image('alt="Beach"'))]).map((h) => h.label)).toEqual([
        "Alt text",
      ]);
    });
  });

  describe("what it leaves out", () => {
    it("returns nothing for no fields", () => {
      expect(hintsFromFields([])).toEqual([]);
    });

    it("ignores empty values", () => {
      expect(hintsFromFields([field("Title", ""), field("Text", "  <p> </p> ")])).toEqual([]);
    });

    it("ignores a link field, which is markup with no words outside it", () => {
      expect(
        hintsFromFields([field("Text", '<link text="Learn more" linktype="external" url="https://x.test" />')]),
      ).toEqual([]);
    });

    it("ignores id lists, which a title-like field name might still hold", () => {
      expect(
        hintsFromFields([
          field("Title Style", "{A1B2C3D4-0000-0000-0000-000000000001}|{A1B2C3D4-0000-0000-0000-000000000002}"),
        ]),
      ).toEqual([]);
    });

    it("ignores fields whose name says nothing about what they hold", () => {
      expect(hintsFromFields([field("CssClass", "dark-bg"), field("Order", "3")])).toEqual([]);
    });
  });
});

describe("plainText", () => {
  it("collapses whitespace", () => {
    expect(plainText("  a \n\t b  ")).toBe("a b");
  });

  it("leaves an unknown entity as it found it", () => {
    expect(plainText("&bogus; &#0; &#x110000;")).toBe("&bogus; &#0; &#x110000;");
  });

  it("decodes hexadecimal references", () => {
    expect(plainText("&#x41;&#66;")).toBe("AB");
  });
});

describe("describeDataSource", () => {
  it("says there is none", () => {
    expect(describeDataSource("")).toBe("No datasource");
  });

  it("shows a content path as it is", () => {
    expect(describeDataSource("/sitecore/content/Site/Data/Promo")).toBe("/sitecore/content/Site/Data/Promo");
  });

  // XM Cloud's own form for a page's datasources, and it names the item.
  it("shows a page-relative datasource as it is", () => {
    expect(describeDataSource("local:/Data/Hero Banner")).toBe("local:/Data/Hero Banner");
  });

  it("flags a dynamic datasource", () => {
    expect(describeDataSource("query:./Data/*")).toContain("Dynamic");
  });

  it("does not print a bare id", () => {
    expect(describeDataSource("{DDDDDDDD-1111-1111-1111-111111111111}")).toBe("Datasource set");
  });
});
