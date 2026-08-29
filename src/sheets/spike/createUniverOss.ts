/**
 * Thin OSS createUniver shim.
 *
 * Plan deviation: do NOT depend on `@univerjs/presets` — that meta-package
 * pulls `@univerjs-pro/*` via advanced/collaboration presets. This helper
 * mirrors the OSS createUniver surface using `@univerjs/core` only.
 */

import { LocaleType, LogLevel, Univer, mergeLocales } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';

export { LocaleType, mergeLocales };

/** Preset shape from `@univerjs/preset-sheets-core` (plugins may include nulls). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PresetLike = { plugins: any[] };

export type CreateUniverOssOptions = {
  locale: LocaleType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locales: Record<string, any>;
  presets: PresetLike[];
};

export function createUniverOss(options: CreateUniverOssOptions): {
  univer: Univer;
  univerAPI: ReturnType<typeof FUniver.newAPI>;
} {
  const univer = new Univer({
    locale: options.locale,
    locales: options.locales,
    logLevel: LogLevel.WARN,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pluginMap = new Map<string, { plugin: any; options?: unknown }>();

  for (const preset of options.presets) {
    for (const item of preset.plugins ?? []) {
      if (!item) continue;
      const [plugin, pluginOptions] = Array.isArray(item) ? item : [item];
      const name = plugin?.pluginName as string | undefined;
      if (!name) continue;
      pluginMap.set(name, { plugin, options: pluginOptions });
    }
  }

  for (const { plugin, options: pluginOptions } of pluginMap.values()) {
    univer.registerPlugin(plugin, pluginOptions);
  }

  return {
    univer,
    univerAPI: FUniver.newAPI(univer),
  };
}
