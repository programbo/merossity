const baseConfig = require('./prettier.config.cjs')

/** @type {import('prettier').Config} */
module.exports = {
  ...baseConfig,
  plugins: [...(baseConfig.plugins ?? []), 'prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cx', 'tv', 'cn', 'cnJoin', 'twMerge', 'twJoin', 'clsx'],
}
