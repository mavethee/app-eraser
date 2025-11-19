module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    jest: true,
  },
  plugins: ['sonarjs'],
  extends: ['airbnb-base'],

  rules: {

    // Manually adding the core SonarJS rules (excluding complexity for stability):
    'sonarjs/no-duplicate-string': 'error',
    'sonarjs/no-identical-functions': 'error',
    'sonarjs/no-redundant-jump': 'error',
    'sonarjs/no-one-catch': 'off',
    'sonarjs/no-unnecessary-override': 'off',
    'sonarjs/no-extra-arguments': 'error',
    'sonarjs/no-collapsible-if': 'error',
    'sonarjs/no-collection-size-mischeck': 'error',
    'sonarjs/no-redundant-boolean': 'error',
    'sonarjs/prefer-immediate-return': 'error',

    'no-console': 'off',

    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/*.test.js', '**/*.spec.js'],
        optionalDependencies: false,
        peerDependencies: false,
      },
    ],
  },
  settings: {
    'import/core-modules': ['electron'],
  },
};
