export default [
  {
    rules: {
      'indent': ['error', 2], // Enforce 2 spaces for indentation
      'semi': ['error', 'never'], // Disallow trailing semicolons
      'camelcase': ['error', { properties: 'always', ignoreDestructuring: false, ignoreImports: false }], // Enforce camelCase
      'no-underscore-dangle': ['error', {
        'allowAfterThis': false,
        'allowAfterSuper': false,
        'enforceInMethodNames': true,
        'allow': ['_id'], // Add exceptions here
        'allowAfterThis': true // Allow leading underscores for functions
      }] // Disallow trailing underscores
    }
  }
]
