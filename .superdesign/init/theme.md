# Theme Summary

- Paper `#F6F1E8`; surface `#FFFDF8`; ink `#17211F`; muted `#5C6763`
- Deep teal `#0E4542`; teal tint `#DCEBE5`; saffron `#D98B28`; saffron tint `#F7E5C5`
- Rule `#D9D2C6`; success `#2F7458`; brick error `#A94A3A`
- Display font: `Fraunces`, fallback Georgia serif
- UI font: `Manrope`, fallback system sans
- Base spacing: 4px; primary spacing 8/12/16/24/32/48/64/96
- Radius: 2px controls, 8px cards, pill badges
- Shadow: `0 12px 28px rgba(23, 33, 31, 0.08)`
- Breakpoint: Tailwind defaults; content max width 68rem

## `app/globals.css`
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap');
:root{--paper:#f6f1e8;--surface:#fffdf8;--ink:#17211f;--muted:#5c6763;--teal:#0e4542;--teal-tint:#dcebe5;--saffron:#d98b28;--saffron-tint:#f7e5c5;--rule:#d9d2c6;--success:#2f7458}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;background:var(--paper);color:var(--ink);font-family:Manrope,system-ui,sans-serif}h1,h2,h3{font-family:Fraunces,Georgia,serif}.page{max-width:1088px;margin:auto;padding:0 20px}.focus:focus-visible{outline:3px solid var(--saffron);outline-offset:3px}.ledger{background-color:var(--surface);background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 31px,var(--rule) 32px);border:1px solid var(--rule)}
```

## `tailwind.config.ts`
Extends Tailwind with paper, surface, ink, teal, saffron, rule, Fraunces, and Manrope tokens.
