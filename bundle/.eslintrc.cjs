// .eslintrc.cjs
// CommonJS format required when package.json has "type": "module"

module.exports = {
  root: true,
  env: {
    browser:  true,
    es2022:   true,
  },
  extends: [
    'eslint:recommended',
    'prettier',              // disables ESLint rules that conflict with Prettier
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType:  'module',
  },
  globals: {
    // Globals exposed by the Vite bundle (window.*) — tell ESLint these exist
    ArucoDetector:      'readonly',
    OrientationTracker: 'readonly',
    createVPSProvider:  'readonly',
    checkVPSSupport:    'readonly',
    // Phase 0 globals from config.js / utils.js
    sendDataChannel:    'readonly',
    CONFIG:             'readonly',
    SETTINGS:           'readonly',
  },
  rules: {
    'no-unused-vars':  ['warn', { argsIgnorePattern: '^_' }],
    'no-console':      'off',        // console.log/warn used throughout for dev
    'no-undef':        'error',
    'prefer-const':    'warn',
    'no-var':          'error',
    'eqeqeq':          ['error', 'always'],
  },
};
