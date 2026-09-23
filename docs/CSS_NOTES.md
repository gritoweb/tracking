# CSS notes — why the stylesheet is the way it is

These used to be multi-line comments inside `src/react-app/css/`. A comment there is now one line and this file keeps the full reasoning, word for word, grouped by file and headed by the line each one sat above.

Two things to know when reading them. The tokens were written as OKLCH and are hexadecimal now (the same colours, converted with CSS Color 4 gamut mapping; contrast was re-checked pair by pair and no WCAG threshold moved), so an `L 0.523` below is OKLCH lightness, not a value you will find in the file. And the contrast ratios quoted were measured when each token was tuned; they are the reason the tokens are what they are.

## `src/react-app/css/app.css`

### @import "shadcn/tailwind.css";

shadcn v4's runtime stylesheet. Purely additive: the `data-open` / `data-closed` / `data-checked` / `data-active` / `data-horizontal` / `data-vertical` custom variants that v4 components are written against (they replace the `data-[state=open]:` longhand), plus the `no-scrollbar`, `scroll-fade-*` and `shimmer-*` utilities. Nothing here overrides a token or a utility this app already defines — verified by diffing the built CSS before and after adding it.

## `src/react-app/css/components/fullcalendar.css`

### @reference "../app.css";

FullCalendar theming, scoped to `.tt-calendar`, mapping FC's CSS variables to the app's design tokens. Tokens (--border, --card, --primary, …) are swapped by the `.dark` class, so these overrides adapt to dark mode automatically — no separate dark block needed.

`@reference` (not `@import`) so `@apply` below resolves against the app's theme/utilities without re-emitting app.css's output into this file.

### --fc-today-bg-color: color-mix(in oklab, var(--foreground) 4%, transparent);

Neutral, not brand red: this washed the entire today column full-height, which is the accent as a large background fill (the One Accent Rule forbids exactly that) and muddied red project blocks sitting on it. The now-indicator line below stays red — that one is precise and earned.

### .tt-calendar .fc .fc-timegrid-slot {

Slot height is driven by the zoom control (--fc-slot-height, px), falling back to a comfortable drag target when unset.

### .tt-calendar .fc .fc-timegrid-col-events {

FullCalendar's own gutter is 2px left and 2.5% right, so a day column leaves a growing empty strip on the right. The left gap is a real margin, the right one is the inset gutter each block draws (below), which makes both read as 3px.

### .tt-calendar .fc-timegrid-event-harness:has(.fc-event-mirror) {

The drag preview is rendered full-width over its neighbours; CalendarView pins it to the dragged block's own share of the column through these vars.

### box-shadow: inset -3px 0 0 var(--fc-page-bg-color);

~3px of gutter so stacked blocks stay distinct — an inset shadow, not a real border, so it doesn't shift FC's own width/left math.

### container-type: inline-size;

Event labels degrade by how much room THIS block has, not by viewport width: a week grid on a tablet and a day grid on a phone give wildly different column widths at similar viewports. Without this, the meta line wraps into "9:00 –" / "10:30" / "1h" / "30m" — four lines of shrapnel.

### .tt-calendar .fc .fc-timegrid-event.tt-event-select,

The range you drag to create wears FullCalendar's own solid blue, where the app's dark event ink is unreadable — white on it, in both themes.

### @container (max-width: 144px) {

"9:00 – 10:30 · 1h 30m" needs ~145px at 11px mono. Narrower than that and the duration would be silently clipped by the block's overflow, so drop it deliberately and keep the times. (Measured: a week column is 132px at 1280px viewport, 176px at 1600px.)

### @container (max-width: 84px) {

Below ~85px even the times get clipped — and the block's position and height already encode when and how long. Title plus project only.

### .tt-calendar .fc-event.tt-event-running .tt-running-dot {

Shares the app-wide running-dot cue rather than redeclaring its own keyframe — see css/global/motion.css. Three separate pulse implementations used to exist for the one "a timer is running" signal, at three different durations and curves.

### .tt-calendar .fc-event.tt-event-ghost {

Ghost = unconfirmed external calendar event: dashed outline, hollow fill, cursor affordance. Sits visually "behind" real tracked blocks.

### .tt-calendar .fc-event.tt-event-draft {

Draft = a proposed entry awaiting review. Dashed like a ghost, but tinted with its proposed project's colour so a drafted week still reads as a week of work rather than a row of grey placeholders. Solidifies on hover — the block is a door into review.

### /* Two separate handles: -start (top, needs eventStartEditable) and -end

Resize handle: FullCalendar's default is an ~8px invisible strip at the bottom edge, easy to miss — a near-miss lands on the event body instead (a click opens the entry sheet, a drag moves it) rather than resizing. Widen the actual hit area and draw a visible grip so the affordance is discoverable, matching what a drag-to-resize calendar (Toggl) signals.

### .tt-calendar .fc-timegrid-event .fc-event-resizer {

Two separate handles: -start (top, needs eventStartEditable) and -end (bottom, needs eventDurationEditable) — both are on, so both edges resize, like Google Calendar. Sharing one `bottom` offset across both had been pulling the top handle down to the bottom, which is why only one dot showed.

### @apply content-[''] absolute left-1/2 w-3 -translate-x-1/2 border-t-[3px] border-double border-foreground opacity-0 transition-opacity duration-fast ease-out-quart;

Toggl's own grip icon (react-big-calendar's dnd addon, .rbc-addons-dnd-resize-ns-icon): a double horizontal line, not a dot. The bare 8px FC gives by default has no visual cue at all, so a near-miss lands on the event body (click opens the entry sheet, drag moves it) instead of resizing. Neutral foreground, not the brand accent — this is a grid affordance, not a project color.

## `src/react-app/css/components/interaction.css`

### .tt-reveal {

─── Reveal-on-hover ─────────────────────────────────────────────────────── Row actions that fade in with the pointer. The gate must be hover CAPABILITY, not viewport width: the old `sm:opacity-0 sm:group-hover:opacity-100` hid the control on every touch device wider than 640px — i.e. every tablet — where `group-hover` can never fire, so Continue and the row menu were unreachable.

Default is visible; only a device that can actually hover opts into hiding. focus-within/focus-visible keep it reachable by keyboard.

### @media (pointer: coarse) {

─── Touch targets ───────────────────────────────────────────────────────── Gated on input capability, not viewport width — same reasoning as .tt-reveal above. The timer bar's dense controls sit at 28–32px, which is right under a trackpad and misses under a thumb, and the device that decides is the one with the thumb: a 900px-wide tablet is not a desktop. Only the hit area grows; the visual chip keeps its designed height, so the bar doesn't turn chunky on a pointer device that merely reports coarse.

## `src/react-app/css/components/richtext.css`

### .tt-richtext ul[data-type="taskList"] input[type="checkbox"] {

The browser's native checkbox has no shape opinion — give it the same square-ish mark used by the task row and subtask checkboxes, not a third shape in the app.

## `src/react-app/css/components/swatch.css`

### /* Text only — for labels already sitting on a swatch-tinted surface painted by

─── Swatch tints ────────────────────────────────────────────────────────── Project and tag colors are arbitrary palette hexes, so any label drawn on a tint of its own swatch has to be derived, not copied. Setting `color` to the raw swatch (the old ProjectBadge/calendar-event approach) makes legibility a lottery on the hue's luminance — amber landed at 1.88:1 in light mode.

Mixing the swatch toward --foreground fixes both themes with one expression: light ink is dark so the label darkens, dark ink is light so it lightens. `--swatch-ink-mix` is the measured ceiling per theme; consumers set --swatch.

### .tt-swatch-ink {

Text only — for labels already sitting on a swatch-tinted surface painted by something else (FullCalendar paints the event block itself).

### .dark .tt-swatch-column {

In dark, transparent-over-background put a low-chroma status (Backlog's slate) at the same lightness as the card resting on it (both ~0.22). Basing the column on --muted keeps every column a step lighter than its cards, whatever the swatch.

### .tt-on-tint-muted {

Secondary text sitting on a swatch tint. --muted-foreground is tuned against the flat background and washes out over a colored fill (3.81:1 worst case), so step it toward ink. Measured ceiling 80% in both themes.

## `src/react-app/css/global/motion.css`

### @keyframes row-flash {

Just-stopped row flash — a primary wash blooms then recedes, with a left rail accent that draws attention to the row without shifting layout.

### @keyframes recording-pulse {

Flat recording pulse behind the round Stop button — a solid ring scales outward and fades while the disc itself stays put, no shadow/gradient.

### @keyframes running-dot {

The quiet running cue — a dot breathing in place, for the sidebar readout and a running block on the calendar grid. Opacity only: these sit inside dense rows where a scaling dot would nudge its neighbours.

## `src/react-app/css/global/theme.css`

### --radius-container: 1.25rem;

Geometry is chosen by what an element IS, not by taste (DESIGN.md §5). Three families, and the boundary between them is density:

controls — `rounded-full`. Buttons, badges, inputs, segments, icon buttons. A pill costs nothing at 24-40px and it is the single loudest cue in the new language. containers — `rounded-container` (this token). Cards, dialogs, sheets, popovers. 20px, up from the 12px `rounded-xl` they used. data cells — unchanged `rounded-md`/`-lg`. Entry rows, timesheet cells, calendar blocks, planner cells, table cells. Pills on a 30-row list would trade the app's actual job for a look.

Named rather than spelled `rounded-[1.25rem]` at each call site so the container radius moves in one place, and so a reviewer can see which family a surface belongs to from the class name alone.

### --text-micro: 0.625rem;

Micro — the documented floor of the type ramp (DESIGN.md §3), for chrome-level detail only: kbd chips, dense inline badges, counts. It was always a real step; it was just spelled as a 10px arbitrary value at 28 call sites, which reads as drift and trips the design-system check. Named so it can be used as `text-micro` and so the floor moves in one place.

Deliberately no `--text-micro--line-height`: the arbitrary values it replaces set font-size only and inherited their leading, so pinning one here would quietly reflow 28 dense call sites. This swap is meant to be byte-identical in output.

(Don't write the arbitrary form in this comment — Tailwind scans CSS comments too and will emit a dead utility for it.)

### --text-display: 1.5rem;

Display — one step above Title, for a panel's own name where it *is* the header (the task detail sheet), not a page heading sitting above other chrome. Was 40px; cut to 24px on 2026-09-23 at Luis's request.

### --z-index-sticky: 10;

Layering. The values are the ones already in use (10/20/50) — this names the three tiers that existed by convention so a new surface picks a meaning rather than a number, and so the order is greppable in one place.

sticky — headers and frozen first columns inside a scrolling grid overlay — something covering a pane but not the app (calendar error wash, the ghost-count button, a sticky corner cell that has to win against its sticky neighbours) portal — dialogs, sheets, popovers, dropdowns, selects tooltip — above portal on purpose: a tooltip on a control *inside* a dialog was previously the same 50 as the dialog and relied on DOM order to be visible at all.

### --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

Motion — natural deceleration curves (no bounce/elastic). `--ease-out-quart` is the default: everything uses it unless it has a reason not to. Quint is reserved for the one large, slow move (the timer control's width change), where the flatter tail keeps a big element from appearing to overshoot.

### --transition-duration-fast: 150ms;

Duration scale (utilities: duration-fast / -base / -slow). Three steps, chosen by how far the thing being animated travels: fast — a state change in place: hover, focus, colour, a chevron. base — something appearing or leaving: overlays, popovers, rows. slow — a panel-sized move across the screen: sheets, drawers. Numeric `duration-200` and friends still work; prefer the named steps so the scale stays greppable and a retune happens in one place.

### --animate-fade-in: fade-in var(--transition-duration-slow) var(--ease-out-quart) both;

Reusable entrance animations (utilities: animate-fade-in / -up / -scale-in). All three sit on the `base` step: they used to run 250/350/400ms, which read as three different systems on screens that show more than one of them (the reports strip fades up while an empty state scales in). A pure opacity fade can afford to be the slowest of the three since nothing moves.

### --animate-recording-pulse: recording-pulse 1.6s var(--ease-out-quart) infinite;

"A timer is running" has exactly two forms, and they share a 1.6s cadence so that when both are on screen — the sidebar readout sits under the timer bar — they breathe together instead of drifting against each other.

1. The signature: a flat ring breathes outward from behind the round Stop button. Spends attention deliberately; only used on that one control. 2. The quiet one: a small dot breathes in place, for dense surfaces (the sidebar's running readout, a running block on the calendar grid).

Both loop symmetrically, so the dot is on `ease-in-out` rather than the house `ease-out-quart` — see DESIGN.md §6. The ring keeps `ease-out-quart` because it *travels* (scale 1 → 1.7) rather than breathing in place.

### --animate-stopped:

Just-stopped entry — the row fades up into place while a primary-tinted wash and left rail bloom then recede, so the eye tracks where the timer landed (utility: animate-stopped).

## `src/react-app/css/global/variables.css`

### --background: #fcfbfa;

Soft tones: a warm-neutral off-white ground (chroma toward the brand's red hue, not the cliché cream). Ink softened off pure black.

Surfaces are separated by TONE ALONE — cards carry no border (DESIGN.md §4). The direction of the step is per-theme, chosen for legibility rather than symmetry: in light a card RECEDES below the ground (0.988 -> 0.962), in dark it LIFTS above it (0.185 -> 0.228), because a card darker than an already dark page reads as a hole. Popover keeps the lightest value in light mode on purpose: an overlay floats above the page, so it must not share the card's recessed tone or a dialog reads as part of the surface behind it.

### --primary-foreground: #ffffff;

Pure white, not 0.985: on the brand red #fafafa measures 4.40:1 and fails AA for every primary button label. White measures 4.59:1, and #ffffff is what DESIGN.md's button-primary spec already documents.

### --muted-foreground: #6e6867;

Tuned against the *worst* ground it lands on, not the page background — muted/accent is where secondary text mostly sits (toolbars, sidebar, tab tracks, count badges), and those moved down with the rest of the ramp. L 0.543 was calibrated against the old muted (0.965) and only reaches 4.19:1 on the new one. L 0.523 clears AA on all five grounds: background 5.27 / card 4.88 / popover 5.38 / muted 4.52 / accent 4.52.

### --destructive: #a5002a;

Destructive has to be a DIFFERENT RED from the brand, and it wasn't: --primary sat at hue 27.33 and --destructive at 27.325 — the same hue to three decimals, 0.011 apart in lightness. On a 1.5px progress bar a project 3% into its budget and one 110% through it were indistinguishable, and the budget ladder ran red -> amber -> red, reversing exactly where it mattered.

Deeper and cooler: 9 degrees off the brand hue and 0.138 darker, so the two reds separate on lightness as well as hue and destructive reads as the more severe of the pair. The old value also failed AA as small text — 4.27:1 on card, 3.95:1 on muted — which is why `text-destructive` needed no ink variant to go wrong. Measured here: label 7.97:1, text 7.72 background / 7.15 card / 6.61 muted, 6.05:1 on its own /10 tint and 5.12:1 on /20.

### --success-ink: #006f46;

Success used as TEXT — the third of the same family as --primary-ink and --warning-ink, and it exists for the same measured reason: --success is calibrated as a fill and fails AA as small type on every light ground. Holds hue and chroma, moves lightness only. L 0.488 was tuned against the old ramp; on the new one it misses at 4.31:1 on muted, so it steps to 0.468 — background 5.85 / card 5.42 / popover 5.97 / muted 5.02 / accent 5.02, and 4.50:1 on its own /10 tint (worst of the three plausible compositing models: linear, oklab, and gamma-space alpha). `/15` is deliberately not in that list: both call sites are `aria-hidden` progress-bar tracks with no text on them.

### --warning-ink: #9e4a00;

Warning used as TEXT, exactly as --primary-ink is for the brand red. --warning is calibrated as a fill; as small text it measured 3.15:1 on card (the "Unverified" badge) and 2.77:1 on its own /10 tint (the warning Alert). Holds hue and chroma, moves lightness only. Worst measured ground is the /10 tint at 5.36:1, and 4.52:1 for the alert description's /90 text.

### --border-strong: #bab6b6;

Dense row dividers only (entry list, timesheet). --border measures 1.21:1 on a card, which effectively disappears across a 30-row list for a low-vision user. This is ~1.8:1 — deliberately short of the 3:1 non-text target, because a 3:1 divider reads as a structural rule and DESIGN.md keeps borders subtle. Cards no longer have an edge at all (tone separates them); --border now draws input edges and internal dividers only.

### --ring: #496dc3;

Focus gets its own hue. This used to be byte-identical to --primary and 0.011 lightness from --destructive, so a focused field read as a validation error and "Save changes" was the same red as "Discard". Hue 265 is the system's own cool tint (see the dark ramp), not a stock blue; L is set per theme so the ring clears 3:1 (WCAG 1.4.11) on background/card/muted/accent — measured 4.44:1 here, 5.01:1 dark.

### --swatch-ink-mix: 46%;

How much of a project/tag swatch survives in text drawn ON that swatch's own tint (the rest is mixed toward --foreground). Ceiling measured across all 18 DISTINCT_COLORS over every ground, mixing in oklab as `color-mix` does: 50% light (was 52% before the ramp moved down), 64% dark — these sit under it with margin, so the token is unchanged. See .tt-swatch-tint.

### --swatch-column-mix: 6%;

Full-surface tint (a whole status column, not a small chip) — much weaker than --swatch-ink-mix's 13% chip tint, since a whole panel of saturated color reads as "selected" rather than "labeled". See .tt-swatch-column.

### --primary-ink: #b71a1b;

Brand red used as TEXT (active nav item, running pill, the billable "$"). --primary is tuned as a fill behind white, and fails AA as small text: 3.59:1 on its own /10 tint in light, 4.27:1 in dark, 4.45:1 for the billable glyph. This holds the brand hue and chroma and moves only lightness — down toward ink in light, up in dark. Measured ceilings: light L ≤ 0.52, dark L ≥ 0.74.

### --chart-ink-soft: #d2c8c6;

The only chart-specific colour left. --chart-1..5 were stock shadcn values doing two things wrong: they were a second* categorical palette competing with the 18-colour DISTINCT_COLORS the rest of the app uses for projects and tags, and chart-1 flipped hue family between themes (orange in light, blue-violet in dark). Categorical colour now comes from DISTINCT_COLORS everywhere, and both bar charts encode billable with --success — the same meaning it carries on the KPI strip.

This is the de-emphasized half of those part-of-whole stacks: the non-billable remainder above the billable green. It has to stay distinguishable from --success on luminance alone, since hue is the one channel a colour-blind reader loses — measured 2.23:1 greyscale in light, 3.74:1 in dark, with stack position and a legend carrying the rest.

### --background: #111315;

Soft tones: lift the harsh near-black to a soft charcoal with a faint cool tint (hue 265), so the warm red brand reads against a calm, premium ground rather than pure black. Cards sit a step above the field; ink eased off pure white.

### --destructive: #fb7188;

Same separation as light, resolved the other way: on charcoal a deep red disappears, so destructive goes brighter than the brand red rather than darker (0.72 vs --primary's 0.65) and takes the bigger hue step.

Its foreground flips to ink, which --primary-foreground already does in this theme and --destructive-foreground never did: near-white on this fill measures 2.69:1 and failed AA on every destructive button label in dark mode. Ink measures 7.24:1. Text uses of the token: 6.93 background / 6.36 card / 5.63 muted, 5.59:1 on its own /10 tint.

### --success-ink: #00bc7d;

Dark ink is light, so the fill value already clears AA as text here (5.53:1 worst ground). Same value, declared so call sites use one class.

### --warning-ink: #fd9a00;

Dark ink is light, so the fill value already clears AA as text here (6.36:1 worst ground, 6.06:1 on its own /20 tint). Same value, declared so call sites can use one class in both themes.

### --chart-ink-soft: #44484f;

Dark ground inverts which end is "muted": the soft mark goes darker than the card, not lighter. Same role, same hue discipline as light.
