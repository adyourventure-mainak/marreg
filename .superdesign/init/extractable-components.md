# Extractable Components

## Header
- Source: `components/Shell.tsx`
- Category: `layout`
- Description: West Bengal MARREG government utility strip and primary navigation.
- Extractable props: `locale` (string, default `en`)
- Hardcoded: MARREG wordmark, government text, navigation labels, colors, spacing.

## Footer
- Source: `components/Shell.tsx`
- Category: `layout`
- Description: Government ownership, citizen support, and NIC attribution footer.
- Extractable props: none
- Hardcoded: West Bengal ownership and support copy.

## Page
- Source: `components/Shell.tsx`
- Category: `layout`
- Description: Public service page wrapper with eyebrow, display title, lede, header, and footer.
- Extractable props: `locale`, `eyebrow`, `title`, `lede`, `children`
- Hardcoded: layout spacing and shell styling.
