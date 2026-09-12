import { writeFile } from "@tauri-apps/plugin-fs";
import type { Slide } from "./slides";

/**
 * The deck as a .pptx (SB4.4). Most churches project from PowerPoint, so
 * the in-app show is only half the answer.
 *
 * pptxgenjs is the one new dependency the sermon builder takes, and it is
 * imported dynamically here so it never reaches the startup bundle: a
 * reader who never exports slides never loads it.
 */

/** A dark ground, because a projected deck is nearly always shown in a room
 * with the lights down. */
const BACKGROUND = "0B0D11";
const INK = "F2F3F5";
const DIM = "9AA1AD";

export async function exportSlidesToPptx(slides: Slide[], title: string, destPath: string): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = title;

  for (const slide of slides) {
    const page = pptx.addSlide();
    page.background = { color: BACKGROUND };

    if (slide.kind === "title") {
      page.addText(slide.heading, { x: 0.6, y: 1.6, w: 8.8, h: 1.6, fontSize: 44, bold: true, color: INK, align: "center" });
      if (slide.subheading) {
        page.addText(slide.subheading, { x: 0.8, y: 3.2, w: 8.4, h: 0.9, fontSize: 20, color: INK, align: "center", italic: true });
      }
      const details = (slide.bullets ?? []).join("   ·   ");
      if (details) {
        page.addText(details, { x: 0.8, y: 4.1, w: 8.4, h: 0.5, fontSize: 14, color: DIM, align: "center" });
      }
      continue;
    }

    if (slide.kind === "passage") {
      const heading = slide.part ? `${slide.heading}  (${slide.part.index}/${slide.part.total})` : slide.heading;
      page.addText(heading, { x: 0.6, y: 0.5, w: 8.8, h: 0.6, fontSize: 20, bold: true, color: DIM, align: "center" });
      if (slide.body) {
        page.addText(slide.body, { x: 0.8, y: 1.4, w: 8.4, h: 3.4, fontSize: 26, color: INK, align: "center", valign: "middle" });
      }
      continue;
    }

    if (slide.kind === "quote") {
      page.addText(`“${slide.heading}”`, { x: 0.8, y: 1.2, w: 8.4, h: 3.0, fontSize: 26, color: INK, align: "center", valign: "middle", italic: true });
      if (slide.subheading) {
        page.addText(`— ${slide.subheading}`, { x: 0.8, y: 4.3, w: 8.4, h: 0.5, fontSize: 15, color: DIM, align: "center" });
      }
      continue;
    }

    page.addText(slide.heading, { x: 0.6, y: 0.8, w: 8.8, h: 1.2, fontSize: 34, bold: true, color: INK });
    const bullets = slide.bullets ?? [];
    if (bullets.length > 0) {
      page.addText(
        bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
        { x: 1.0, y: 2.2, w: 8.0, h: 2.6, fontSize: 22, color: INK },
      );
    }
  }

  // pptxgenjs can hand back an ArrayBuffer; the file itself is written
  // through the fs plugin, since the save dialog already chose the path.
  const data = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  await writeFile(destPath, new Uint8Array(data));
}
