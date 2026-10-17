import { registerHooks } from "node:module";
// These tests run server modules in Node; Next normally supplies this marker alias.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === "server-only"
        ? "next/dist/compiled/server-only/empty.js"
        : specifier,
      context,
    );
  },
});
