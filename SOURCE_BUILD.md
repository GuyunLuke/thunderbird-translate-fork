# Building the add-on from source

This add-on is written in TypeScript and built with esbuild. The submitted
`.xpi` is produced from the files in this source package as follows:

```bash
npm install          # installs pinned devDependencies from package-lock.json
npm run build:prod   # esbuild: bundles TypeScript modules + minifies JS into dist/
```

The build produces `dist/` containing the same files as the `.xpi`
(`manifest.json`, `src/**`, `_locales/**`). The `.xpi` is simply a zip of
`dist/`:

```bash
cd dist && zip -oX -r ../thunderbird-translate-fork.xpi *
```

What esbuild does during `build:prod`:

- compiles TypeScript (`src/**/*.ts`) to JavaScript
- bundles module imports (e.g. `src/i18n.ts`) into the entry scripts
  `src/background/background.js`, `src/banner/banner.js`,
  `src/options/options.js`
- minifies the output (production build)

HTML, CSS, locale files and the manifest are copied to `dist/` verbatim
(`scripts/build.ts`); no template engine is used.

All third-party runtime behavior is in the bundled DOMPurify-free code:
the banner inserts content via `textContent` only, and no runtime dependency
is loaded from the network. `package.json` dependencies are build-time only.
