import { rm } from "node:fs/promises";
import copy from "cpy";
import esbuild from "esbuild";

const outBase = "dist";

const isProd = process.env.NODE_ENV === "prod";

async function main() {
    // entries key is emitted path (without .js) relative to project root
    const entries = {
        "src/background/background": "src/background/background.ts",
        "src/background/bannerRegister": "src/background/bannerRegister.ts",
        "src/banner/banner": "src/banner/banner.ts",
        "src/options/options": "src/options/options.ts",
    };

    // clean output
    await rm(outBase, { recursive: true, force: true });

    // bundle entries
    await esbuild.build({
        entryPoints: entries,
        outdir: outBase,
        bundle: true,
        platform: "browser",
        format: "iife",
        target: ["es2019"],
        sourcemap: isProd ? false : "external", // DEV: generate external .map files
        minify: isProd, // DEV: no minify for readable stack traces
        legalComments: "none",
    });

    if (!isProd) {
        console.log("esbuild metafile summary available");
    }

    // copy static assets (manifest,  css, html, assets, _locales)
    const staticAssets = [
        "manifest.json",
        "src/banner/banner.css",
        "src/options/options.css",
        "src/options/options.html",
        "src/assets",
        "_locales",
    ];
    await copy(staticAssets, outBase, { cwd: "." });

    console.log(
        `Build complete: ${outBase}/ ready for web-ext (${process.env.NODE_ENV})`,
    );
}

main();
