import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * `next dev` rewrites next-env.d.ts to reference the e2e build directory; point it back at
 * .next so the developer's checkout and the regular typecheck stay untouched.
 */
export default function globalTeardown() {
  const file = path.resolve(__dirname, "../next-env.d.ts");
  const content = readFileSync(file, "utf8");
  const restored = content.replaceAll("./.next-e2e/types/", "./.next/types/");
  if (restored !== content) writeFileSync(file, restored);
}
