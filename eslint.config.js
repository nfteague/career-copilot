import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Deliberate at SDK boundaries (OpenAI file content parts, extracted
      // profile shaping) — the compiler options already keep the rest strict.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
