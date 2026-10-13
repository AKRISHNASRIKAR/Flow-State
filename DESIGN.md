# FlowState design system

## Intent
A calm workspace for reliable automation. Paper surfaces and editorial typography frame precise, useful controls. Pixel landscapes introduce the product; they do not compete with workflow editing or data. The home page must explain the product in one sentence: “Build workflows that turn triggers into ordered steps, with every run recorded.”

## Color
Use semantic Tailwind tokens from `frontend/src/app/globals.css` exclusively. Light: paper #f6f5f1, card #fbfaf8, paper-2 #eeece6; ink #0f1b2d, graphite #2a2e35, muted #5b6270; rule #dad7ce. Dark: paper #151a20, card #1d242c, paper-2 #252e38; ink #f3f0e7, graphite #d7dce2, muted #aeb7c2; rule #3e4956. Signal is blue for focus and live data; ok, wait, fail communicate run state and always accompany words. Hero text uses dedicated image-foreground tokens, independent of the current theme. Never use theme inversion to recolor illustrations.

| Token | Light | Dark |
|---|---|---|
| scrim | #0f1b2d | #0f1b2d |
| image-ink | #f6f5f1 | #f6f5f1 |
| image-shadow | #0f1b2d | #0f1b2d |
| paper | #f6f5f1 | #151a20 |
| paper-2 | #eeece6 | #252e38 |
| card | #fbfaf8 | #1d242c |
| ink | #0f1b2d | #f3f0e7 |
| graphite | #2a2e35 | #d7dce2 |
| muted | #5b6270 | #aeb7c2 |
| faint | #68707b | #929daa |
| rule | #dad7ce | #3e4956 |
| rule-soft | #e7e4dc | #303a46 |
| signal | #2b59e8 | #8ba9ff |
| signal-strong | #1f46c9 | #a8bfff |
| signal-soft | #e6ecfd | #243657 |
| ok | #1e7f55 | #7ed2a5 |
| ok-soft | #e2f1e9 | #20392e |
| wait | #86530d | #edc075 |
| wait-soft | #f6ecd9 | #3e3221 |
| fail | #bb3b2a | #ffa294 |
| fail-soft | #f8e4e0 | #442b2c |

Default follows the system appearance. Use an accessible sun/moon switch for Light and Dark and persist the choice locally. Before a choice is made, follow the system appearance. The thumb and palette transition over 500ms; reduced-motion users get an immediate change. Set appearance before paint to avoid a light flash. Use browser color-scheme for native inputs. Paper grain stays subtle in both themes.

## Typography
Newsreader: page titles and workflow names. IBM Plex Sans: interface and prose. IBM Plex Mono: IDs, timestamps, labels, and templates. Scale: 11px micro-labels, 12px metadata, 14px controls, 16px body, 20/24px section headings, 28/32px workflow names, 40px dashboard page titles, 52–84px landing headline. Body line height 1.6, controls 1.4, headings 1.1. Avoid uppercase long sentences. Heading and description occupy two separate rows; use the full reading width and allow natural wrapping on small screens. Never force desktop no-wrap text on a phone.

## Geometry
Spacing uses a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Control/icon gap 8px, field gap 16px, card padding 24px (16px on mobile), section gap 32px. Dashboard max reading width 1152px. Sidebar 256px; hide behind a mobile menu below 768px. Radius: 3px chips, 6px inputs, 6px buttons/cards/dialogs. Circles only for status dots, spinners, and switch thumbs. Borders 1px rule. Shared shadow tokens: dialog, drawer, menu, toast, control, all derived from scrim. Shadows only for elevated menus/dialogs or hover emphasis.

## Controls
Use `components/ui.tsx` for every button, input style, menu, modal, drawer, tab and state. Primary buttons use ink; exactly one main task per page. Buttons have at least 44px touch height, 16px horizontal padding, an 8px icon gap, readable wrapping text, and distinct hover, pressed, disabled and focus states. Icon controls require an accessible name. Inputs have a 44px minimum height and a visible focus ring. Avoid fixed heights on controls when text may wrap.

## Workflow library
Lead with the two-row introduction and a dedicated toolbar with “New workflow” as the main action. State counts are explicitly scoped to the current server page, never represented as global statistics. Status filter, search, and pagination live in the URL. Cards show name, meaningful description when supplied, state, edited date, explicit open link, and independent controls. Do not invent trigger types, step counts, last-run data, or credentials unavailable from the list endpoint. Draft workflows should invite setup, not pretend to be active. No redundant decorative landscape banner above the working list.

## Responsive and accessibility
No page-level horizontal scroll at 320px or larger, including enlarged text. Tables may scroll inside a labeled region. Flex children containing text need min-width: 0; wrap long workflow names and errors. Landing navigation stays on one row: brand, theme switch, and a 44px menu button. Hide its Get started link below 768px; the hero retains the main sign-in action. The mobile links open in a dropdown below the bar, without increasing the bar height. Navigation has an accessible mobile menu with Escape dismissal and focus restoration. Keyboard focus is always visible. Modals trap focus, restore it when closed, and close with Escape. Every input has a label. State never relies on color alone. Use native semantic buttons/links; never nest a button in a link.

## Hero image delivery
The landscape uses prebuilt WebP assets with responsive phone and desktop sources, eager loading, matching responsive preloads, and content-hashed filenames. An inline preview paints immediately under the full image. Avoid delaying image visibility for animations or hydration. Keep the original JPEG as the source asset; preserve the centre crop.

## States and motion
Loads reserve the expected space and announce loading. Empty screens explain the workflow model and point to the main action. Failed loads explain recovery and offer Retry. Preserve loaded content during refresh errors. Validation errors sit beneath fields; submission controls say what is happening, and global notifications report success/failure. Existing Google sign-in is account creation too; there is no checkout in this product.

Motion explains state or navigation: 150–220ms control/menu feedback, 220–300ms modal/tab transitions, 420ms page entry. Run animation follows the ordered chain. Respect reduced motion; no perpetual decorative motion. Accessible state transitions must remain understandable without animation.

## Verification
Check workflow search/filter/reset, creation validation, edit drawers, run-detail expansion, keyboard focus, mobile menu, theme persistence and both palettes. Use isolated sample data when local authentication is unavailable, remove QA routes afterward, and report that live sign-in/API mutations remain unverified. Run frontend type checks and production build. Keep a title, description and the existing favicon on each route. No placeholder or simulated production data in shipped screens.
