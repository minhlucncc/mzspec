# AI Image Generation Prompt — mzspec Pipeline Flow

Use this prompt with DALL-E 3 for best text accuracy, or with Midjourney (`--ar 16:9 --s 250 --v 6.1`) if you prefer a more polished artistic finish. For Midjourney, prefix with `/imagine` and paste the full block.

---

```
A wide-format flowchart illustration of a three-swimlane software delivery pipeline,
rendered in a clean, modern flat vector style reminiscent of Linear/Notion documentation.
16:9 widescreen composition. White background with plenty of breathing room.

COLOR SYSTEM:
- Lane 1 (Task Sources): warm beige/swiss paper background #fafaf8, nodes in white with
  warm gray borders #d4d2cb and dark warm text #4b4740.
- Lane 2 (Developer): soft cool blue background #f8f9fd, nodes in white with
  blue borders #93c5fd and navy text #1e40af.
- Lane 3 (Reviewer): soft lavender background #faf8fd, nodes in white with
  violet borders #a78bfa and deep purple text #5b21b6.
- Merge nodes: emerald green fill #ecfdf5, mint borders #34d399, dark green text #065f46.
- Gate node: warm amber fill #fffbeb, amber border #f59e0b, dark amber text #92400e.
- Arrows: slate gray #94a3b8 stems.
- Error/loop arrows: amber #f59e0b, dashed.
- Approval arrow: emerald #10b981, solid.
- All arrowheads are small, unfilled chevrons matching their line color.

LAYOUT — three horizontal bands spanning the full width:

LANE 1 (top, approximately 16% of height):
  Label "TASK SOURCES" on the far left as a small vertically-rotated label.
  One rounded rectangle node: "backlog task (local · GitHub · Mello)" — gently
  rounded corners, white fill, warm gray border.
  A second node near the far right edge: "status → done" — same styling.

LANE 2 (middle, approximately 46% of height, the tallest lane):
  Label "DEVELOPER" on the far left, vertically-rotated.
  Seven rounded rectangle nodes arranged in a horizontal left-to-right sequence,
  with rounded corners, white fill, blue borders, centered navy labels:
    propose
    spec
    spec-pr
    ship-plan
    ship-code (taller node to accommodate a sub-label.
      Amber fill and border. Top line in bold: "ship-code". Second line smaller:
      "⚙️ test · lint · types")
    ship-pr
    address-review

LANE 3 (bottom, approximately 16% of height):
  Label "REVIEWER" on the far left, vertically-rotated.
  Four nodes arranged left to right:
    review SPEC PR (white fill, violet border)
    merge SPEC PR (green fill and border, bold label)
    review CODE PR (white fill, violet border)
    merge CODE PR (green fill and border, bold label)

CONNECTORS AND FLOW — a single continuous left-to-right path that snakes through the lanes:

  1. From backlog task node (bottom-center), a vertical arrow drops down to the
     top-center of the propose node (lane transition).
  2. Horizontal arrows between adjacent nodes in lane 2: propose→spec, spec→spec-pr,
     ship-plan→ship-code, ship-code→ship-pr.
  3. From spec-pr (bottom-center), a vertical arrow drops to review SPEC PR
     (top-center), labeled "SPEC PR" on a small pill badge at the elbow.
  4. Horizontal arrow: review SPEC PR → merge SPEC PR.
  5. From merge SPEC PR (top-center), a vertical arrow rises to ship-plan
     (bottom-center), labeled "merged" on a pill badge.
  6. From ship-pr (bottom-center), a vertical arrow drops to review CODE PR
     (top-center), labeled "CODE PR" on a pill badge.
  7. From review CODE PR, two outgoing paths:
       a. A dashed amber arrow curves downward and to the right, then rises up to
          address-review (bottom-center). Labeled "changes" on a small amber badge.
          This is the feedback loop.
       b. A solid green arrow goes right to merge CODE PR. Labeled "approved" on a
          small green badge.
  8. From address-review (left edge), a dashed amber arrow points leftward back to
     ship-code (right edge). Labeled "re-ship" on a small amber badge. This closes
     the feedback loop.
  9. From merge CODE PR (top-center), a vertical arrow rises to the status → done
     node (bottom-center), completing the flow.

The overall feel is organized, calm, and thoroughly modern — like a polished technical
documentation site. All corners are softly rounded, typography is clean sans-serif
(Inter or system-ui), there are no photorealistic elements, no heavy gradients,
no ornate decorations. The flow reads naturally left-to-right top-to-bottom.
The dashed feedback loop is the only non-linear element, deliberately emphasized
in amber.
```

---

## Tips per tool

| Tool | How to use |
|------|-----------|
| **DALL-E 3** | Paste the entire prompt as-is. Best for accurate text and layout. |
| **Midjourney** | Prefix with `/imagine` and append `--ar 16:9 --s 250 --v 6.1`. |
| **Ideogram** | Paste the entire prompt. Add `/imagine` or use the web UI. |
