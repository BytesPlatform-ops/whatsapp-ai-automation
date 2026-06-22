# Pixie Role Morph Hero — persona assets

Drop the final cinematic persona renders here. Until a file exists, the
`CharacterStage` shows a graceful emerald silhouette placeholder (no crash,
layout stays intact).

## Expected files (referenced from `roleData.ts`)

| Role | File |
|------|------|
| AI Receptionist | `ai-receptionist.webp` |
| Website Builder | `website-builder.webp` |
| Social Media Marketer | `social-media.webp` |
| AI Influencer | `ai-influencer.webp` |
| SEO Analyst | `seo-analyst.webp` |
| Omnichannel AI | `omnichannel-ai.webp` |

## Art direction

- One central AI/business persona, **bottom-anchored**, head near the top.
- Dark studio background — ideally transparent or near-black so it composites
  into the cinematic backdrop. PNG-with-alpha or dark WebP both work.
- Recommended ~900×1200 (3:4), exported as **WebP or AVIF**, < ~250 KB each.
- Keep the same framing/scale across all six so the cross-fade morph aligns.
- The emerald scan ring sits around the torso (~62% height) — leave that area
  visually clean.

To swap the path or naming, edit `image:` in
`components/sections/role-morph/roleData.ts`.
