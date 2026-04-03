import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'GWEN',
  description: 'Composable web game framework — TypeScript DX, Rust/WASM performance.',
  cleanUrls: true,
  base: '/gwen/',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/what-is-gwen' },
      { text: 'Core', link: '/core/architecture' },
      { text: 'API', link: '/api/overview' },
      { text: 'Plugins', link: '/plugins/index' },
      { text: 'Kit', link: '/kit/overview' },
      { text: 'GitHub', link: 'https://github.com/djodjonx/gwen' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is GWEN?', link: '/guide/what-is-gwen' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Project Structure', link: '/guide/project-structure' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Architecture', link: '/core/architecture' },
          { text: 'Engine Context', link: '/core/context' },
          { text: 'Components', link: '/core/components' },
          { text: 'Systems', link: '/core/systems' },
          { text: 'Prefabs', link: '/core/prefabs' },
          { text: 'Scenes', link: '/core/scenes' },
          { text: 'Layouts', link: '/guide/layouts' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Overview', link: '/config/overview' },
          { text: 'Modules & WASM Modules', link: '/config/modules' },
          { text: 'Extending Vite', link: '/config/vite-extend' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api/overview' },
          { text: 'Helpers (define*)', link: '/api/helpers' },
          { text: 'Composables (use*)', link: '/api/composables' },
          { text: 'Engine API', link: '/api/engine' },
          { text: 'Layout API', link: '/api/layout' },
        ],
      },
      {
        text: 'CLI',
        items: [
          { text: 'Overview', link: '/cli/overview' },
          { text: 'Commands', link: '/cli/commands' },
        ],
      },
      {
        text: 'Plugins',
        items: [
          { text: 'Overview', link: '/plugins/index' },
          { text: 'Input', link: '/plugins/input' },
          { text: 'Audio', link: '/plugins/audio' },
          { text: 'Canvas2D Renderer', link: '/plugins/renderer-canvas2d' },
          { text: 'Physics2D', link: '/plugins/physics2d' },
          { text: 'Physics3D', link: '/plugins/physics3d' },
          { text: 'Sprite Animation', link: '/plugins/sprite-anim' },
          { text: 'HTML UI', link: '/plugins/ui' },
          { text: 'React Three Fiber', link: '/plugins/r3f' },
          { text: 'Debug', link: '/plugins/debug' },
          { text: 'Vite Plugin', link: '/plugins/vite' },
        ],
      },
      {
        text: 'Kit — Building Extensions',
        items: [
          { text: 'Overview', link: '/kit/overview' },
          { text: 'TypeScript Plugin', link: '/kit/typescript-plugin' },
          { text: 'WASM Plugin', link: '/kit/wasm-plugin' },
          { text: 'Shared Memory', link: '/kit/shared-memory' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Space Shooter', link: '/examples/space-shooter' },
          { text: 'Common Patterns', link: '/examples/patterns' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/djodjonx/gwen' }],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/djodjonx/gwen/edit/gwen-v2-alpha/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MPL-2.0 License.',
      copyright: 'Copyright © 2026 Jonathan Moutier',
    },
  },
});
