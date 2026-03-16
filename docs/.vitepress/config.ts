import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'GWEN',
  description: 'Composable web game framework (Rust/WASM core + TypeScript DX)',
  cleanUrls: true,
  base: '/gwen/',

  themeConfig: {
    nav: [
      { text: 'Get Started', link: '/guide/quick-start' },
      { text: 'Core Concepts', link: '/core/components' },
      { text: 'API', link: '/api/overview' },
      { text: 'CLI', link: '/cli/commands' },
      { text: 'GitHub', link: 'https://github.com/djodjonx/gwen' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is GWEN?', link: '/' },
          { text: 'Philosophy', link: '/guide/philosophy' },
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
          { text: 'Configuration', link: '/core/configuration' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Overview', link: '/api/overview' },
          { text: 'Helpers (define*)', link: '/api/helpers' },
          { text: 'Engine API (api.*)', link: '/api/engine-api' },
          { text: 'Types', link: '/api/types' },
        ],
      },
      {
        text: 'CLI',
        items: [
          { text: 'Commands', link: '/cli/commands' },
          { text: 'CLI Guide', link: '/CLI' },
        ],
      },
      {
        text: 'Plugins',
        items: [
          { text: 'Official Plugins', link: '/plugins/official' },
          { text: 'Using & Creating Plugins', link: '/plugins/creating' },
          { text: 'Input Mapping', link: '/plugins/input-mapping' },
          { text: 'Kit Platformer', link: '/plugins/kit-platformer' },
          { text: 'Kit Platformer — Advanced', link: '/plugins/kit-platformer-advanced' },
          { text: 'Plugin Hooks Guide', link: '/PLUGIN_HOOKS_GUIDE' },
          { text: 'WASM Plugins', link: '/plugins/wasm-plugins' },
          { text: 'WASM Best Practices', link: '/plugins/wasm-plugin-best-practices' },
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
        text: 'Troubleshooting',
        items: [{ text: 'Troubleshooting', link: '/TROUBLESHOOTING' }],
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
