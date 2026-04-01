/**
 * HTML generation for GWEN projects
 * Generates virtual index.html with project metadata
 */

import * as path from 'node:path';

/**
 * Generate virtual index.html content
 */
export function generateIndexHtml(
  projectDir: string,
  options: { title?: string; background?: string },
): string {
  const title = options.title ?? path.basename(projectDir);
  const bg = options.background ?? '#000';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${bg};
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <script type="module" src="/@gwenengine/gwen-entry"></script>
</body>
</html>`;
}
