import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        coverage: { enabled: false },
        globals: true,
        include: ['test/**/*.spec.ts'],
        restoreMocks: true,
    },
})
