# UI asset provenance

These are local development assets pending human visual approval, not a claim
that chapter imagery, trademarks, or photography have been approved for launch.

- `public/logo.png`: supplied repository GDG mark, reused without redrawing.
- `public/assets/google-wordmark.png`: Google-hosted wordmark from
  `https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png`.
- `public/assets/inter-latin.woff2`: Google Fonts-hosted Inter Latin variable
  font, downloaded from
  `https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2`.
  License is included at `public/assets/Inter-OFL.txt`.
- `event-workshop.jpg`: illustrative Unsplash image, photo ID
  `photo-1516321318423-f06f85e504b3`.
- `event-hackathon.jpg`: illustrative Unsplash image, photo ID
  `photo-1519389950473-47ba0277781c`.
- `event-community.jpg`: illustrative Unsplash image, photo ID
  `photo-1515187029135-18ee286d815b`.
  Images were retrieved from `images.unsplash.com` and are explicitly labeled as
  illustrative development photography, not records of the named chapter events.
- `hero-campus.webp`, `hero-atmosphere.webp`: generated with the built-in image
  generation tool using Tejas's approved composition/reference as art direction.
  Brief: peach sunset clouds, Georgia Tech Tech-Tower-inspired architecture on
  the right, open space for copy on the left, glossy playful dimensional forms,
  no text, logos, or baked-in interface. A second edit removed the floating
  objects from the atmosphere layer so live Three.js objects could occupy it.
  These are synthetic artistic depictions, not documentary campus photographs.
  Original generated PNGs are retained in `.docs/ui-review/source/`.
- The live donut, star, jelly object, gem, and confetti are procedural Three.js
  geometry in `src/ui/HeroObjects.tsx`, not raster animation frames.

Supporting library references: [fflate](https://github.com/101arrowz/fflate) for
ZIP packaging in the minimal XLSX writer; [Vitest](https://vitest.dev/guide/) for
the local UI tests. No external calls are required when using those features.
