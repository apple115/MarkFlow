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
    host_permissions: ['https://*/*', 'http://*/*'],
  },
});
