import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ── Design-system guards (wired below, "error") ──────────────────────────
// Each of these was swept the app clean by hand more than once and grew back,
// because nothing failed when it did. They match class strings, so a
// violation is caught in the editor rather than in a design review six weeks
// later. See DESIGN.md §3 and §6.
const MOTION_AND_LAYER_CHECKS = [
	{
		selector:
			"Literal[value=/^(?=[\\s\\S]*transition-(all|colors|opacity|transform|shadow))(?![\\s\\S]*ease-out-qu)[\\s\\S]*$/]",
		message:
			"Pair every transition with a duration token and ease-out-quart (DESIGN.md §6). A bare `transition-colors` silently falls back to Tailwind's default curve, which is not part of the system.",
	},
	{
		selector:
			"TemplateElement[value.raw=/^(?=[\\s\\S]*transition-(all|colors|opacity|transform|shadow))(?![\\s\\S]*ease-out-qu)[\\s\\S]*$/]",
		message:
			"Pair every transition with a duration token and ease-out-quart (DESIGN.md §6).",
	},
	{
		// Also matches a *bare* `ring-1`/`ring-2` in a class string that
		// mentions focus — ProjectForm.tsx:137 wrote `ring-2 …
		// focus-visible:ring-ring` and slipped past the first version
		// of this rule, which only looked for the `focus-visible:`
		// prefix on the width itself.
		selector:
			"Literal[value=/focus-visible:ring-[12]\\b|focus:ring-[12]\\b|focus:outline-hidden|(?=[\\s\\S]*focus)[\\s\\S]*(?:^|\\s)ring-[12]\\b/]",
		message:
			"Use the house focus ring: `focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50` (DESIGN.md §5, 'one focus vocabulary everywhere').",
	},
	{
		selector: "Literal[value=/\\btext-\\[/]",
		message:
			"Arbitrary font size. Use a named step — text-micro / text-xs / text-sm / text-base / text-xl (DESIGN.md §3, The Named-Step Rule).",
	},
	{
		selector: "Literal[value=/\\bz-(10|20|30|40|50)\\b/]",
		message:
			"Use the semantic layer scale — z-sticky / z-overlay / z-portal / z-tooltip (css/global/theme.css) — so a new surface picks a meaning, not a number.",
	},
];

// ── Silent-failure and design-drift guards ──────────────────────────────
// A config object's `no-restricted-syntax` fully replaces, rather than merges
// with, another matching config's, so each scope below spreads every selector
// that must apply to its files.
// `res.json().catch(() => null)` is the parse-fallback idiom, not a swallowed failure, so it is not flagged.
const CATCH_CHECKS = [
	{
		selector:
			"CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
		message:
			"no-empty-catch-handler: swallowing a rejection hides the failure; handle it or log it with context.",
	},
	{
		selector:
			"CallExpression[callee.property.name='catch']:not([callee.object.callee.property.name='json']) > ArrowFunctionExpression:matches([body.type='Identifier'][body.name='undefined'], [body.type='Literal'][body.raw='null'], [body.type='ArrayExpression'][body.elements.length=0], [body.type='UnaryExpression'][body.operator='void'])",
		message:
			"no-empty-catch-handler: `.catch(() => undefined)` swallows the rejection just like an empty handler; handle it or log it with context.",
	},
	{
		selector:
			"Property[key.name='onError'] > ArrowFunctionExpression[params.length=0]",
		message:
			"no-discarded-onError-argument: onError takes no parameter, so the error is being discarded.",
	},
];

// Where a raw hex/palette colour is the point rather than a drift: the design
// tokens and brand mark themselves, their generated/consuming pairs, e2e
// fixtures and one-off scripts.
const COLOR_EXEMPT_FILES = [
	"src/react-app/components/ui/**",
	"src/react-app/components/brand/**",
	"src/shared/colors.ts",
	"src/shared/brand-mark.ts",
	"src/react-app/lib/colorUtils.ts",
	// Email clients do not support oklch(), and Chrome's setBadgeBackgroundColor takes a literal.
	"src/worker/emails/**",
	"extension/background/**",
	"e2e/**",
	"scripts/**",
];

const COLOR_CHECKS = [
	{
		selector: "Literal[value=/#(?:[0-9a-fA-F]{3,4}){1,2}\\b/]",
		message:
			"no-raw-hex-color: use a semantic token from css/global/variables.css instead of a raw hex colour.",
	},
	{
		selector: "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}){1,2}\\b/]",
		message:
			"no-raw-hex-color: use a semantic token from css/global/variables.css instead of a raw hex colour.",
	},
	{
		selector:
			"Literal[value=/\\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|caret|decoration|outline|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone|white|black)(?:-(?:50|100|200|300|400|500|600|700|800|900|950))?\\b/]",
		message:
			"no-tailwind-palette-color: use a semantic token (bg-primary, text-muted-foreground, …) instead of a raw Tailwind palette colour.",
	},
	{
		selector:
			"TemplateElement[value.raw=/\\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|caret|decoration|outline|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone|white|black)(?:-(?:50|100|200|300|400|500|600|700|800|900|950))?\\b/]",
		message:
			"no-tailwind-palette-color: use a semantic token (bg-primary, text-muted-foreground, …) instead of a raw Tailwind palette colour.",
	},
];

// A hand-rolled control reinventing a components/ui primitive — only that folder is exempt.
// weekGridColumns.ts is the single home of the week-grid column widths.
const UI_PRIMITIVE_EXEMPT_FILES = ["src/react-app/components/ui/**", "src/react-app/lib/weekGridColumns.ts"];

const UI_PRIMITIVE_CHECKS = [
	{
		selector: "Literal[value=/\\bshadow-(?:sm|md|lg)\\b/]",
		message:
			"no-adhoc-shadow: cards and controls have no resting shadow by design (DESIGN.md §4); reuse a components/ui primitive instead.",
	},
	{
		selector: "TemplateElement[value.raw=/\\bshadow-(?:sm|md|lg)\\b/]",
		message:
			"no-adhoc-shadow: cards and controls have no resting shadow by design (DESIGN.md §4); reuse a components/ui primitive instead.",
	},
	{
		selector:
			"JSXOpeningElement[name.name=/^(?:Input|SearchInput|PasswordInput)$/] JSXAttribute[name.name='className'] Literal[value=/(?:^|\\s)p[xlr]-0(?:\\s|$)/]",
		message:
			"no-input-zero-padding: a pill input with no side padding clips its first letters; use the Input `bare` variant (it owns the gutter) instead of px-0.",
	},
	{
		selector: "Literal[value=/\\b[wh]-\\[\\d+(?:\\.\\d+)?px\\]/]",
		message:
			"no-arbitrary-pixel-size: use a spacing/size token instead of an arbitrary pixel width or height.",
	},
	{
		selector: "TemplateElement[value.raw=/\\b[wh]-\\[\\d+(?:\\.\\d+)?px\\]/]",
		message:
			"no-arbitrary-pixel-size: use a spacing/size token instead of an arbitrary pixel width or height.",
	},
	{
		selector: "Literal[value=/focus-visible:ring-\\[3px\\]/]",
		message:
			"no-handrolled-focus-ring: compose the shared components/ui control instead of hand-copying the house focus ring.",
	},
	{
		selector: "TemplateElement[value.raw=/focus-visible:ring-\\[3px\\]/]",
		message:
			"no-handrolled-focus-ring: compose the shared components/ui control instead of hand-copying the house focus ring.",
	},
];

/** Shared flat config: TypeScript + React hooks/refresh, browser globals. */
export default tseslint.config(
	{ ignores: ["dist", "coverage", "worker-configuration.d.ts"] },
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			"react-refresh/only-export-components": [
				"warn",
				{ allowConstantExport: true },
			],
			"no-restricted-syntax": ["error", ...MOTION_AND_LAYER_CHECKS, ...CATCH_CHECKS],
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: [...UI_PRIMITIVE_EXEMPT_FILES, "**/*.test.ts", "**/*.test.tsx"],
		rules: {
			"no-restricted-syntax": ["error", ...MOTION_AND_LAYER_CHECKS, ...CATCH_CHECKS, ...UI_PRIMITIVE_CHECKS],
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: [...COLOR_EXEMPT_FILES, ...UI_PRIMITIVE_EXEMPT_FILES, "**/*.test.ts", "**/*.test.tsx"],
		rules: {
			"no-restricted-syntax": [
				"error",
				...MOTION_AND_LAYER_CHECKS,
				...CATCH_CHECKS,
				...UI_PRIMITIVE_CHECKS,
				...COLOR_CHECKS,
			],
		},
	},
);
