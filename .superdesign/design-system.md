# MARREG Design System

## Product context
MARREG is a public-service marriage registration platform for Bangladesh. The experience must make a consequential government process feel understandable, verifiable, and humane. Primary users are couples seeking requirements, checking an application, finding an office, or starting a registration. Secondary users are registrars and administrators.

## Visual direction
Use a civic editorial language: warm paper surfaces, ink typography, deep teal navigation, and saffron markers for action and progress. The design should feel official without feeling bureaucratic, and personal without becoming decorative. Use generous whitespace, clear borders, short explanations, and visible source/date metadata.

## Tokens
- Paper: #F6F1E8
- Surface: #FFFDF8
- Ink: #17211F
- Muted ink: #5C6763
- Deep teal: #0E4542
- Teal tint: #DCEBE5
- Saffron: #D98B28
- Saffron tint: #F7E5C5
- Brick error: #A94A3A
- Rule: #D9D2C6
- Success: #2F7458
- Display font: Fraunces, Georgia, serif
- UI font: Manrope, system-ui, sans-serif
- Body measure: 68rem maximum, 66ch reading measure
- Spacing: 4px base scale; use 8, 12, 16, 24, 32, 48, 64, 96
- Radius: 2px for controls, 8px for cards, 999px for pills
- Shadow: 0 12px 28px rgba(23, 33, 31, 0.08)

## Layout
Desktop pages use a narrow utility rail above a two-level header, then a centered content column. The homepage has a split hero: task-first copy and finder on the left, a signature-ledger visual on the right. Use a 12-column grid with an 8-column reading/content area and 4-column supporting area. On mobile, collapse to one column and preserve the task order.

## Components
- Header: compact teal utility strip, wordmark, language switcher, primary links, outlined status action.
- Button: saffron filled primary, teal filled secondary, ink outline tertiary. Minimum 44px height.
- Input: paper surface, 1px rule, visible label, helper text, error text below field.
- Card: paper or white surface, rule border, restrained shadow only for elevated task panels.
- Status badge: small uppercase label with tinted background and ink color.
- Timeline: vertical rule with numbered or check markers; each step has status, title, explanation, and timestamp.
- Source note: compact metadata row with source type, publication date, and link affordance.
- Signature ledger: a recurring decorative motif of ruled paper, registration seal, and hand-drawn signature line. It is a visual anchor, not a literal form field.

## Motion
Use small, purposeful transitions only: 160ms color and border changes for controls, 220ms reveal for panels, and a staggered 60ms entrance for task cards. Respect prefers-reduced-motion.

## Accessibility
Use visible focus rings in saffron, WCAG AA contrast, semantic landmarks, labels associated with controls, keyboard-first disclosure and navigation, and do not rely on color alone for status.

## Key pages
1. Homepage: orient users toward Act finder, application status, and office search.
2. Act finder: searchable/filterable requirements with source notes and a plain-language summary.
3. Status timeline: application identifier, current stage, last update, next action, and contact route.
4. Officer search: district/upazila filters, office hours, address, phone, accessibility notes.
5. Application form: progressively disclosed sections with save/resume, validation, review, and consent.

## Hard requirements
All visible UI must use only these fonts, colors, spacing, radii, shadows, and component styles. Do not introduce purple, neon gradients, glassmorphism, generic dashboard styling, stock photography, emoji marks, or unverified legal claims.
