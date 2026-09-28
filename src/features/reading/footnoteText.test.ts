import { describe, expect, it } from "vitest";
import { tidyFootnoteText } from "./footnoteText";

describe("tidyFootnoteText", () => {
  it("takes the separator left over from the quoted words off a KJV note", () => {
    expect(tidyFootnoteText(": Heb. seeding seed")).toBe("Heb. seeding seed");
    expect(tidyFootnoteText(": or, creeping")).toBe("or, creeping");
  });

  it("closes up the space an ASV note has before its punctuation", () => {
    expect(tidyFootnoteText("Greek flesh of sin .")).toBe("Greek flesh of sin.");
    expect(tidyFootnoteText("Or, and as an offering for sin . Lev. 7:37 ; Heb. 10:6 ; etc.")).toBe("Or, and as an offering for sin. Lev. 7:37; Heb. 10:6; etc.");
    expect(tidyFootnoteText("Or, from above . See verse 31 ; 19:11 ; Jas. 1:17 ; 3:15 , 17 .")).toBe(
      "Or, from above. See verse 31; 19:11; Jas. 1:17; 3:15, 17.",
    );
    expect(tidyFootnoteText("Or, evil : as in verse 39 ; 6:13 .")).toBe("Or, evil: as in verse 39; 6:13.");
    expect(tidyFootnoteText(": Heb. for the rule of the day , etc.")).toBe("Heb. for the rule of the day, etc.");
  });

  it("leaves a spaced ellipsis and a clean note as they are", () => {
    expect(tidyFootnoteText("Or, Shall Christ Jesus that died, . . . us?")).toBe("Or, Shall Christ Jesus that died, . . . us?");
    expect(tidyFootnoteText("Or, deep darkness (and so elsewhere)")).toBe("Or, deep darkness (and so elsewhere)");
    expect(tidyFootnoteText("Many ancient authorities read for what a man seeth, why doth he yet hope for?")).toBe(
      "Many ancient authorities read for what a man seeth, why doth he yet hope for?",
    );
  });
});
