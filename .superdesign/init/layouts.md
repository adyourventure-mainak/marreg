# Layouts

## App root
`app/layout.tsx` loads global CSS and renders the HTML/body boundary.

## Locale layout
`app/[locale]/layout.tsx` loads the locale segment and wraps route content.

## Shared shell
`components/Shell.tsx` contains the West Bengal MARREG header, footer, and interior page wrapper. It is used by the secondary service routes.
