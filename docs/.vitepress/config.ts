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
        text: 'Introduction',
        items: [
          { text: 'What is GWEN?', link: '/' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Philosophy', link: '/guide/philosophy' },
          { text: 'Project Structure', link: '/guide/project-structure' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Components', link: '/core/components' },
          { text: 'Scenes', link: '/core/scenes' },
          { text: 'Systems', link: '/core/systems' },
          { text: 'Prefabs', link: '/core/prefabs' },
          { text: 'UI Rendering', link: '/core/ui' },
          { text: 'Configuration', link: '/core/configuration' },
        ],
      },
      {
        text: 'Plugins',
        items: [
          { text: 'Official Plugins', link: '/plugins/official' },
          { text: 'Creating Plugins', link: '/plugins/creating' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Helpers (define*)', link: '/api/helpers' },
          { text: 'Engine API', link: '/api/engine-api' },
          { text: 'Types', link: '/api/types' },
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
        text: 'CLI',
        items: [{ text: 'Commands', link: '/cli/commands' }],
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
