export default [
  {
    rules: {
      'no-underscore-dangle': ['error', {
        'allowAfterThis': true // Allow leading underscores for functions
      }] // Disallow trailing underscores
    }
  }
]
