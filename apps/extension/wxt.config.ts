import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { version } from './package.json';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'MarkFlow',
    description: 'Capture web content as Markdown — drag, refine, export.',
    version,
    permissions: ['activeTab', 'sidePanel', 'storage'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
