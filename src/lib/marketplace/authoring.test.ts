import { describe, expect, it } from "vitest";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { AuthoringClient } from "./authoring";

/** Stands in for the SDK's passthrough, recording the query and answering with `data`. */
function clientAnswering(data: unknown) {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const client = {
    async mutate(_name: string, args: { params: { body: { query: string; variables: Record<string, unknown> } } }) {
      calls.push(args.params.body);
      return { data: { data } };
    },
  } as unknown as ClientSDK;
  return { client, calls };
}

describe("AuthoringClient.getItemFields", () => {
  it("asks for every item in a single query, declaring each variable with the type its argument has", async () => {
    const { client, calls } = clientAnswering({ i0: null, i1: null });

    await new AuthoringClient(client).getItemFields(
      [
        { by: "id", value: "{DDDDDDDD-1111-1111-1111-111111111111}" },
        { by: "path", value: "/sitecore/content/Site/Data/Promo" },
      ],
      "en",
    );

    expect(calls).toHaveLength(1);
    const { query, variables } = calls[0];
    // itemId is typed ID and path String; the wrong declaration fails validation outright.
    expect(query).toContain("$k0: ID!");
    expect(query).toContain("$k1: String!");
    expect(query).toContain("itemId: $k0");
    expect(query).toContain("path: $k1");
    expect(query).toContain("excludeStandardFields: true");
    expect(variables).toEqual({
      db: "master",
      language: "en",
      k0: "{DDDDDDDD-1111-1111-1111-111111111111}",
      k1: "/sitecore/content/Site/Data/Promo",
    });
  });

  it("returns each item's fields, aligned with the locators", async () => {
    const { client } = clientAnswering({
      i0: { fields: { nodes: [{ name: "Title", value: "Hello" }, { name: "Text", value: null }] } },
      i1: null,
      i2: { fields: { nodes: [] } },
    });

    const result = await new AuthoringClient(client).getItemFields([
      { by: "id", value: "a" },
      { by: "id", value: "b" },
      { by: "path", value: "/c" },
    ]);

    expect(result).toEqual([[{ name: "Title", value: "Hello" }, { name: "Text", value: "" }], null, []]);
  });

  it("treats an item with no field list as having no fields rather than failing", async () => {
    const { client } = clientAnswering({ i0: {} });
    expect(await new AuthoringClient(client).getItemFields([{ by: "id", value: "a" }])).toEqual([[]]);
  });

  it("makes no request for nothing", async () => {
    const { client, calls } = clientAnswering({});
    expect(await new AuthoringClient(client).getItemFields([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("raises what the API said when it refuses the query", async () => {
    const client = {
      async mutate() {
        return { data: { errors: [{ message: "Unknown argument 'excludeStandardFields'" }] } };
      },
    } as unknown as ClientSDK;

    await expect(
      new AuthoringClient(client).getItemFields([{ by: "id", value: "a" }]),
    ).rejects.toThrow("excludeStandardFields");
  });
});
