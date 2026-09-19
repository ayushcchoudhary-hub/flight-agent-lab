// Resolve the reference repo's extensionless TS imports without copying or
// altering its source. Node 24 strips types; workspace dependencies stay there.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.ts')) {
        return nextResolve(url.href + '.ts', context);
      }
    }
    return nextResolve(specifier, context);
  },
});
