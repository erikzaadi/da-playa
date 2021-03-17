module.exports = {
  env: {
    browser: true,
    es2021: true,
    'jest/globals': true,
  },
  extends: [
    'airbnb-base',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
    'jest',
  ],
  rules: {
    'linebreak-style': ['error', 'unix'],
    quotes: [
      'error',
      'single',
      { avoidEscape: true, allowTemplateLiterals: false },
    ],
    'lines-between-class-members': [1, 'always', { exceptAfterSingleLine: true }],
    '@typescript-eslint/lines-between-class-members': [1, 'always', { exceptAfterSingleLine: true }],
    '@typescript-eslint/no-parameter-properties': [0],
    '@typescript-eslint/explicit-function-return-type': [
      'error', {
        allowTypedFunctionExpressions: true,
        allowExpressions: true,
      },
    ],
    '@typescript-eslint/ban-ts-comment': [0],
    '@typescript-eslint/explicit-member-accessibility': [0],
    'jsx-a11y/anchor-is-valid': [0],
    indent: ['error'],
    '@typescript-eslint/indent': 'off',
    semi: ['error', 'never'],
    '@typescript-eslint/semi': ['error', 'never'],
    'no-param-reassign': [2, { props: false }],
    '@typescript-eslint/no-unused-vars': [1, { argsIgnorePattern: '^_' }],
    'no-constant-condition': ['error', { checkLoops: false }],
    'generator-star-spacing': ['error', { before: true, after: false }],
    'arrow-parens': ['error', 'as-needed'],
    'comma-dangle': ['error', {
      functions: 'ignore',
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
    }],
    'implicit-arrow-linebreak': ['off'],
    'import/prefer-default-export': ['off'],
    'object-curly-newline': ['error', { consistent: true }],
    '@typescript-eslint/member-delimiter-style': ['error', {
      multiline: { delimiter: 'none', requireLast: undefined },
      singleline: { delimiter: 'semi', requireLast: undefined },
    }],
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: ['!test/**/*'],
    }],
    'jest/valid-describe': ['off'],
    'import/extensions': ['error', 'never', {
      json: 'always',
    }],
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'default',
        format: ['camelCase'],
        filter: { regex: '(^_{1,2}|[. -])', match: false },
      },
      {
        selector: 'memberLike',
        format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        filter: { regex: '(^_{1,2}|[. -])', match: false },
      },
      { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
      {
        selector: 'parameter',
        format: ['camelCase', 'PascalCase'],
        leadingUnderscore: 'allow',
      },
      { selector: 'typeLike', format: ['PascalCase'] },
    ],
    '@typescript-eslint/explicit-module-boundary-types': [
      'error',
      { allowedNames: ['__resolveReference'] },
    ],
  },
  overrides: [
    {
      files: ['*.ts'],
      rules: {
        'no-useless-constructor': [0],
        'no-empty-function': [0],
        '@typescript-eslint/array-type': [0],
        '@typescript-eslint/ban-ts-ignore': [0],
        'max-classes-per-file': [0],
        'import/no-unresolved': [0], // unable to read paths from tsconfig.json
        'import/named': [0],
        'default-case': [0],
      },
    },
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': [0],
        '@typescript-eslint/no-var-requires': [0],
      },
    },
  ],
}
