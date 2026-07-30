# Theme reference and UI guidelines

The single source of truth for the look and feel of this fork, written so that
a future Android or iOS client can be built to match the desktop and web
clients exactly without re-deriving anything by eye.

Canonical implementation: `src/ui/index.css` (the `.termius` block). If a value
here ever disagrees with that file, **the CSS wins** — update this doc.

---

## 1. Design intent

Three rules drive every decision below:

1. **Blue-tinted slate, not neutral grey.** Every surface keeps a hue around
   260deg. Panels should read navy; pure greys and pure black look wrong.
2. **Depth by elevation, not by borders.** Surfaces separate because they are a
   step lighter than what is behind them. Borders are a last resort and always
   low-contrast.
3. **One accent colour.** Green marks the primary action and the current
   selection. It is never decorative — if two things on a screen are green, one
   of them is wrong.

---

## 2. Colour tokens

Values are the literal hex used in `.termius`. Native clients should define
these once in a theme object (Android: a `darkColorScheme` wrapper or design
token file; iOS: a `Color` extension or asset catalog) and never inline a hex
anywhere else.

### Surfaces

| Token                            | Hex       | Where it goes                                     |
| -------------------------------- | --------- | ------------------------------------------------- |
| `background`                     | `#1a2231` | App/page background, the base layer               |
| `surface-dim`                    | `#161e2c` | Recessed areas; also the sidebar                  |
| `surface`                        | `#1e2837` | Inputs, wells, inset fields                       |
| `card`                           | `#232d40` | Cards, host/key tiles, popovers, sheets           |
| `secondary` / `muted` / `accent` | `#2a3548` | Hover fill, pressed fill, segmented-control track |
| terminal background              | `#0f1520` | Terminal canvas only — the darkest surface        |

The surface ramp, darkest to lightest:
`#0f1520` → `#161e2c` → `#1a2231` → `#1e2837` → `#232d40` → `#2a3548`

A card sits **two steps** above the page background. Keep that relationship on
mobile: if the page is `#1a2231`, a list card is `#232d40`.

### Content

| Token              | Hex       | Use                                          |
| ------------------ | --------- | -------------------------------------------- |
| `foreground`       | `#eef2f7` | Primary text, active icons                   |
| `muted-foreground` | `#8996a9` | Secondary text, inactive icons, placeholders |

Do not use pure white. `#eef2f7` is deliberately slightly cool.

### Accent and status

| Token                               | Hex       | Use                                                            |
| ----------------------------------- | --------- | -------------------------------------------------------------- |
| `primary` / `accent-brand` / `ring` | `#3fcb82` | Primary buttons, active nav/tab, focus ring, selection outline |
| `primary-foreground`                | `#0f1520` | Text/icon **on** a green fill — dark, never white              |
| bright green                        | `#45d68a` | Hover state for green fills                                    |
| `destructive`                       | `#e5484d` | Errors, destructive actions                                    |
| info blue                           | `#2f5f9e` | Informational icon chips (keys, groups)                        |
| warning amber                       | `#e5a13f` | Warnings                                                       |

> `accent-brand` is the important one. Upstream Termix uses orange (`#f59145`)
> and every other theme inherits it; this fork overrides it to green. On mobile,
> wire your "brand/primary" token to `#3fcb82`.

### Lines

| Token                 | Value                   | Notes                         |
| --------------------- | ----------------------- | ----------------------------- |
| `border`              | `#8996a9` @ 20%         | Hairlines, card outlines      |
| `input`               | `#8996a9` @ 16%         | Field outlines                |
| divider inside a card | `border` @ ~40% opacity | Row separators in a list card |

Always express borders as translucent `muted-foreground`, never a solid hex, so
they sit correctly on any surface in the ramp.

---

## 3. Typography

**UI chrome is sans-serif. Monospace is only for the terminal and for data
where character alignment matters.** This is the single biggest thing that makes
the app feel modern rather than like a terminal utility; do not use a mono font
for labels, buttons or navigation on mobile.

| Platform    | UI font                                                                   | Mono font                          |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------- |
| Web/desktop | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | `JetBrains Mono`                   |
| iOS         | SF Pro (system default)                                                   | SF Mono, or JetBrains Mono bundled |
| Android     | Roboto (system default)                                                   | JetBrains Mono bundled             |

Legitimately monospace: terminal output, IP addresses and ports, key
fingerprints, TOTP codes, container stats, keybinding hints, log bodies.

Scale as used on desktop (px):

| Role                      | Size  | Weight |
| ------------------------- | ----- | ------ |
| Page/section heading      | 20    | 700    |
| Card title / row label    | 14    | 500    |
| Body / control text       | 14    | 400    |
| Secondary / meta          | 12–13 | 400    |
| Small label above a field | 12    | 500    |

Mobile should step body up to 15–16px for touch legibility while keeping the
same relative hierarchy.

---

## 4. Shape and radius

Radius derives from one base value; everything else is a multiple. Define the
base once and compute the rest.

```
base (--radius) = 12px

sm  = base * 0.6  ≈ 7px    chips, small controls, menu items
md  = base * 0.8  ≈ 10px   buttons, inputs, list rows, nav pills
lg  = base * 1.0  = 12px   popovers, dropdowns, tooltips, selects
xl  = base * 1.4  ≈ 17px   cards, dialogs, sheets, settings cards
2xl = base * 1.8  ≈ 22px   large settings/content cards
full                        avatars, dots, status pills
```

Nothing in the UI is square-cornered. If a joined control group needs to read
as one unit, strip only the inner corners (leading item keeps its left radius,
trailing item keeps its right) rather than removing radius from all of them.

---

## 5. Spacing, sizing, elevation

| Thing                          | Value                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| Control height (button, input) | 36px; 40px large; 32px small                               |
| Icon size in nav/controls      | 16px (20px for row leading icons)                          |
| Nav pill height                | 36px                                                       |
| Card padding                   | 20px horizontal, 16–20px vertical                          |
| Row padding inside a list card | 20px horizontal, 16px vertical                             |
| Gap between cards              | 16px                                                       |
| Gap between nav items          | 2–4px                                                      |
| Sidebar width                  | 208px expanded, 56px collapsed                             |
| Elevation                      | one soft shadow on cards/popovers only; no layered shadows |

Touch targets on mobile must be at least 44pt/48dp even though desktop uses
36px — increase height, keep the radius ratio.

---

## 6. Component patterns

### Navigation rail / sidebar

Full-width rounded pills (`md` radius), inset from the sidebar edge by 8px, no
dividers between items. Active item: `accent-brand` @ 15% fill, 1px
`accent-brand` @ 25% outline, green icon and label. Inactive: `muted-foreground`
with a `muted` hover fill. Only six primary destinations are visible; extras
collapse behind a **More** group.

On mobile this becomes a bottom tab bar (or drawer) with the same six
destinations, same active-pill treatment.

### Segmented control

Rounded `lg` track filled with `muted` @ 40%, 4px padding, each segment a
rounded `md` pill. Active segment: solid `accent-brand` with
`primary-foreground` text. Used for login/register, view switches.

### Settings screens

A left rail of rounded pills, and content as one or more `2xl` cards. Rows
inside a card are separated by hairlines rather than being separate cards —
this is what keeps a dense settings screen calm. Row layout: leading icon,
label, right-aligned muted value/status/chevron. Settings is a **dedicated
screen**, not a cramped panel; on mobile it is a pushed screen.

### Cards / list tiles

`xl` radius, `card` background, soft shadow, no visible border needed. Leading
icon in a rounded `md` chip tinted by type (blue for keys/groups, brand for
hosts). Title 14/500, subtitle 12–13 in `muted-foreground`. Selected tile gets a
1px `accent-brand` outline, not a fill.

### Session focus

When a live session (terminal, RDP, VNC, telnet) is the active tab, chrome
collapses so the session fills the window; returning to a data view restores it.
Mobile: session screens are full-bleed with no bottom bar.

### Terminal

Background `#0f1520`, foreground `#eef2f7`, cursor `#3fcb82`, selection
`#2e3a4d`. ANSI palette:

|         | Normal    | Bright    |
| ------- | --------- | --------- |
| black   | `#1a2231` | `#4a5769` |
| red     | `#e5484d` | `#ff6369` |
| green   | `#3fcb82` | `#45d68a` |
| yellow  | `#e5a13f` | `#f5bc5f` |
| blue    | `#2f5f9e` | `#5b8fd6` |
| magenta | `#a05fd6` | `#bd82e8` |
| cyan    | `#3fb8cb` | `#5fd6e8` |
| white   | `#c3ccda` | `#eef2f7` |

---

## 7. Accessibility

- `foreground` on `background` ≈ 14:1; `muted-foreground` on `background` ≈ 5:1
  — acceptable for secondary text but never for primary content.
- **Always put dark text (`#0f1520`) on green fills.** White on `#3fcb82` fails
  contrast.
- Never encode state in colour alone — pair with an icon or label, since green
  and amber are close in luminance.
- Focus is a 1px `accent-brand` border plus a soft `accent-brand` @ 50% ring;
  keep a visible focus state on mobile for keyboard and switch control.

---

## 8. Porting checklist

1. Define the surface ramp, content, accent, status and border tokens from §2.
2. Set the UI font to the platform sans; bundle a mono font for terminal/data.
3. Define one radius base and derive the five steps in §4.
4. Build nav pill, segmented control, list card, settings card/row from §6.
5. Wire the terminal emulator palette from §6.
6. Verify: no square corners, no mono UI labels, no white-on-green, cards two
   ramp steps above the page.
