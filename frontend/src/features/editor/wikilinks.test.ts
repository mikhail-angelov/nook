import { describe, expect, it } from "vitest";

import { collectWikilinkRanges } from "./wikilinks";

describe("collectWikilinkRanges", () => {
  it("collects wikilink spans and strips aliases from the target", () => {
    const ranges = collectWikilinkRanges(
      "Start [[Target|Display]] then [[Other]] and [[ spaced /Path |Label ]]",
    );

    expect(ranges).toEqual([
      {
        from: 6,
        to: 24,
        raw: "Target|Display",
        target: "Target",
      },
      {
        from: 30,
        to: 39,
        raw: "Other",
        target: "Other",
      },
      {
        from: 44,
        to: 69,
        raw: " spaced /Path |Label ",
        target: "spaced /Path",
      },
    ]);
  });

  it("ignores unmatched or empty wikilinks", () => {
    const ranges = collectWikilinkRanges("Broken [[ link and [[]] empty [[ ]]");

    expect(ranges).toEqual([]);
  });
});
