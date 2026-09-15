import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitizeHtml";

describe("sanitizeHtml", () => {
  it("keeps the markup the editor and the commentary importer produce", () => {
    const html =
      '<p>A <strong>word</strong> and <em>another</em>.</p>' +
      '<blockquote><p>Quoted.</p></blockquote>' +
      '<ul><li>One</li><li>Two</li></ul>' +
      '<h3>Heading</h3><hr><pre><code>code</code></pre>' +
      '<p><sup>1</sup>text<sub>2</sub> <mark>marked</mark> <u>u</u> <s>s</s><br></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps the class and data attributes the app styles and reads", () => {
    expect(sanitizeHtml('<a class="scripref" data-osis="Gen.1.1" href="bsapp://verse/1/1">Gen 1:1</a>')).toBe(
      '<a class="scripref" data-osis="Gen.1.1" href="bsapp://verse/1/1">Gen 1:1</a>',
    );
    expect(sanitizeHtml('<span data-blank="1" data-ref="1:1:1">word</span>')).toBe(
      '<span data-blank="1" data-ref="1:1:1">word</span>',
    );
  });

  it("deletes a script, its source, and anything else that can run", () => {
    expect(sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>')).toBe("<p>before</p><p>after</p>");
    expect(sanitizeHtml('<style>body{display:none}</style><p>x</p>')).toBe("<p>x</p>");
    for (const tag of ["iframe", "object", "form"]) {
      expect(sanitizeHtml(`<${tag}>inside</${tag}>`), tag).toBe("");
    }
    // These two are void elements, so they have no contents to drop.
    expect(sanitizeHtml('<embed src="x.swf">')).toBe("");
    expect(sanitizeHtml('<input value="x">')).toBe("");
    expect(sanitizeHtml('<link rel="stylesheet" href="http://evil/x.css">')).toBe("");
    // A <script> smuggled in as an SVG child, where tagName is lower-case.
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).toBe("");
  });

  it("unwraps an unknown element but keeps its text", () => {
    expect(sanitizeHtml('<p>a <video>watch <b>this</b></video> b</p>')).toBe("<p>a watch <b>this</b> b</p>");
    expect(sanitizeHtml('<table><tr><td>cell</td></tr></table>')).toBe("cell");
    expect(sanitizeHtml('<img src="x.png" onerror="alert(1)">')).toBe("");
  });

  it("strips every attribute that is not on the allowlist", () => {
    expect(sanitizeHtml('<p onclick="alert(1)" onmouseover="alert(2)">x</p>')).toBe("<p>x</p>");
    expect(sanitizeHtml('<p ONCLICK="alert(1)">x</p>')).toBe("<p>x</p>");
    expect(sanitizeHtml('<div style="position:fixed;inset:0;z-index:99">x</div>')).toBe("<div>x</div>");
    expect(sanitizeHtml('<span id="a" title="b" data-other="c">x</span>')).toBe("<span>x</span>");
    // href is for <a> only.
    expect(sanitizeHtml('<span href="https://example.com">x</span>')).toBe("<span>x</span>");
  });

  it("drops an href whose scheme is not http, https, or bsapp", () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
    expect(sanitizeHtml('<a href="http://example.com">x</a>')).toBe('<a href="http://example.com">x</a>');
    expect(sanitizeHtml('<a href="BSAPP://verse/1/1">x</a>')).toBe('<a href="BSAPP://verse/1/1">x</a>');
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///C:/Windows/System32",
      "/index.html",
      "#anchor",
      "",
    ]) {
      expect(sanitizeHtml(`<a href="${href.replace(/"/g, "&quot;")}">x</a>`), href).toBe("<a>x</a>");
    }
  });

  it("removes comments and leaves plain text alone", () => {
    expect(sanitizeHtml("<!-- hidden --><p>x</p>")).toBe("<p>x</p>");
    expect(sanitizeHtml("just words")).toBe("just words");
    expect(sanitizeHtml("")).toBe("");
  });

  it("is idempotent", () => {
    const once = sanitizeHtml('<div style="x"><script>a</script><p onclick="b">t<i>i</i></p><table><td>c</td></table></div>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});
