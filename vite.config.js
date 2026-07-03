import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    modulePreload: {
      resolveDependencies(_, deps) {
        return deps.filter(dep => (
          !dep.includes('/App-') &&
          !dep.includes('/Login-') &&
          !dep.includes('/icons-') &&
          !dep.includes('/supabase-')
        ));
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('/lucide-react/')) return 'icons';
          return undefined;
        },
      },
    },
  },
});
