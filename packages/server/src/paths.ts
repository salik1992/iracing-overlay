import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));

/** packages/server, whether this file is loaded from src or a future dist. */
export const serverPackageRoot = join(sourceDir, "..");

export const packagesRoot = join(serverPackageRoot, "..");

export const fixturePath = join(serverPackageRoot, "fixtures", "demo.json");

export const fontRoute = "/fonts/FiraCode-VF.woff2";

export const fontPath = join(packagesRoot, "shared", "fonts", "FiraCode-VF.woff2");
