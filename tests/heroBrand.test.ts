import { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";
import { describe, expect, it } from "vitest";

import { MUZI_ICON_SRC } from "../src/client/assets/muziIcon.ts";
import {
  MuziHeroBrandHeadline,
  MuziHeroBrandMark,
  registerMuziHeroBrandHeadline,
  registerMuziHeroBrandMark,
  type CompatibleHeroBrandSlots,
} from "../src/client/heroBrand.tsx";
import { en, zh } from "../src/client/locales.ts";

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
      "conversation.hero.brand.headline": { kind: "single", scope: "root" },
    },
  } as never, (() => null) as never);
  return slots;
}

describe("Muzi Hero brand", () => {
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

  it("uses the approved Chinese and English brand phrases", () => {
    expect(zh["hero.growth"]).toBe("木子在生长");
    expect(en["hero.growth"]).toBe("Muzi is growing");

    const headline = MuziHeroBrandHeadline({
      t: (key) => key === "hero.growth" ? en[key] : "",
    });
    expect(headline.props.children).toBe("Muzi is growing");
  });

  it("registers and releases both independent Hero occupants", () => {
    const slots = registerSlots();
    const compatible = slots as unknown as CompatibleHeroBrandSlots;
    const releaseMark = registerMuziHeroBrandMark(compatible);
    const releaseHeadline = registerMuziHeroBrandHeadline(compatible);

    expect(slots.entries("conversation.hero.brand.mark")).toHaveLength(1);
    expect(slots.entries("conversation.hero.brand.headline")).toHaveLength(1);

    releaseHeadline();
    releaseMark();
    expect(slots.entries("conversation.hero.brand.mark")).toHaveLength(0);
    expect(slots.entries("conversation.hero.brand.headline")).toHaveLength(0);
  });
});
