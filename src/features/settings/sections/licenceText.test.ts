import { describe, expect, it } from "vitest";
import { licenceParagraphs } from "./licenceText";
import dataWarLicence from "../../../../reference/webster1828/LICENSE-DataWar.txt?raw";

describe("a licence notice as paragraphs", () => {
  it("joins the lines the file wrapped, and keeps its paragraphs", () => {
    expect(licenceParagraphs("MIT License\n\nCopyright (c) 2021 DataWar\n\nPermission is hereby granted, to any person\nobtaining a copy\r\nof this software.\n")).toEqual([
      "MIT License",
      "Copyright (c) 2021 DataWar",
      "Permission is hereby granted, to any person obtaining a copy of this software.",
    ]);
    expect(licenceParagraphs("a\r\n\r\nb\n  \nc")).toEqual(["a", "b", "c"]);
  });

  it("gives DataWar's notice whole, word for word", () => {
    const paragraphs = licenceParagraphs(dataWarLicence);
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[1]).toBe("Copyright (c) 2021 DataWar");
    expect(paragraphs.join(" ").split(/\s+/)).toEqual(dataWarLicence.trim().split(/\s+/));
  });
});
