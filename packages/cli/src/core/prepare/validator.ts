/**
 * Validation logic for GWEN project metadata.
 * Detects missing references and provides suggestions for typos.
 */

import { type ExtractedMetadata } from './ast-extractor.js';

/**
 * A validation error or warning.
 */
export interface ValidationError {
  /** Severity level */
  severity: 'error' | 'warning';
  /** Human-readable error message */
  message: string;
  /** File where the error was detected */
  file: string;
  /** Line number where the error was detected */
  line?: number;
  /** Optional suggestion for fixing the error */
  suggestion?: string;
}

/**
 * Validates extracted project metadata for consistency and correctness.
 *
 * @param metadata - Extracted metadata to validate
 * @returns Array of validation errors and warnings
 */
export function validateMetadata(metadata: ExtractedMetadata): ValidationError[] {
  const errors: ValidationError[] = [];

  const componentNames = Array.from(metadata.components.keys());

  // Check: components used in systems are defined
  for (const [systemName, system] of metadata.systems) {
    for (const required of system.requiredComponents) {
      // If 'required' is a variable name, we try to match it against component names.
      // This is an approximation because the AST extractor currently gets variable names from api.query().
      if (!metadata.components.has(required)) {
        const suggestion = findSimilar(required, componentNames);

        // We only report as error if we are reasonably sure it's a component reference
        // In GWEN, components are usually PascalCase.
        if (/^[A-Z]/.test(required)) {
          errors.push({
            severity: 'error',
            message: `Component "${required}" used in system "${systemName}" but never defined via defineComponent().`,
            file: system.filePath,
            line: system.line,
            suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Finds the most similar string from a list of candidates using Levenshtein distance.
 */
function findSimilar(target: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;

  let bestMatch: string | undefined;
  let minDistance = 3; // Maximum distance to consider

  for (const candidate of candidates) {
    const distance = levenshtein(target.toLowerCase(), candidate.toLowerCase());
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Computes the Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return tmp[a.length][b.length];
}
