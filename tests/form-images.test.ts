import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
  formDraftDefinitionSchema,
  formImageId,
} from "../shared/forms";
import FieldRenderer from "../src/ui/forms/FieldRenderer";
import FormImage from "../src/ui/forms/FormImage";
const media = "f9800000-0000-4000-8000-000000000003";
function definition() {
  const template = createTemplate("Fictional image form");
  return {
    title: template.title,
    description: template.description,
    fields: template.fields,
    sections: template.sections,
    settings: template.settings,
  };
}
describe("FORM-003/007 actual approved form images", () => {
  it("drafts can contain an unfinished image but publication needs its public identity and alt text", () => {
    const d = definition(),
      image = newField("image", d.sections[0].id);
    d.fields.push(image);
    expect(formDraftDefinitionSchema.safeParse(d).success).toBe(true);
    expect(formDefinitionSchema.safeParse(d).success).toBe(false);
    Object.assign(image, {
      imageMediaId: media,
      label: "Fictional students assembling a robot",
      imageWidth: 1200,
      imageHeight: 800,
    });
    expect(formDefinitionSchema.safeParse(d).success).toBe(true);
    image.label = "";
    expect(formDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rejects external/tracking/private image URLs, malformed identities and unbounded media blocks", () => {
    const d = definition();
    for (const header of [
      "https://outside.example.test/pixel",
      "/api/v1/media/public/" + media + "?token=private",
      "/api/v1/admin/media/" + media,
      "javascript:alert(1)",
    ])
      expect(
        formDefinitionSchema.safeParse({
          ...d,
          settings: { ...d.settings, headerMedia: header, headerAlt: "Header" },
        }).success,
      ).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        ...d,
        settings: {
          ...d.settings,
          headerMedia: "/api/v1/media/public/" + media,
          headerAlt: "",
        },
      }).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        ...d,
        settings: {
          ...d.settings,
          headerMedia: "/api/v1/media/public/" + media,
          headerAlt: "Fictional workshop",
        },
      }).success,
    ).toBe(true);
    d.fields = Array.from({ length: 21 }, () => ({
      ...newField("image", d.sections[0].id),
      imageMediaId: media,
      label: "Fictional image",
    }));
    expect(formDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("renders selected responsive same-origin media with alt text, dimensions and loading policy, never sample content", () => {
    const field = {
      ...newField("image", crypto.randomUUID()),
      imageMediaId: media,
      label: "Fictional robot demonstration",
      imageWidth: 1200,
      imageHeight: 800,
    };
    const markup = renderToStaticMarkup(
      createElement(FieldRenderer, { field, onChange: () => {} }),
    );
    expect(markup).toContain("/api/v1/media/public/" + media);
    expect(markup).toContain("srcSet=");
    expect(markup).toContain('alt="Fictional robot demonstration"');
    expect(markup).toContain('width="1200"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).not.toContain("event-hackathon");
    expect(
      renderToStaticMarkup(
        createElement(FormImage, { header: true, id: media, alt: "Workshop" }),
      ),
    ).toContain('loading="eager"');
    expect(
      renderToStaticMarkup(
        createElement(FormImage, {
          id: "https://outside.example.test/pixel",
          alt: "Bad",
        }),
      ),
    ).not.toContain("<img");
    expect(formImageId("/api/v1/media/public/" + media)).toBe(media);
    expect(
      formImageId("https://elsewhere.example.test/" + media),
    ).toBeUndefined();
  });
});
