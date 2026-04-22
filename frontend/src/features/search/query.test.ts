import { describe, expect, it } from "vitest";

import { parseSearchQuery } from "./query";

describe("parseSearchQuery", () => {
  it("parses tag, path, phrase, and free-text tokens", () => {
    expect(
      parseSearchQuery('tag:work path:notes/project/ "exact phrase" meeting'),
    ).toEqual({
      tags: ["work"],
      paths: ["notes/project/"],
      phrases: ["exact phrase"],
      terms: ["meeting"],
    });
  });
});
