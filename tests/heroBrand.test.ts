import { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";
import { describe, expect, it } from "vitest";

import { MUZI_ICON_SRC } from "../src/client/assets/muziIcon.ts";
import {
  MuziHeroBrandMark,
  registerMuziHeroBrandMark,
  type CompatibleHeroBrandSlots,
} from "../src/client/heroBrand.tsx";
import { en, zh } from "../src/client/locales.ts";
import { OilBrand } from "../src/client/sidebar/OilBrand.tsx";

function registerSlots(): SlotCore {
  const slots = new SlotCore();
  slots.register({
    name: "root",
    children: {
      conversation: { kind: "single", scope: "root" },
    },
  } as never, (() => null) as never);
  slots.register({
    name: "conversation",
    children: {
      "conversation.hero.brand.mark": { kind: "single", scope: "root" },
    },
  } as never, (() => null) as never);
  return slots;
}

describe("Muzi brand", () => {
  it("renders the bundled 34px decorative avatar without the fish motion class", () => {
    const mark = MuziHeroBrandMark({ size: 34, className: "fish-motion" });

    expect(mark.type).toBe("img");
    expect(mark.props).toMatchObject({
      src: MUZI_ICON_SRC,
      width: 34,
      height: 34,
      alt: "",
      "aria-hidden": "true",
      className: "muziHeroBrandMark",
    });
    expect(mark.props.className).not.toContain("fish-motion");
  });

  it("renders the approved phrase inside plugin-owned sidebar chrome", () => {
    expect(zh["brand.tagline"]).toBe("木子在生长");
    expect(en["brand.tagline"]).toBe("Muzi is growing");

    const brand = OilBrand({ tagline: en["brand.tagline"] });
    const copy = brand.props.children[1];
    expect(copy.props.children[0].props.children).toBe("Muzi Creator");
    expect(copy.props.children[1].props.children).toBe("Muzi is growing");
  });

  it("registers and releases the existing Hero mark occupant", () => {
    const slots = registerSlots();
    const compatible = slots as unknown as CompatibleHeroBrandSlots;
    const releaseMark = registerMuziHeroBrandMark(compatible);

    expect(slots.entries("conversation.hero.brand.mark")).toHaveLength(1);

    releaseMark();
    expect(slots.entries("conversation.hero.brand.mark")).toHaveLength(0);
  });
});
