import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : chemins relatifs, pour fonctionner sous https://<compte>.github.io/manhunt/
export default defineConfig({
  plugins: [react()],
  base: './',
})
