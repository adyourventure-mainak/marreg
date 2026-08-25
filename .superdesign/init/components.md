# Shared Components

## `components/ClientFlows.tsx`
Interactive Act finder, status lookup, and application form. These are feature components rather than primitives.

```tsx
"use client";
import {useState} from "react";
import Link from "next/link";
// Feature flow implementations live in the source file.
```

## `components/Shell.tsx`
Shared Header, Footer, and Page layout components.

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function Header({locale="en"}:{locale?:string}){return <><div className="bg-teal text-white text-xs font-bold uppercase tracking-[.12em]"><div className="page flex justify-between py-2"><span>Government of West Bengal · Law Department</span><Link className="focus" href={locale==="bn"?"/en":"/bn"}>{locale==="bn"?"English":"বাংলা"}</Link></div></div><header className="sticky top-0 z-10 border-b border-rule bg-surface"><nav className="page flex items-center justify-between gap-5 py-4"><Link href={`/${locale}`} className="focus flex shrink-0 items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-sm bg-teal font-display text-xl text-white">M</span><span><span className="block font-display text-2xl font-bold">MARREG</span><span className="hidden text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] sm:block">Registrar General of Marriages</span></span></Link><div className="hidden items-center gap-6 text-sm font-semibold lg:flex"><Link className="focus hover:text-teal" href={`/${locale}/acts`}>Acts &amp; rules</Link><Link className="focus hover:text-teal" href={`/${locale}/offices`}>Marriage Officers</Link><Link className="focus hover:text-teal" href={`/${locale}/help`}>Public information</Link></div><Link href={`/${locale}/status`} className="focus border border-teal px-4 py-2 text-sm font-bold text-teal">Track application</Link></nav></header></>}
export function Footer(){return <footer className="mt-20 bg-teal py-12 text-white"><div className="page grid gap-8 md:grid-cols-[2fr_1fr_1fr]"><div><div className="font-display text-2xl">MARREG</div><p className="mt-3 max-w-sm text-sm leading-6 text-white/70">Online marriage registration services of the Office of the Registrar General of Marriages, Government of West Bengal.</p></div><div><div className="text-xs font-bold uppercase tracking-widest text-saffron">Citizen support</div><div className="mt-2 font-display text-2xl">Contact the RGM office</div></div><div className="text-xs uppercase tracking-widest text-white/50">© Government of West Bengal · NIC</div></div></footer>}
export function Page({children,locale="en",eyebrow,title,lede}:{children:ReactNode;locale?:string;eyebrow:string;title:string;lede:string}){return <><Header locale={locale}/><main className="page py-14 md:py-20"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal">{eyebrow}</p><h1 className="mt-4 max-w-3xl text-5xl leading-[1.02] md:text-6xl">{title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">{lede}</p>{children}</main><Footer/></>}
```
