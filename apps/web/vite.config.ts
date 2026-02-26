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
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only apply manual chunks for client builds
          if (id.includes('node_modules')) {
            // React 生态系统
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // Markdown 和代码高亮
            if (
              id.includes('react-markdown') ||
              id.includes('rehype-highlight') ||
              id.includes('remark-gfm') ||
              id.includes('remark-math') ||
              id.includes('highlight.js')
            ) {
              return 'markdown';
            }
            // 数学公式渲染
            if (id.includes('katex')) {
              return 'katex';
            }
            // 图表库（延迟加载）
            if (id.includes('mermaid')) {
              return 'mermaid';
            }
            // UI 库
            if (id.includes('lucide-react') || id.includes('@radix-ui')) {
              return 'ui-vendor';
            }
            // 状态管理
            if (id.includes('@tanstack/react-query') || id.includes('zustand')) {
              return 'state';
            }
            // 虚拟滚动
            if (id.includes('react-virtuoso')) {
              return 'virtuoso';
            }
            // PDF.js 单独分割（大体积库）
            if (id.includes('pdfjs-dist')) {
              return 'pdfjs';
            }
            // Office 文件处理单独分割（延迟加载）
            if (id.includes('mammoth') || id.includes('xlsx') || id.includes('jszip')) {
              return 'office';
            }
          }
        },
      },
    },
  },
});
