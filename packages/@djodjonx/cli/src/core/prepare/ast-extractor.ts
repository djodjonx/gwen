/**
 * AST Extractor for GWEN project metadata.
 * Uses ts-morph to analyze source code and extract components, systems, and scenes.
 */

import * as path from 'node:path';
import {
  Project,
  SyntaxKind,
  Node,
  type SourceFile,
  type PropertyAssignment,
  type CallExpression,
} from 'ts-morph';
import { logger } from '../../utils/logger.js';

/**
 * Metadata for an extracted component.
 */
export interface ComponentMetadata {
  /** Component unique name */
  name: string;
  /** Schema definition: fieldName -> type name (e.g. 'f32') */
  schema: Record<string, string>;
  /** Absolute path to the source file */
  filePath: string;
  /** Line number in the source file */
  line: number;
}

/**
 * Metadata for an extracted system.
 */
export interface SystemMetadata {
  /** System name */
  name: string;
  /** Names of components required by this system (extracted from api.query) */
  requiredComponents: string[];
  /** Absolute path to the source file */
  filePath: string;
  /** Line number in the source file */
  line: number;
}

/**
 * Metadata for an extracted scene.
 */
export interface SceneMetadata {
  /** Scene name */
  name: string;
  /** Names of systems used in this scene */
  systems: string[];
  /** Absolute path to the source file */
  filePath: string;
  /** Line number in the source file */
  line: number;
}

/**
 * Metadata for a service provided by a plugin.
 */
export interface ServiceMetadata {
  /** Service name */
  name: string;
  /** Module path to import from */
  from: string;
  /** Export name in the module */
  exportName: string;
}

/**
 * Result of project-wide metadata extraction.
 */
export interface ExtractedMetadata {
  /** Map of component name -> metadata */
  components: Map<string, ComponentMetadata>;
  /** Map of system name -> metadata */
  systems: Map<string, SystemMetadata>;
  /** Map of scene name -> metadata */
  scenes: Map<string, SceneMetadata>;
  /** Map of service name -> metadata */
  pluginServices: Map<string, ServiceMetadata>;
}

/**
 * Extracts metadata from a GWEN project by analyzing its TypeScript source code.
 *
 * @param rootDir - Project root directory (containing tsconfig.json)
 * @returns Extracted metadata for components, systems, and scenes
 */
export function extractProjectMetadata(rootDir: string): ExtractedMetadata {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  });

  const metadata: ExtractedMetadata = {
    components: new Map(),
    systems: new Map(),
    scenes: new Map(),
    pluginServices: new Map(),
  };

  logger.debug(`Extracting metadata from ${rootDir}...`);

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Ignore node_modules and generated files
    if (filePath.includes('/node_modules/') || filePath.includes('/.gwen/')) {
      continue;
    }

    extractComponents(sourceFile, metadata.components);
    extractSystems(sourceFile, metadata.systems);
    extractScenes(sourceFile, metadata.scenes);
  }

  // TODO: Extract plugin services from gwen.config.ts
  extractPluginServicesFromConfig(project, rootDir, metadata.pluginServices);

  return metadata;
}

/**
 * Finds all defineComponent calls and extracts their metadata.
 */
function extractComponents(
  sourceFile: SourceFile,
  components: Map<string, ComponentMetadata>,
): void {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expression = call.getExpression();
    if (expression.getText() !== 'defineComponent') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    let name: string | undefined;
    let schema: Record<string, string> | undefined;

    const firstArg = args[0];

    if (Node.isObjectLiteralExpression(firstArg)) {
      // Form 1: defineComponent({ name: '...', schema: { ... } })
      const nameProp = firstArg.getProperty('name');
      if (Node.isPropertyAssignment(nameProp)) {
        name = nameProp.getInitializer()?.getText().replace(/['"`]/g, '');
      }

      const schemaProp = firstArg.getProperty('schema');
      if (Node.isPropertyAssignment(schemaProp)) {
        schema = extractSchemaFromAST(schemaProp);
      }
    } else if (Node.isStringLiteral(firstArg)) {
      // Form 2: defineComponent('name', () => ({ schema: { ... } }))
      name = firstArg.getLiteralText();
      const factory = args[1];
      if (factory && (Node.isArrowFunction(factory) || Node.isFunctionExpression(factory))) {
        const body = (factory as any).getBody();
        let obj = body;
        if (Node.isParenthesizedExpression(obj)) {
          obj = obj.getExpression();
        }

        if (Node.isObjectLiteralExpression(obj)) {
          const schemaProp = obj.getProperty('schema');
          if (Node.isPropertyAssignment(schemaProp)) {
            schema = extractSchemaFromAST(schemaProp);
          }
        } else if (Node.isBlock(body)) {
          // TODO: handle return { schema: ... } in block
        }
      }
    }

    if (name && schema) {
      components.set(name, {
        name,
        schema,
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
      });
    }
  }
}

/**
 * Extracts schema fields and types from a property assignment.
 */
function extractSchemaFromAST(schemaProp: PropertyAssignment): Record<string, string> | undefined {
  const initializer = schemaProp.getInitializer();
  if (!Node.isObjectLiteralExpression(initializer)) return undefined;

  const schema: Record<string, string> = {};
  for (const prop of initializer.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const fieldName = prop.getName();
      const value = prop.getInitializer()?.getText();
      if (value) {
        // Simple heuristic for Types.xxx
        const match = value.match(/Types\.(\w+)/);
        if (match) {
          schema[fieldName] = match[1];
        } else {
          schema[fieldName] = 'unknown';
        }
      }
    }
  }
  return schema;
}

/**
 * Finds all defineSystem calls and extracts their metadata.
 */
function extractSystems(sourceFile: SourceFile, systems: Map<string, SystemMetadata>): void {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expression = call.getExpression();
    if (expression.getText() !== 'defineSystem') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    let name: string | undefined;
    const firstArg = args[0];

    if (Node.isStringLiteral(firstArg)) {
      name = firstArg.getLiteralText();
    } else if (Node.isObjectLiteralExpression(firstArg)) {
      const nameProp = firstArg.getProperty('name');
      if (Node.isPropertyAssignment(nameProp)) {
        name = nameProp.getInitializer()?.getText().replace(/['"`]/g, '');
      }
    }

    if (name) {
      const requiredComponents = extractRequiredComponents(call);
      systems.set(name, {
        name,
        requiredComponents,
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
      });
    }
  }
}

/**
 * Heuristic to find required components by looking for api.query([...]) calls.
 */
function extractRequiredComponents(call: CallExpression): string[] {
  const components = new Set<string>();

  // Look for api.query([...]) inside the system definition
  const queries = call
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c: CallExpression) => {
      const text = c.getExpression().getText();
      return text === 'api.query' || text.endsWith('.query');
    });

  for (const queryCall of queries) {
    const qArgs = queryCall.getArguments();
    if (qArgs.length > 0 && Node.isArrayLiteralExpression(qArgs[0])) {
      const array = qArgs[0];
      for (const element of array.getElements()) {
        const text = element.getText();
        // This is a bit naive as it gets the variable name, not the component name.
        // But for most cases it will match if the variable name matches the component name.
        // Better: use type checker to find the name property of the component definition.
        components.add(text);
      }
    }
  }

  return Array.from(components);
}

/**
 * Finds all defineScene calls and extracts their metadata.
 */
function extractScenes(sourceFile: SourceFile, scenes: Map<string, SceneMetadata>): void {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expression = call.getExpression();
    if (expression.getText() !== 'defineScene') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    let name: string | undefined;
    const firstArg = args[0];

    if (Node.isStringLiteral(firstArg)) {
      name = firstArg.getLiteralText();
    } else if (Node.isObjectLiteralExpression(firstArg)) {
      const nameProp = firstArg.getProperty('name');
      if (Node.isPropertyAssignment(nameProp)) {
        name = nameProp.getInitializer()?.getText().replace(/['"`]/g, '');
      }
    }

    if (name) {
      // TODO: extract systems from defineScene body
      scenes.set(name, {
        name,
        systems: [],
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
      });
    }
  }
}

/**
 * Extracts plugin services from gwen.config.ts and definePlugin calls.
 */
function extractPluginServicesFromConfig(
  project: Project,
  _rootDir: string,
  services: Map<string, ServiceMetadata>,
): void {
  // Find gwen.config.ts
  const hasConfig = project
    .getSourceFiles()
    .some((f: SourceFile) => f.getBaseName().startsWith('gwen.config.'));

  if (!hasConfig) {
    return;
  }

  // Extract definePlugin calls if they are in the config or imported
  // For now, let's look for definePlugin calls across all project files
  for (const sourceFile of project.getSourceFiles()) {
    sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((c: CallExpression) => c.getExpression().getText() === 'definePlugin')
      .forEach((call: CallExpression) => {
        const arg = call.getArguments()[0];
        if (Node.isObjectLiteralExpression(arg)) {
          const providesProp = arg.getProperty('provides');
          if (Node.isPropertyAssignment(providesProp)) {
            const initializer = providesProp.getInitializer();
            if (Node.isObjectLiteralExpression(initializer)) {
              for (const prop of initializer.getProperties()) {
                if (Node.isPropertyAssignment(prop)) {
                  const serviceName = prop.getName();
                  const val = prop.getInitializer();
                  if (Node.isObjectLiteralExpression(val)) {
                    const from = val
                      .getProperty('from')
                      ?.asKind(SyntaxKind.PropertyAssignment)
                      ?.getInitializer()
                      ?.getText()
                      .replace(/['"`]/g, '');
                    const exportName = val
                      .getProperty('exportName')
                      ?.asKind(SyntaxKind.PropertyAssignment)
                      ?.getInitializer()
                      ?.getText()
                      .replace(/['"`]/g, '');
                    if (from && exportName) {
                      services.set(serviceName, { name: serviceName, from, exportName });
                    }
                  }
                }
              }
            }
          }
        }
      });
  }
}
