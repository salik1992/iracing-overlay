import { createRequire } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// npm runs this with the widget package as the working directory.
const root = process.cwd();
const dist = join(root, "dist");
const require = createRequire(join(root, "package.json"));
const esbuild = await import(pathToFileURL(require.resolve("esbuild")).href);

await mkdir(dist, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src/main.ts")],
  outfile: join(dist, "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  legalComments: "none",
});

await esbuild.build({
  entryPoints: [join(root, "style.css")],
  outfile: join(dist, "style.css"),
  bundle: true,
  legalComments: "none",
  plugins: [
    {
      name: "keep-root-urls",
      setup(build) {
        build.onResolve({ filter: /^\// }, (args) => {
          if (args.kind !== "url-token") {
            return null;
          }
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

await copyFile(join(root, "index.html"), join(dist, "index.html"));

const css = await readFile(join(dist, "style.css"), "utf8");
if (!css.includes("/fonts/FiraCode-VF.woff2")) {
  throw new Error("bundled style.css is missing the font URL");
}
if (css.includes("@import")) {
  throw new Error("bundled style.css still has an @import");
}
