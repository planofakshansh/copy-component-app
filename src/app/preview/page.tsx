"use client";

// TEMPORARY visual-check harness — not part of the feature. Deleted after use.
import { useMemo, useState } from "react";
import { PlaceholderPrompt, type TargetPlaceholders } from "@/src/components/PlaceholderPrompt";
import { RenderingPicker } from "@/src/components/RenderingPicker";
import type { AuthoringClient } from "@/src/lib/marketplace/authoring";
import { useRenderingDetails } from "@/src/lib/marketplace/useRenderingDetails";
import {
  POSITION_END,
  type PlaceholderChoice,
  type PositionChoice,
  type Rendering,
} from "@/src/lib/types";

const PROMO = "{A1000000-0000-0000-0000-000000000001}";
const IMAGE = "{A1000000-0000-0000-0000-000000000002}";
const RICH = "{A1000000-0000-0000-0000-000000000003}";
const CONTAINER = "{A1000000-0000-0000-0000-000000000004}";

const NAMES = new Map([
  [PROMO, "Promo"],
  [IMAGE, "Image"],
  [RICH, "Rich Text"],
  [CONTAINER, "Container"],
]);

const img = (attrs: string) => `<image mediaid="{ABCD}" ${attrs} />`;

const FIELDS: Record<string, Array<{ name: string; value: string }>> = {
  "/sitecore/content/Site/Home/About/Data/Summer Promo": [
    { name: "PromoText", value: "Summer sale — up to 50% off everything" },
    { name: "PromoIcon", value: img('alt="Beach umbrella"') },
  ],
  "/sitecore/content/Site/Home/About/Data/Team": [{ name: "Image", value: img('alt="Our team on the beach"') }],
  "/sitecore/content/Site/Home/About/Data/Hero": [
    { name: "Image", value: img('alt="" mediapath="/Project/Site/Images/hero banner"') },
  ],
  "/sitecore/content/Site/Home/About/Data/Welcome": [
    {
      name: "Text",
      value:
        "<p>Welcome to our store. We have been selling surfboards, wetsuits &amp; accessories since 1994 and we love it.</p>",
    },
  ],
  "/sitecore/content/Site/Home/Contact/Data/Hours": [{ name: "Title", value: "Contact us today" }],
  "/sitecore/content/Site/Home/Contact/Data/Opening": [
    { name: "Text", value: "<p>Open Monday to Friday, 9am to 5pm</p>" },
  ],
  "/sitecore/content/Site/Home/Contact/Data/Shop": [{ name: "Image", value: img('alt="The storefront"') }],
  "/sitecore/content/Site/Home/Contact/Data/Legal": [{ name: "Text", value: "<p>© 2026 Example Ltd</p>" }],
};

const stub = {
  async getItemNames(ids: string[]) {
    return new Map(ids.filter((id) => NAMES.has(id)).map((id) => [id, NAMES.get(id)!]));
  },
  async getItemById() {
    return { itemId: "{PAGE}", name: "About", path: "/sitecore/content/Site/Home/About" };
  },
  async getItemFields(locators: Array<{ by: string; value: string }>) {
    return locators.map((l) => FIELDS[l.value] ?? null);
  },
} as unknown as AuthoringClient;

function r(uid: string, renderingItemId: string, placeholderKey: string, dataSource = ""): Rendering {
  return { uid, renderingItemId, placeholderKey, dataSource, parameters: "", extraAttributes: {} };
}

const U = (n: number) => `{BBBB000${n}-0000-0000-0000-000000000000}`;

const SOURCE: Rendering[] = [
  r(U(1), CONTAINER, "/headless-main"),
  r(U(2), IMAGE, `/headless-main/container-1-${U(1)}-0`, "local:/Data/Hero"),
  r(U(3), PROMO, "/headless-main", "local:/Data/Summer Promo"),
  r(U(4), IMAGE, "/headless-main", "local:/Data/Team"),
  r(U(5), RICH, "/headless-main", "local:/Data/Welcome"),
];

const CONTACT: Rendering[] = [
  r(U(6), PROMO, "/headless-main", "local:/Data/Hours"),
  r(U(7), RICH, "/headless-main", "local:/Data/Opening"),
  r(U(8), IMAGE, "/headless-main", "local:/Data/Shop"),
  r(U(9), RICH, "/headless-footer", "local:/Data/Legal"),
];

const page = (itemId: string, name: string, path: string) => ({
  itemId,
  name,
  displayName: name,
  path,
  hasChildren: false,
  hasPresentation: true,
});

const TARGETS: TargetPlaceholders[] = [
  {
    page: page("{T1}", "Contact", "/sitecore/content/Site/Home/Contact"),
    available: ["/headless-footer", "/headless-main"],
    sameKeyExists: true,
    renderings: CONTACT,
  },
  {
    page: page("{T2}", "News", "/sitecore/content/Site/Home/News"),
    available: [],
    sameKeyExists: false,
    renderings: [],
  },
];

export default function Preview() {
  const [selected, setSelected] = useState<string | null>(U(4));
  const [choices, setChoices] = useState<Record<string, PlaceholderChoice>>({ "{T1}": { kind: "same" }, "{T2}": { kind: "same" } });
  const [positions, setPositions] = useState<Record<string, PositionChoice>>({ "{T1}": { kind: "before", uid: U(7) } });
  const details = useRenderingDetails(stub, { path: "/sitecore/content/Site/Home/About", itemId: "{PAGE}" }, "en", SOURCE);
  const sourceKey = useMemo(() => "/headless-main", []);

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", padding: 12, flexWrap: "wrap" }}>
      <main className="panel" style={{ width: 380, minHeight: 0 }} id="picker">
        <header className="panel__header">
          <h1 className="panel__title">Copy component — step 1</h1>
        </header>
        <RenderingPicker
          renderings={SOURCE}
          names={details.names}
          hints={details.hints}
          selectedUid={selected}
          onSelect={setSelected}
        />
      </main>
      <main className="panel" style={{ width: 380, minHeight: 0 }} id="position">
        <header className="panel__header">
          <h1 className="panel__title">Copy component — step 3</h1>
        </header>
        <PlaceholderPrompt
          authoring={stub}
          language="en"
          sourceKey={sourceKey}
          targets={TARGETS}
          choices={choices}
          positions={positions}
          onChange={(id, c) => {
            setChoices((p) => ({ ...p, [id]: c }));
            setPositions((p) => ({ ...p, [id]: POSITION_END }));
          }}
          onPositionChange={(id, pos) => setPositions((p) => ({ ...p, [id]: pos }))}
          isLoading={false}
        />
        <pre id="state" className="report">{JSON.stringify({ choices, positions }, null, 1)}</pre>
      </main>
    </div>
  );
}
