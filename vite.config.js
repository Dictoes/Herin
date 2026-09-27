import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// StudyDesk  student study & schedule app
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  }
})
