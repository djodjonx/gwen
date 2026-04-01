/**
 * config-writer — utility for appending modules to gwen.config.ts
 *
 * Reads the project's gwen.config.ts, checks whether a module is already
 * registered, and if not inserts it into the `modules` array.
 *
 * @example
 * ```typescript
 * await appendModuleToConfig('@gwenengine/physics')
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Options for the config-writer utility.
 */
export interface ConfigWriterOptions {
  /**
   * Absolute path to gwen.config.ts.
   * @default process.cwd() + '/gwen.config.ts'
   */
  configPath?: string;
}

/**
 * Appends a module entry to the `modules` array in gwen.config.ts.
 *
 * Idempotent: if the module is already present, does nothing.
 * Writes the file atomically by writing to a temp path then renaming.
 *
 * @param moduleName - The npm package name of the module to register.
 * @param options    - Optional overrides (e.g. custom configPath).
 * @throws If the config file cannot be read or if the `modules: [` marker is
 *         not found in the file.
 */
export async function appendModuleToConfig(
  moduleName: string,
  options: ConfigWriterOptions = {},
): Promise<void> {
  const configPath = options.configPath ?? path.join(process.cwd(), 'gwen.config.ts');

  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch {
    throw new Error(`[GWEN:ConfigWriter] Could not read config file at ${configPath}`);
  }

  // Idempotency check — bail out early if the module is already listed.
  if (content.includes(moduleName)) {
    return;
  }

  // Find the `modules: [` marker and insert the new entry before the closing `]`.
  const marker = /modules\s*:\s*\[/;
  const match = marker.exec(content);
  if (!match) {
    throw new Error(`[GWEN:ConfigWriter] Could not find 'modules: [' in ${configPath}`);
  }

  const insertionPoint = match.index + match[0].length;
  const before = content.slice(0, insertionPoint);
  const after = content.slice(insertionPoint);

  // Determine indentation from the existing content (default 2 spaces).
  const indentMatch = /\n(\s+)/.exec(after);
  const indent = indentMatch ? indentMatch[1] : '  ';

  // If the array already has entries separate with a comma, otherwise just add the entry.
  const trimmedAfter = after.trimStart();
  const separator = trimmedAfter.startsWith(']') ? `\n${indent}` : `\n${indent}`;
  const entry = `${separator}'${moduleName}',`;

  const newContent = before + entry + after;

  // Atomic write: write to a sibling temp file then rename.
  const tmpPath = `${configPath}.tmp`;
  await fs.writeFile(tmpPath, newContent, 'utf8');
  await fs.rename(tmpPath, configPath);
}
