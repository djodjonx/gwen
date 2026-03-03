import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'GWEN',
  description: 'Composable web game framework (Rust/WASM core + TypeScript DX).',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/GETTING_STARTED' },
      { text: 'CLI', link: '/CLI' },
      { text: 'API', link: '/API' },
      { text: 'Architecture', link: '/ARCHITECTURE' },
      { text: 'GitHub', link: 'https://github.com/djodjonx/gwen' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting Started', link: '/GETTING_STARTED' },
        ],
      },
      {
        text: 'Core',
        items: [
          { text: 'CLI Guide', link: '/CLI' },
          { text: 'API Reference', link: '/API' },
          { text: 'Architecture', link: '/ARCHITECTURE' },
          { text: 'Troubleshooting', link: '/TROUBLESHOOTING' },
        ],
      },
      {
        text: 'Project',
        items: [
          {
            text: 'Contributing',
            link: 'https://github.com/djodjonx/gwen/blob/main/CONTRIBUTING.md',
          },
          { text: 'Security', link: 'https://github.com/djodjonx/gwen/blob/main/SECURITY.md' },
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
  },
});
