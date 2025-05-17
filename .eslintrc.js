module.exports = {
  root: true,
  parser: 'hermes-eslint',
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    },
    babelOptions: {
      configFile: './babel.config.js'
    }
  },
  plugins: [
    'flowtype'
  ],
  extends: [
    'eslint:recommended',
    'plugin:flowtype/recommended'
  ],
  rules: {
  }
};