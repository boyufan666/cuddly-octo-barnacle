import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

const visibleSourceRoots = [
  "apps/web/src/app",
  "apps/web/src/components",
  "apps/web/src/features",
];

const oldTokenPattern =
  /--brand-primary|--brand-primary-strong|--brand-soft|--ink-primary|--ink-secondary|--ink-muted/;
const rawHexPattern = /#[0-9a-fA-F]{3,8}/;
const numericHexColorPattern = /0x[0-9a-fA-F]{3,8}/;
const oversizedRadiusPattern =
  /rounded-full|rounded-xl|rounded-2xl|rounded-3xl|rounded-\[(?:2[4-9]|[3-9][0-9])px\]/;
const glassPattern =
  /backdrop-blur|\b(?:bg|border|text)-white(?:\b|\/)|glassmorphism|\bglass\b/i;
const decorativePattern =
  /bg-\[linear-gradient|(?:linear|conic)-gradient\(|gradient-purple|\bbokeh\b|\borb\b/;
const translucentSurfacePattern = /bg-\[var\([^)\n]+\)\]\/[0-9]{1,3}/;
const oversizedTextPattern = /\b(?:text|sm:text|md:text|lg:text|xl:text|2xl:text)-[567]xl\b/;
const decorativeMotionPattern = /hover:-translate/;
const tailwindPalettePattern =
  /\b(?:bg|text|border|ring|accent|from|to|via|shadow)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[0-9]{2,3})?(?:\/[0-9]{1,3})?\b/;
const inlineRgbPalettePattern = /["'`]rgba?\(/;

test("global CSS exposes restrained design tokens without decorative gradients", async () => {
  const source = await readFile(join(rootDir, "apps/web/src/app/globals.css"), "utf8");
  for (const token of [
    "--surface-page",
    "--surface-paper",
    "--surface-panel",
    "--ink-strong",
    "--ink-soft",
    "--ink-subtle",
    "--accent-strong",
    "--accent-stronger",
    "--accent-soft",
    "--color-ink",
    "--color-surface",
    "--color-accent",
    "--surface-app",
    "--surface-muted",
    "--warning-strong",
    "--warning-soft",
    "--warning-line",
    "--danger-strong",
    "--danger-soft",
    "--danger-line",
    "--success-strong",
    "--success-soft",
    "--success-line",
    "--line-subtle",
    "--line-strong",
    "--radius-card",
    "--radius-control",
    "--shadow-panel",
    "--bottom-nav-height",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(token)), `missing design token: ${token}`);
  }
  assert.doesNotMatch(
    source,
    /orb|blob|bokeh|glass|gradient-purple|backdrop-blur-3xl/i,
    "global CSS must not introduce decorative background effects",
  );
  assert.doesNotMatch(
    source,
    /letter-spacing:\s*-/i,
    "global typography must not use negative letter spacing",
  );
  assert.doesNotMatch(source, oldTokenPattern, "global CSS must not keep old token aliases");
  assert.doesNotMatch(source, rawHexPattern, "global CSS must use non-hex token values");
  for (const alias of [
    "--background: var(--surface-page)",
    "--foreground: var(--ink-strong)",
    "--color-surface: var(--surface-page)",
    "--color-ink: var(--ink-strong)",
    "--color-accent: var(--accent-strong)",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(alias)), `global alias must use current semantic token: ${alias}`);
  }
});

test("visible web UI uses only the restrained tokenized visual language", async () => {
  const sources = await collectVisibleWebSources();

  for (const [path, source] of sources) {
    assert.doesNotMatch(source, oldTokenPattern, `old visual token alias found in ${path}`);
    assert.doesNotMatch(source, /GlassCard|GlassCardAlias/, `legacy glass component name found in ${path}`);
    assert.doesNotMatch(source, rawHexPattern, `raw hex color found in ${path}`);
    assert.doesNotMatch(source, numericHexColorPattern, `numeric hex color found in ${path}`);
    if (path !== "apps/web/src/app/globals.css") {
      assert.doesNotMatch(source, inlineRgbPalettePattern, `inline rgb color found in ${path}`);
    }
    assert.doesNotMatch(source, tailwindPalettePattern, `Tailwind palette utility found in ${path}`);
    assert.doesNotMatch(source, oversizedRadiusPattern, `oversized radius utility found in ${path}`);
    assert.doesNotMatch(source, glassPattern, `glass/white translucent utility found in ${path}`);
    assert.doesNotMatch(source, translucentSurfacePattern, `translucent surface utility found in ${path}`);
    assert.doesNotMatch(source, decorativePattern, `decorative gradient/orb language found in ${path}`);
    assert.doesNotMatch(source, oversizedTextPattern, `oversized text utility found in ${path}`);
    assert.doesNotMatch(source, decorativeMotionPattern, `decorative hover translation found in ${path}`);
    assert.doesNotMatch(
      source,
      /letter-spacing:\s*-|tracking-\[-/,
      `negative letter spacing found in ${path}`,
    );
  }
});

test("shared components support compact premium surfaces", async () => {
  const sources = [];

  for (const path of [
    "apps/web/src/components/ui/Button.tsx",
    "apps/web/src/components/ui/Card.tsx",
    "apps/web/src/components/ui/StatusBadge.tsx",
    "apps/web/src/components/ui/MetricTile.tsx",
    "apps/web/src/components/ui/EmptyState.tsx",
    "apps/web/src/components/ui/PageHeader.tsx",
  ]) {
    const source = await readFile(join(rootDir, path), "utf8");
    sources.push([path, source]);

    assert.doesNotMatch(
      source,
      /rounded-full|rounded-\[2[4-9]px\]|rounded-3xl/i,
      `component must use compact radius tokens: ${path}`,
    );
    assert.doesNotMatch(
      source,
      /backdrop-blur|glassmorphism|orb|blob|bokeh/i,
      `component must avoid decorative glass/background effects: ${path}`,
    );
  }

  for (const [path, source] of sources) {
    assert.doesNotMatch(
      source,
      /#[0-9a-fA-F]{3,8}/,
      `shared primitive must use semantic CSS variables instead of raw hex colors: ${path}`,
    );
    assert.doesNotMatch(
      source,
      /rounded-2xl|rounded-3xl|backdrop-blur/i,
      `shared primitive must avoid large decorative primitive styles: ${path}`,
    );
    assert.doesNotMatch(
      source,
      oldTokenPattern,
      `shared primitive must use current semantic token names: ${path}`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:bg|text|border)-white(?:\b|\/)/,
      `shared primitive must avoid raw Tailwind white utilities: ${path}`,
    );
  }
});

test("dynamic patient-facing text wraps in dense patient surfaces", async () => {
  const assessmentSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/AssessmentDialoguePage.tsx"),
    "utf8",
  );
  const todaySource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TodayTrainingPage.tsx"),
    "utf8",
  );
  const prepSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingPrepChecklist.tsx"),
    "utf8",
  );
  const taskPickerSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingTaskPicker.tsx"),
    "utf8",
  );
  const resultSource = await readFile(
    join(rootDir, "apps/web/src/features/patient/TrainingResultPage.tsx"),
    "utf8",
  );

  assert.match(
    assessmentSource,
    /<h3 className="[^"]*break-words[^"]*"[^>]*>\s*\{questionPrompt\}/,
    "assessment prompt heading must wrap long dynamic prompt text",
  );
  assert.doesNotMatch(
    assessmentSource,
    /<input[\s\S]{0,160}type="checkbox"[\s\S]{0,260}\{choice\.label\}/,
    "physical-condition choices must not render unbound interactive checkboxes",
  );
  assert.match(
    todaySource,
    /<h3 className="[^"]*break-words[^"]*"[^>]*>\s*\{focusTask \? focusTask\.gameContent\.name/,
    "today next-task title must wrap long game names",
  );
  assert.match(
    prepSource,
    /<h3 className="[^"]*break-words[^"]*"[^>]*>\s*\{planItem\?\.gameContent\.name/,
    "training preparation title must wrap long game names",
  );
  assert.match(
    taskPickerSource,
    /<span className="[^"]*break-words[^"]*"[^>]*>\s*\{task\.gameContent\.name\}/,
    "training picker task title must wrap long game names",
  );
  assert.match(
    resultSource,
    /<h3 className="[^"]*break-words[^"]*"[^>]*>\s*\{latest\.gameContent\.name\}/,
    "training result title must wrap long game names",
  );
  assert.match(
    resultSource,
    /<p className="[^"]*break-words[^"]*"[^>]*>\{value\}<\/p>/,
    "training result fact values must wrap long dynamic values",
  );
});

test("button primitive keeps role-neutral actions compatible", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/components/ui/Button.tsx"),
    "utf8",
  );

  assert.match(source, /focus-visible:/, "button must expose keyboard focus-visible styles");
  assert.match(source, /rounded-\[var\(--radius-control\)\]/, "button must use compact control radius token");
  assert.doesNotMatch(source, /shadow-\[0_18px|rounded-\[22px\]/);
  assert.doesNotMatch(
    source,
    /shadow-\[var\(--shadow-panel\)\]/,
    "button must not use the panel shadow as a default action style",
  );
  for (const intent of ["primary", "secondary", "danger", "quiet"]) {
    assert.match(source, new RegExp(`["']${intent}["']`), `missing button intent: ${intent}`);
  }
  for (const size of ["sm", "md", "lg"]) {
    assert.match(source, new RegExp(`["']${size}["']`), `missing button size: ${size}`);
  }
  assert.match(source, /type = "button"/, "button must preserve default type=button");
  assert.match(source, /disabled=\{disabled \|\| isLoading\}/, "button must disable during loading");
  assert.match(source, /aria-busy=\{isLoading \|\| undefined\}/, "button must expose busy state");
  assert.match(source, /isLoading \? "处理中\.\.\." : children/, "button must keep loading label behavior");
  assert.match(source, /min-w-\[/, "button must reserve stable horizontal space during loading");
  assert.match(source, /break-words/, "button label must wrap safely inside narrow containers");
});

test("card badge and metric primitives keep existing public variants", async () => {
  const cardSource = await readFile(
    join(rootDir, "apps/web/src/components/ui/Card.tsx"),
    "utf8",
  );
  const badgeSource = await readFile(
    join(rootDir, "apps/web/src/components/ui/StatusBadge.tsx"),
    "utf8",
  );
  const metricSource = await readFile(
    join(rootDir, "apps/web/src/components/ui/MetricTile.tsx"),
    "utf8",
  );

  for (const tone of ["patient", "workbench", "governance", "plain"]) {
    assert.match(cardSource, new RegExp(`["']${tone}["']`), `missing card tone: ${tone}`);
  }
  assert.match(cardSource, /rounded-\[var\(--radius-card\)\]/, "card must use compact radius token");
  assert.doesNotMatch(
    cardSource,
    /shadow-\[var\(--shadow-panel\)\]/,
    "card must be a flat bordered panel by default",
  );

  for (const status of ["ready", "pending", "blocked", "complete", "review"]) {
    assert.match(badgeSource, new RegExp(`["']${status}["']`), `missing status badge state: ${status}`);
  }
  assert.match(badgeSource, /rounded-\[var\(--radius-control\)\]/, "status badge must use compact control radius");
  assert.match(badgeSource, /min-h-8/, "status badge must keep a stable compact height");
  assert.match(badgeSource, /max-w-full/, "status badge must not overflow narrow containers");
  assert.match(badgeSource, /items-center/, "status badge must vertically center variable labels");
  assert.match(badgeSource, /break-words/, "status badge must wrap long labels safely");

  for (const prop of ["className?: string", "dark?: boolean", "helper?: string", "icon?:"]) {
    assert.match(metricSource, new RegExp(escapeRegExp(prop)), `missing metric prop: ${prop}`);
  }
  assert.match(metricSource, /aria-hidden="true"/, "metric icon must be hidden from assistive tech");
  assert.match(metricSource, /min-h-\[/, "metric tile must reserve stable vertical space");
  assert.match(metricSource, /min-w-0/, "metric tile must allow responsive shrinking without overflow");
  assert.match(metricSource, /break-words/, "metric values must wrap safely inside the tile");
  assert.match(
    metricSource,
    /text-sm font-bold[^"]*break-words|break-words[^"]*text-sm font-bold/,
    "metric labels must wrap safely inside the tile",
  );
  assert.match(
    metricSource,
    /text-xs font-bold[^"]*break-words|break-words[^"]*text-xs font-bold/,
    "metric helper text must wrap safely inside the tile",
  );
});

test("empty and page header primitives expose semantic structure", async () => {
  const emptySource = await readFile(
    join(rootDir, "apps/web/src/components/ui/EmptyState.tsx"),
    "utf8",
  );
  const headerSource = await readFile(
    join(rootDir, "apps/web/src/components/ui/PageHeader.tsx"),
    "utf8",
  );

  for (const prop of ["title", "description", "action"]) {
    assert.match(emptySource, new RegExp(`\\b${prop}\\b`), `missing empty state prop: ${prop}`);
  }
  assert.match(emptySource, /<section/, "empty state must render a semantic section");
  assert.match(emptySource, /<h2 className="[^"]*break-words/, "empty state title must wrap long text");
  assert.match(emptySource, /<p className="[^"]*break-words/, "empty state description must wrap long text");

  for (const prop of ["eyebrow", "title", "description", "action"]) {
    assert.match(headerSource, new RegExp(`\\b${prop}\\b`), `missing page header prop: ${prop}`);
  }
  assert.match(headerSource, /<header/, "page header must render a semantic header");
  assert.match(headerSource, /<h1/, "page header title must use h1");
  assert.match(headerSource, /break-words/, "page header title and description must wrap long text");
  assert.match(headerSource, /flex-wrap items-center justify-end gap-2/, "page header action row must stay stable when actions wrap");
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function collectVisibleWebSources() {
  const results = [];
  for (const root of visibleSourceRoots) {
    await collectSourcesFromDirectory(join(rootDir, root), results);
  }
  return results;
}

async function collectSourcesFromDirectory(directory, results) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSourcesFromDirectory(absolutePath, results);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.includes(".test.")) continue;
    const extension = extname(entry.name);
    if (extension !== ".tsx" && extension !== ".css") continue;

    const relativePath = relative(rootDir, absolutePath);
    const source = await readFile(absolutePath, "utf8");
    results.push([relativePath, source]);
  }
}
