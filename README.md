# Paperplate

A local-first, offline-friendly recipe book and meal planner for macOS. Paperplate scrapes recipes from any URL, lets you write your own from scratch, plans your week, and rolls everything into a tidy shopping list grouped by aisle.

No accounts. No cloud. No tracking. Your data lives in a SQLite file under `~/Library/Application Support/com.paperplate.app/` and never leaves your machine unless *you* export it.

> Status: pre-1.0. The app is fully functional but the file format and migrations may still change before the first tagged release.

---

## Install

### Pre-built `.dmg` (recommended)

1. Grab the latest `Paperplate_<version>_aarch64.dmg` from the [Releases](https://github.com/ShamgarBN/paperplate/releases) page.
2. Open the DMG and drag **Paperplate** into `Applications`.
3. Launch it. Because the binary is ad-hoc signed (not notarized), the first launch needs a one-time bypass:
   - Right-click `Paperplate.app` in `Applications` and choose **Open**, then click **Open** in the warning dialog.
   - Subsequent launches work normally from Spotlight, the Dock, or `open -a Paperplate`.

Apple Silicon only at the moment. An Intel build is straightforward to produce from source if you need one — see [Build from source](#build-from-source).

### Build from source

Requires Node.js 20+, Rust (stable, with the `aarch64-apple-darwin` toolchain), and Xcode Command Line Tools.

```bash
git clone git@github.com:ShamgarBN/paperplate.git
cd paperplate
npm install
npm run tauri:dev          # hot-reload dev session
# or
npm run tauri:build        # produces a signed .app and .dmg under src-tauri/target/
```

The packaged `.dmg` lands in `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`.

---

## Quick start

The first time you launch Paperplate, an onboarding dialog walks you through importing your first recipe. After that, here is the lay of the land.

### Left sidebar

| Section | Purpose |
| --- | --- |
| **Library** | Your full recipe collection, filterable by category, cuisine, difficulty, and "cooked recently". |
| **Plans** | Weekly/multi-week meal plans you've built or auto-filled. |
| **Shopping list** | A standalone, persistent shopping list for ad-hoc items and one-off recipe adds. |
| **Settings** | Categories, aisle assignments, export/import database, theme, and onboarding reset. |

### Top bar

Quick search across recipe titles, a "+ Add recipe" button, and the current page title.

---

## How to use it

### 1. Add a recipe

There are three ways:

**Scrape from a URL.** Click **+ Add recipe → From URL**, paste any recipe page (NYT Cooking, Serious Eats, Smitten Kitchen, food blogs, etc.) and click **Fetch**. Paperplate reads JSON-LD or microdata first, falls back to a generic HTML parser, and shows you a side-by-side draft editor. You can adjust the title, servings, image, ingredients (each row is structured into quantity + unit + name), steps, and categories before saving.

**Write it manually.** Click **+ Add recipe → Blank** and fill in the same draft editor.

**Drag-and-drop a hero image.** In either flow, drop any JPG/PNG/WebP/GIF/AVIF onto the dashed image panel in the top-right of the editor. The image is hashed and copied into the app's local cache (8 MB cap per image) — the original file is not modified.

After saving, the recipe appears in your Library. Source URL is preserved as a clickable link on the recipe detail page.

### 2. Browse and cook a recipe

Click any card in Library to open the recipe detail page. From there you can:

- **Scale servings** — either with the +/- stepper or the fractional preset buttons (1/4×, 1/3×, 1/2×, 1×, 2×, 3×). Ingredient quantities update in real time.
- **Mark as cooked today** — the **Cooked today** button records the date in your recipe history. Clicked by accident? The button immediately becomes **Undo cooked today** for the rest of the session, so you can reverse it.
- **Add to shopping list** — drops the recipe's scaled ingredients into the global shopping list without needing a meal plan.
- **Print** — opens the native macOS print dialog with a print-optimized layout (no nav, no buttons, just the recipe).
- **Edit** — opens the same draft editor you used to create it, complete with drag-and-drop image replacement.

### 3. Plan meals

1. Go to **Plans → + New plan**. The name is optional (it defaults to the date range, e.g. *"Mar 4 – Mar 10"*).
2. Pick a start and end date, and toggle whether to include breakfast and lunch slots in addition to dinner.
3. Drag recipes from the right-hand library panel onto calendar slots, or hit **Auto-fill** to let the planner do it.

#### Auto-fill rules

The planner uses a greedy heuristic with multiple restarts. It honors:

- **Hard rules** (will never be broken):
  - No recipe is used twice in the same ISO week.
  - No two consecutive slots (same day or +/- 1 day) share a cuisine.
  - Recipes you cooked in the last *N* days (configurable) are off-limits.
  - Locked slots stay put.
- **Soft preferences** (used to score remaining candidates):
  - At most two of any cuisine per week.
  - Cross-week variety — recipes used in earlier weeks get penalized so the planner reaches deeper into your library.

You can lock a slot (so re-running auto-fill keeps it), clear a slot, or override servings per slot independently of the recipe's base servings.

### 4. Shop

Two flavors:

**Per-plan shopping list.** From a meal plan, click **Shopping list** to open a consolidated list of every ingredient across every slot, grouped by aisle (Produce, Pantry, Dairy, etc.). Quantities are summed and rounded up to whole units where it makes sense. Check items off, copy the list to your clipboard, or print it.

**Global shopping list.** From the sidebar, **Shopping list** opens a standalone list that combines:
- Individual recipes you've added (via the "Add to shopping list" button on a recipe detail page).
- Free-form items you typed into the **Add item** form at the top.

Use this when you just need pantry staples or you want to grab ingredients for one recipe without spinning up a whole plan. Checked items can be cleared in bulk; recipes can be removed individually.

### 5. Manage categories and aisles

**Settings → Categories**: add, rename, or delete recipe categories (e.g. *Weeknight, Vegetarian, Holiday*). These are what you filter the library by.

**Settings → Aisles**: shopping list grouping is driven by an ingredient → aisle mapping. The first time Paperplate sees an unfamiliar ingredient name it makes a guess; you can correct it once and the change sticks across every future shopping list.

### 6. Back up and restore

**Settings → Data**:

- **Export database**: writes a single `.sqlite` file (plus a folder of any locally cached images) to a location you pick. Use this before a major change or when moving to a new Mac.
- **Import database**: restores from a previously exported `.sqlite` file. The current database is moved aside (not deleted) so you can roll back if something is wrong.

Transient data (per-plan shopping list checkmarks, global shopping list items older than 30 days) is automatically purged on launch so the database doesn't grow forever.

---

## Where your data lives

| What | Where |
| --- | --- |
| Recipes, plans, history, categories, aisles | `~/Library/Application Support/com.paperplate.app/paperplate.db` |
| Cached recipe hero images | `~/Library/Application Support/com.paperplate.app/images/` |
| Database exports you create | Wherever you choose to save them |

Nothing is uploaded anywhere. The only outbound network traffic is:
- When you ask Paperplate to scrape a recipe URL.
- When you tell it to download a hero image from a URL.

Both are user-initiated and request-only — no analytics, telemetry, or update pings.

---

## Tech stack

- **Frontend**: React 18, TypeScript, TanStack Router, TanStack Query, Zustand, Tailwind CSS, Radix UI primitives, Sonner (toasts), Framer Motion, dnd-kit.
- **Backend (in-process)**: Rust via Tauri 2, `tauri-plugin-sql` for SQLite access, `reqwest` for scraping, `sha2` for content-addressed image hashing.
- **Build tools**: Vite, Vitest, Prettier, TypeScript strict mode.
- **Database**: SQLite, managed via TypeScript migrations in `src/lib/db/migrations.ts`.

See `src-tauri/src/` for the Rust commands (`fetch_recipe_html`, `download_image`, `save_local_image`, `save_local_image_from_path`, `export_database`, `import_database`, `print_current_window`, …) and `src/lib/` for the TypeScript glue.

---

## Developing

```bash
npm install           # install JS deps
npm run tauri:dev     # launch the desktop app with hot reload
npm run test          # vitest, including the meal-planner heuristic specs
npm run typecheck     # strict TS, also run by CI before bundle
npm run tauri:build   # produce a release .app and .dmg
```

The Vite dev server runs on `http://localhost:1420`, and Tauri's dev runner attaches a WKWebView to it automatically. Hot reload works for the frontend; Rust changes require restarting `npm run tauri:dev`.

### Project layout

```
src/
├── components/    # Reusable UI (layout, plans, import, recipe, shopping, settings, ui primitives)
├── lib/
│   ├── db/        # Schema, migrations, repos, cleanup
│   ├── planner/   # Auto-fill heuristic + tests
│   ├── scraping/  # JSON-LD + microdata parsers, image download helpers
│   ├── shopping/  # Aggregation, unit normalization, aisle inference
│   └── ...
├── routes/        # TanStack Router route components
├── store/         # Zustand stores (library filters, settings)
└── styles/        # Tailwind globals + print styles
src-tauri/
├── src/
│   ├── commands/  # Tauri IPC handlers (scrape, backup, print)
│   ├── errors.rs  # AppError type, shared across commands
│   └── lib.rs     # invoke_handler registration + plugin setup
├── capabilities/  # Tauri 2 permission allowlists
└── tauri.conf.json
```

---

## Roadmap

- Per-recipe nutrition (manual entry now, scraped where available).
- Multi-day meal plan templates ("rotate this set of 5 plans").
- iCloud or git-based sync (opt-in, encrypted-at-rest).
- iOS companion for the shopping list.

Pull requests and issues are welcome — please open an issue first for anything beyond a small fix so we can sketch the approach together.

---

## License

TBD. Until a license file is added, all rights are reserved by the repository owner. If you want to use Paperplate in your own work, open an issue and we'll sort something out.
