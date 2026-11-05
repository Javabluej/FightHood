import * as module from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
if (module.registerHooks) {
  module.registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context);
      return next(specifier, context);
    },
    load(url, context, next) {
      if (!url.endsWith('.ts')) return next(url, context);
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText };
    },
  });
} else {
  module.register('./ts-loader.mjs', import.meta.url);
}
