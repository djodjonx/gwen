import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'GWEN',
  description: 'Composable web game framework (Rust/WASM core + TypeScript DX)',
  cleanUrls: true,
  base: '/gwen/',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/quick-start' },
      { text: 'Core Concepts', link: '/core/components' },
      { text: 'API', link: '/api/helpers' },
      { text: 'GitHub', link: 'https://github.com/djodjonx/gwen' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'What is GWEN?', link: '/' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Project Structure', link: '/guide/project-structure' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Scenes', link: '/core/scenes' },
          { text: 'Components', link: '/core/components' },
          { text: 'Systems', link: '/core/systems' },
          { text: 'Prefabs', link: '/core/prefabs' },
          { text: 'UI Rendering', link: '/core/ui' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Helpers (define*)', link: '/api/helpers' },
          { text: 'Configuration', link: '/core/configuration' },
          { text: 'Engine API (api.*)', link: '/api/engine-api' },
          { text: 'CLI Commands', link: '/cli/commands' },
        ],
      },
      {
        text: 'Plugins',
        items: [
          { text: 'Official Plugins', link: '/plugins/official' },
          { text: 'Using & Creating Plugins', link: '/plugins/creating' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Space Shooter Walkthrough', link: '/examples/space-shooter' },
          { text: 'Common Patterns', link: '/examples/patterns' },
        ],
      },
      {
        text: 'Advanced',
        collapsed: true,
        items: [
          { text: 'Philosophy', link: '/guide/philosophy' },
          { text: 'Types Reference', link: '/api/types' },
          {
            text: 'WASM Plugins (Rust)',
            items: [
              { text: 'Guide & API Reference', link: '/plugins/wasm-plugins' },
              { text: 'Best Practices', link: '/plugins/wasm-plugin-best-practices' },
            ],
          },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/djodjonx/gwen' }],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/djodjonx/gwen/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MPL-2.0 License.',
      copyright: 'Copyright © 2026 Jonathan Moutier',
    },
  },
});
