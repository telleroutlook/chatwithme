import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
  ssr: {
    noExternal: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only apply manual chunks for client builds
          if (id.includes('node_modules')) {
            if (id.includes('react-markdown') || id.includes('rehype-highlight') ||
                id.includes('remark-gfm') || id.includes('remark-math')) {
              return 'markdown';
            }
            if (id.includes('katex')) {
              return 'katex';
            }
            if (id.includes('mermaid')) {
              return 'mermaid';
            }
          }
        }
      }
    }
  }
});
