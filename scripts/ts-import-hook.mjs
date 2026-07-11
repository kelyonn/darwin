// Zero-dependency resolver so Node's native --experimental-strip-types can run
// the source tree directly: our modules import each other with ".js" specifiers
// (required by the Vite/browser ESM build), but the files on disk are ".ts".
// This hook rewrites a relative ".js" import to ".ts" when the .ts file exists.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath } from "node:url";
      export async function resolve(specifier, context, nextResolve) {
        if (specifier.startsWith(".") && specifier.endsWith(".js")) {
          const ts = specifier.slice(0, -3) + ".ts";
          try {
            const resolved = await nextResolve(ts, context);
            if (resolved?.url && existsSync(fileURLToPath(resolved.url))) return resolved;
          } catch {}
        }
        return nextResolve(specifier, context);
      }
    `),
  import.meta.url,
);
