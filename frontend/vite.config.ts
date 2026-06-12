import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const customRedirects = () => ({
  name: 'custom-redirects',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url === '/clock') {
        res.writeHead(302, { Location: '/clock/' })
        res.end()
        return
      }
      if (req.url === '/favicon.ico' || req.url === '/clock.svg') {
        res.writeHead(302, { Location: '/clock/icon-192.svg' })
        res.end()
        return
      }
      next()
    })
  }
})

export default defineConfig({
  base: '/clock/',
  plugins: [
    customRedirects(),
    react(),
    VitePWA({
      injectRegister: false,
      registerType: 'prompt',
      includeAssets: ['icon-192.svg', 'bell.mp3', 'sounds/work-end.mp3', 'sounds/rest-end.mp3', 'sounds/meditation-end.mp3'],
      manifest: {
        name: 'PolarClock - 番茄钟',
        short_name: 'PolarClock',
        description: '个人番茄钟时间管理系统',
        start_url: '/clock/tasks',
        scope: '/clock/',
        display: 'standalone',
        background_color: '#1a1a2e',
        theme_color: '#1a1a2e',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3}'],
        navigateFallback: '/clock/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ['script', 'style', 'image'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300
              }
            }
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'font'
              || url.origin.includes('fonts.gstatic.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-assets',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 24 * 60 * 60
              }
            }
          }
        ]
      }
    })
  ],
  preview: { allowedHosts: ["128gb.banteng-edmontosaurus.ts.net"] },
  server: {
    port: 4555,
    host: true,         // Listen on all interfaces
    allowedHosts: true,  // Allow Tailscale Funnel (*.ts.net) and other external hosts
    proxy: {
      '/api': {
        target: 'http://localhost:15550',
        changeOrigin: true,
        ws: true
      },
      '/digist-api': {
        target: 'http://localhost:3800',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/digist-api/, ''),
      },
      '/gw/knowlever-rag': {
        target: 'http://localhost:18080',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/gw\/knowlever-rag/, ''),
      },
      '^/clock$': {
        target: 'http://localhost:4555',
        bypass: (req: any, res: any) => {
          res.writeHead(302, { Location: '/clock/' });
          res.end();
          return true;
        }
      }
    }
  }
})
