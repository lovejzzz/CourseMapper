import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/CourseMapper/',
  server: {
    port: 5173,
  },
});
