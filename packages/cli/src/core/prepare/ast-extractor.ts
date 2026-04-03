/**
 * AST Extractor for GWEN project metadata.
 * Uses ts-morph to analyze source code and extract components, systems, and scenes.
 */

import * as path from 'node:path';
import {
  Project,
  SyntaxKind,
  Node,
  type Block,
  type SourceFile,
  type PropertyAssignment,
  type CallExpression,
  type ArrowFunction,
  type FunctionExpression,
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
 * Result of project-wide metadata extraction.
 */
export interface ExtractedMetadata {
  /** Map of component name -> metadata */
  components: Map<string, ComponentMetadata>;
  /** Map of system name -> metadata */
  systems: Map<string, SystemMetadata>;
  /** Map of scene name -> metadata */
  scenes: Map<string, SceneMetadata>;
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
        const body = factory.getBody();
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
          schema = extractSchemaFromBlockBody(body);
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
 * Extracts the schema object from a block-body factory function by locating
 * the first `return { schema: ... }` statement.
 *
 * Supports both parenthesised and bare object return values:
 * ```ts
 * () => { return { schema: { hp: Types.f32 } } }
 * () => { return ({ schema: { hp: Types.f32 } }) }
 * ```
 *
 * @param block - Block statement AST node (the `{}` body of the factory)
 * @returns The parsed schema record, or `undefined` if no static schema is found
 *
 * @since 1.0.0
 */
function extractSchemaFromBlockBody(block: Block): Record<string, string> | undefined {
  const returnStatements = block.getDescendantsOfKind(SyntaxKind.ReturnStatement);

  for (const returnStatement of returnStatements) {
    let returnExpr = returnStatement.getExpression();
    if (!returnExpr) continue;

    // Unwrap optional parentheses: return ({ ... })
    if (Node.isParenthesizedExpression(returnExpr)) {
      returnExpr = returnExpr.getExpression();
    }

    if (Node.isObjectLiteralExpression(returnExpr)) {
      const schemaProp = returnExpr.getProperty('schema');
      if (Node.isPropertyAssignment(schemaProp)) {
        return extractSchemaFromAST(schemaProp);
      }
    }
  }

  return undefined;
}

/**
 * Extracts schema fields and types from a property assignment.
 *
 * @param schemaProp - The `schema` property assignment AST node
 * @returns Map of field name to type name string, or `undefined` if not an object literal
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
      let systems: string[] = [];
      const factory = args[1];
      if (factory && (Node.isArrowFunction(factory) || Node.isFunctionExpression(factory))) {
        systems = extractSystemsFromSceneFactory(factory);
      }
      scenes.set(name, {
        name,
        systems,
        filePath: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
      });
    }
  }
}

/**
 * Extracts system names from a `defineScene` factory body by detecting
 * `engine.use(SystemName)` call patterns.
 *
 * @param factoryNode - Arrow function or function expression AST node for the scene factory
 * @returns Array of system identifier names found in `engine.use()` calls
 *
 * @example
 * ```ts
 * // PlayerSystem and EnemySystem are now auto-discovered by gwen prepare
 * defineScene('Game', () => {
 *   engine.use(PlayerSystem)
 *   engine.use(EnemySystem)
 *   return { ... }
 * })
 * ```
 *
 * @since 1.0.0
 */
function extractSystemsFromSceneFactory(factoryNode: ArrowFunction | FunctionExpression): string[] {
  const systems: string[] = [];
  const useCalls = factoryNode.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const useCall of useCalls) {
    const expr = useCall.getExpression();

    // Match any_identifier.use(SystemName) pattern
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === 'use') {
      const useArgs = useCall.getArguments();
      if (useArgs.length > 0) {
        const argText = useArgs[0].getText().trim();
        if (argText.length > 0) {
          systems.push(argText);
        }
      }
    }
  }

  return systems;
}
