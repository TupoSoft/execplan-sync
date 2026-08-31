import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['coverage/**', 'dist/**', 'eslint.config.mjs', 'node_modules/**'] },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
        },
    },
)
