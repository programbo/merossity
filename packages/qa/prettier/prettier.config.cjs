/** @type {import('prettier').Config} */
module.exports = {
  arrowParens: 'always',
  importOrder: [
    '^node:fs/promises$',
    '^node:fs$',
    '^node:(.*)$',
    '^(react/(.*)$)|^(react$)',
    '^(next/(.*)$)|^(next$)',
    '<THIRD_PARTY_MODULES>',
    '^@gearmo/(.*)$',
    '^@/(.*)$',
    '^[./]',
  ],
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
      },
    },
  ],
  plugins: ['@trivago/prettier-plugin-sort-imports'],
  printWidth: 120,
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
}
