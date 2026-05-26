# Paperplate

A two-device recipe book and meal planner: a Tauri-shelled Mac Silicon
desktop app and an installable iPad PWA, both backed by the same Supabase
project. Designed for a household — two signed-in users share one library,
one set of meal plans, one running shopping list. No accounts to share with
strangers, no cross-account RLS gymnastics.

> Status: 2.0.0 — first release with the Supabase backend + iPad PWA.
> 1.x was a local-first SQLite app; the migration to Supabase happened in
> May 2026 and is preserved in the git history if you want to compare.

---

## Where the apps live

| | URL / path |
|---|---|
| iPad PWA (and any browser) | https://shamgarbn.github.io/paperplate/ |
| macOS app | Latest `.dmg` from the [Releases page](https://github.com/ShamgarBN/paperplate/releases) |
| Supabase project | `syoyddsbqsoptpcheuvy` (private; URL + anon key are in app config) |

## Installing

### Mac

1. Grab `Paperplate_<version>_aarch64.dmg` from Releases.
2. Open the DMG, drag **Paperplate** into `Applications`.
3. First launch needs a one-time bypass because the app is ad-hoc signed
   (not notarized): right-click `Paperplate.app` → **Open** → click **Open**
   in the warning dialog. Subsequent launches work normally.

Apple Silicon only.

### iPad

1. Open https://shamgarbn.github.io/paperplate/ in **Safari** (not Chrome —
   only Safari's "Add to Home Screen" produces a standalone PWA on iOS).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. The Paperplate icon appears on the home screen; tap it to launch
   chrome-less, like a native app.

Updates are automatic: every push to `main` triggers a GitHub Action that
rebuilds the web bundle and republishes it. The PWA picks up the new
version on next launch.

## Signing in

Both apps sign in to the same Supabase project. You manage the household's
users in the Supabase dashboard:

1. https://supabase.com/dashboard/project/syoyddsbqsoptpcheuvy/auth/users
2. **Add user** → **Create new user** → check **Auto Confirm User** so the
   account works immediately (otherwise sign-in needs an email-confirmation
   round-trip).

Row-level security is "any authenticated user can do anything." There is
no per-user data partition — by design — so anyone signed in to the
household account sees the household library.

---

## What the app does

### Library

- Browse, search, filter by cuisine / protein / type / cooking method /
  dietary
- Recipe detail: scaled ingredient quantities (1/4× through 3× presets plus
  a +/- stepper), notes, source link, hero image
- Mark a recipe as cooked today so it influences the auto-fill heuristic
- Add a recipe to the shopping list with whatever scaled servings you've
  picked

### Adding recipes

- **From URL**: paste a recipe URL (food blogs, NYT Cooking, Serious Eats,
  King Arthur, Budget Bytes — anything with JSON-LD schema). The
  `scrape-recipe` Supabase Edge Function fetches the page server-side,
  extracts the recipe, and pre-fills the editor.
- **Manual**: blank form with add/remove rows for ingredients and steps.
- **Photo**: tap "Choose photo" to upload a hero image from the device
  (photo library on iPad, file picker or drag-drop on desktop). The image
  goes to the Supabase Storage `recipe-images` bucket; both apps display
  it from there.

### Plans

- Create a plan with a date range and a choice of meal slots
  (breakfast / lunch / dinner).
- Drop recipes into slots from the recipe picker.
- Lock a slot to protect it from the next auto-fill run.
- Add free-form notes per day.
- **Auto-fill**: picks recipes from the library to fill the unlocked
  slots. The heuristic enforces hard rules (no repeat in the same week,
  no two adjacent slots sharing a cuisine, nothing cooked in the last N
  days) and scores remaining candidates for cross-week variety. Same
  algorithm as the desktop's original 1.x app; lives in `packages/core`
  and ships to both clients.

### Shopping

- **Global list**: everything you've added directly + every recipe pushed
  from a meal plan.
- **Per-plan list**: ingredients across all the plan's recipes,
  aggregated. Push the plan's recipes onto the global list with one tap.
- Both lists group by aisle. The shared aggregator (in `packages/core`)
  merges quantities across recipes when their units agree (`1 cup + ½ cup
  → 1½ cup`), rounds up indivisible items, and converts to a friendly
  unit for display.
- Check items off; check state persists per device but syncs across
  devices through Supabase.
- Add free-form items (paper towels, etc.) directly to the global list.
- Print: opens a clean paper-friendly view (browser print on web, system
  print on macOS, AirPrint on iPad).

### Settings

- Manage categories per axis (cuisine / protein / type / cooking method /
  effort / tag / dietary).
- Manage aisles. "Other" is the fallback and protected from deletion;
  ingredient → aisle overrides survive renames.
- Sign out (rotates the session; the other household device stays signed
  in unless you sign out there too).

---

## Repository layout

```
paperplate/
├── apps/
│   ├── desktop/          # Tauri 2 + Vite + React. Mac Silicon target.
│   │   ├── src/          # Frontend (TanStack Router, React Query, Zustand)
│   │   └── src-tauri/    # Rust shell. Two surviving commands:
│   │                     #   fetch_recipe_html, print_current_window
│   └── mobile/           # Expo SDK 56 + React Native. PWA-targeted; can
│                         # also build native iOS later via EAS.
├── packages/
│   └── core/             # Shared TS: types (schema), planner heuristic
│                         # (autoSelect), shopping aggregator
│                         # (buildShoppingList), ingredient parser, unit
│                         # conversion, canonicalization.
├── scripts/              # One-shot ops scripts.
│   ├── import-from-sqlite.ts   # 1.x → 2.0 migration runner.
│   └── backfill-hero-images.ts # Re-fetch hero images from each
│                               # recipe's source_url.
└── supabase/
    ├── config.toml
    ├── migrations/       # Postgres schema + RLS + storage bucket setup.
    └── functions/
        └── scrape-recipe/    # Deno edge function. JSON-LD recipe
                              # extraction so neither app has to fight
                              # CORS.
```

## Developing

```bash
npm install                            # at the repo root; resolves all workspaces

# Desktop
npm run dev                            # Vite only (browser; data layer works)
npm run tauri:dev                      # full Tauri shell with hot reload
npm run tauri:build                    # produces a signed .app and .dmg
                                       # → apps/desktop/src-tauri/target/release/bundle/

# Mobile (Expo)
npm -w @paperplate/mobile run start    # interactive Expo CLI; Expo Go QR
npm -w @paperplate/mobile run web      # dev server in browser
npm -w @paperplate/mobile run build:web  # static PWA bundle → apps/mobile/dist/

# Quality gates
npm run typecheck                      # both apps + core
npm run test                           # 78 vitest specs in apps/desktop
```

### Supabase

Schema changes go through CLI migrations:

```bash
supabase migration new <description>   # creates supabase/migrations/<ts>_<description>.sql
# ... edit the SQL ...
supabase db push                       # apply to the linked remote project
```

The edge function deploys with:

```bash
supabase functions deploy scrape-recipe
```

The CLI is already linked to project `syoyddsbqsoptpcheuvy`; if you set
up a fresh clone, run `supabase link --project-ref syoyddsbqsoptpcheuvy`
once.

Secrets (project URL, anon key, service-role key) live in a gitignored
root `.env` — see the comments in that file for what each key is for.
The publishable / anon key is also hardcoded in the desktop and mobile
clients, which is fine because RLS keeps it harmless.

---

## Versioning

Semver. Both apps + Cargo.toml + tauri.conf.json share the same version
number — they ship as a single release.

- patch (`2.0.x`): bug fixes only
- minor (`2.x.0`): new features, backwards-compatible
- major (`x.0.0`): breaking changes (schema migration, auth flow, etc.)

When cutting a release:

1. Bump version in:
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/src-tauri/tauri.conf.json`
   - `apps/mobile/package.json`
   - `apps/mobile/app.json` (expo.version)
2. Run `npm run tauri:build` to produce the `.dmg`.
3. Push, then `git tag v<version> && git push origin v<version>`.
4. Create a GitHub Release with the `.dmg` attached and release notes
   summarizing the deltas.

The PWA auto-deploys on push to `main`, so no extra step there.

---

## License

TBD. Until a license file is added, all rights are reserved by the
repository owner. If you want to use Paperplate in your own work, open an
issue and we'll sort something out.
