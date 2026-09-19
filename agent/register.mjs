// Allow optional extensionless TypeScript imports in local development tools.
// The deployed agent does not import code from another repository.
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
