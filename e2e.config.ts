import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
export default {
  tests: 'tests/**/*.e2e.ts',
  workers: 1,
  retries: 0,
  trace: 'on',
  targets: [{
    name: 'desktop',
    engine: web({ viewport: { width: 1600, height: 1000 }, locale: 'fr-FR' }),
    app: { url: 'http://127.0.0.1:0', command: { executable: 'node', args: ['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','{port}'],
      env: { PORT: '{port}', DATA_MODE: 'fixture', DEMO_STORE_PATH: '.runtime/e2e-demo.json' }, log: '.e2e/logs/app.log' } }
  }]
} satisfies E2EConfig;
