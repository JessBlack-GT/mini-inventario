// Configuración de las pruebas de extremo a extremo (Playwright).
//
// Las credenciales de prueba se leen del entorno: TEST_EMAIL y TEST_PASSWORD.
// Si existe .env, se carga con el lector integrado de Node (igual que
// src/server.js); las variables que ya estén definidas en el entorno no se
// reemplazan. Nunca se imprimen ni se guarda el estado de autenticación.
// Trazas y capturas desactivadas para que no queden credenciales ni datos
// de la cuenta en test-results/.

import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const puerto = Number(process.env.PORT) || 3000;
const baseURL = `http://localhost:${puerto}`;

export default defineConfig({
  testDir: './tests',
  // Todas las pruebas usan la misma cuenta: en serie para no pisarse.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      // El viewport va después de devices para que no lo reemplace el 1280x720 del preset.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm start',
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
