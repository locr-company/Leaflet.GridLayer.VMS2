import RandomGenerator from './random-generator.js'

const EXPRESSION_CACHE = new Map()

const SAFE_ROOT_FUNCTIONS = Object.freeze({
  parseInt: globalThis.parseInt,
  parseFloat: globalThis.parseFloat,
  isNaN: globalThis.isNaN
})

const SAFE_MATH_FUNCTIONS = new Set([
  'abs',
  'ceil',
  'floor',
  'max',
  'min',
  'pow',
  'round',
  'sign',
  'trunc'
])

const SAFE_MATH_PROPERTIES = new Set([
  'E',
  'LN10',
  'LN2',
  'LOG10E',
  'LOG2E',
  'PI',
  'SQRT1_2',
  'SQRT2'
])

const SAFE_STRING_METHODS = new Set([
  'endsWith',
  'includes',
  'indexOf',
  'match',
  'replace',
  'slice',
  'split',
  'startsWith',
  'substr',
  'substring',
  'toLowerCase',
  'toUpperCase',
  'trim'
])

const SAFE_ARRAY_METHODS = new Set([
  'concat',
  'includes',
  'indexOf',
  'join',
  'slice'
])

const SAFE_RANDOM_GENERATOR_METHODS = new Set([
  'random_pick'
])

const BANNED_MEMBER_NAMES = new Set([
  '__proto__',
  'arguments',
  'callee',
  'caller',
  'constructor',
  'prototype'
])

function isPlainObject (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

function isRandomGenerator (value) {
  return value instanceof RandomGenerator
}

function transformExpressionPlaceholders (expression) {
  return expression
    .replace(/<tags\.([A-Za-z0-9_:-]+)>/g, "ObjectData.tags['$1']")
    .replace(/<([A-Za-z0-9_:-]+)>/g, 'ObjectData.$1')
}

function buildScope (overrides) {
  const scope = Object.create(null)

  scope.Math = Math

  for (const [name, value] of Object.entries(SAFE_ROOT_FUNCTIONS)) {
    scope[name] = value
  }

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      scope[key] = value
    }
  }

  return scope
}

function getTokenCanStartRegex (token) {
  if (!token) {
    return true
  }

  if (token.type === 'literal' || token.type === 'identifier') {
    return false
  }

  if (token.type === 'punctuator') {
    return ![')', ']', '.'].includes(token.value)
  }

  return true
}

function tokenize (expression) {
  const tokens = []
  const length = expression.length
  let index = 0
  let canStartRegex = true

  function pushToken (token) {
    tokens.push(token)
    canStartRegex = getTokenCanStartRegex(token)
  }

  function syntaxError (message) {
    throw new SyntaxError(`${message} at position ${index} in expression "${expression}"`)
  }

  function readString (quote) {
    let value = ''

    index++

    while (index < length) {
      const char = expression[index++]

      if (char === quote) {
        return value
      }

      if (char === '\\') {
        if (index >= length) {
          syntaxError('Unterminated string literal')
        }

        const escape = expression[index++]

        if (escape === 'n') {
          value += '\n'
        } else if (escape === 'r') {
          value += '\r'
        } else if (escape === 't') {
          value += '\t'
        } else if (escape === 'b') {
          value += '\b'
        } else if (escape === 'f') {
          value += '\f'
        } else if (escape === 'v') {
          value += '\v'
        } else if (escape === 'x') {
          const hex = expression.slice(index, index + 2)

          if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
            syntaxError('Invalid hex escape sequence')
          }

          value += String.fromCharCode(Number.parseInt(hex, 16))
          index += 2
        } else if (escape === 'u') {
          const hex = expression.slice(index, index + 4)

          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
            syntaxError('Invalid unicode escape sequence')
          }

          value += String.fromCharCode(Number.parseInt(hex, 16))
          index += 4
        } else {
          value += escape
        }

        continue
      }

      value += char
    }

    syntaxError('Unterminated string literal')
  }

  function readNumber () {
    const remaining = expression.slice(index)
    const match = remaining.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)

    if (!match) {
      syntaxError('Invalid number literal')
    }

    index += match[0].length

    return Number(match[0])
  }

  function readIdentifier () {
    const start = index
    index++

    while (index < length && /[A-Za-z0-9_$]/.test(expression[index])) {
      index++
    }

    const value = expression.slice(start, index)

    if (value === 'true') {
      return true
    }

    if (value === 'false') {
      return false
    }

    if (value === 'null') {
      return null
    }

    if (value === 'undefined') {
      return undefined
    }

    if (value === 'NaN') {
      return Number.NaN
    }

    if (value === 'Infinity') {
      return Number.POSITIVE_INFINITY
    }

    return { type: 'identifier', value, start, end: index }
  }

  function readRegexLiteral () {
    const start = index
    let body = ''
    let inCharacterClass = false

    index++

    while (index < length) {
      const char = expression[index++]

      if (char === '\\') {
        body += char

        if (index >= length) {
          syntaxError('Unterminated regular expression literal')
        }

        body += expression[index++]
        continue
      }

      if (char === '[') {
        inCharacterClass = true
        body += char
        continue
      }

      if (char === ']' && inCharacterClass) {
        inCharacterClass = false
        body += char
        continue
      }

      if (char === '/' && !inCharacterClass) {
        let flags = ''

        while (index < length && /[a-z]/i.test(expression[index])) {
          flags += expression[index++]
        }

        return new RegExp(body, flags)
      }

      body += char
    }

    index = start
    syntaxError('Unterminated regular expression literal')
  }

  while (index < length) {
    const char = expression[index]

    if (/\s/.test(char)) {
      index++
      continue
    }

    if (char === '/' && canStartRegex) {
      const start = index
      const value = readRegexLiteral()

      pushToken({
        type: 'literal',
        value,
        start,
        end: index
      })
      continue
    }

    if (char === '\'' || char === '"') {
      const start = index
      const value = readString(char)
      pushToken({ type: 'literal', value, start, end: index })
      continue
    }

    if (char === '.' && index + 1 < length && /\d/.test(expression[index + 1])) {
      const start = index
      const value = readNumber()
      pushToken({ type: 'literal', value, start, end: index })
      continue
    }

    if (/\d/.test(char)) {
      const start = index
      const value = readNumber()
      pushToken({ type: 'literal', value, start, end: index })
      continue
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index
      const value = readIdentifier()
      pushToken(value && typeof value === 'object' && value.type === 'identifier'
        ? value
        : { type: 'literal', value, start, end: index })
      continue
    }

    const threeCharacterOperator = expression.slice(index, index + 3)

    if (threeCharacterOperator === '===' || threeCharacterOperator === '!==') {
      pushToken({ type: 'operator', value: threeCharacterOperator, start: index, end: index + 3 })
      index += 3
      continue
    }

    const twoCharacterOperator = expression.slice(index, index + 2)

    if (['&&', '||', '==', '!=', '<=', '>='].includes(twoCharacterOperator)) {
      pushToken({ type: 'operator', value: twoCharacterOperator, start: index, end: index + 2 })
      index += 2
      continue
    }

    if (['+', '-', '*', '/', '%', '<', '>', '!'].includes(char)) {
      pushToken({ type: 'operator', value: char, start: index, end: index + 1 })
      index++
      continue
    }

    if (['(', ')', '[', ']', ',', '?', ':', '.'].includes(char)) {
      pushToken({ type: 'punctuator', value: char, start: index, end: index + 1 })
      index++
      continue
    }

    syntaxError(`Unexpected character "${char}"`)
  }

  tokens.push({ type: 'eof', value: null, start: length, end: length })

  return tokens
}

function parseExpressionString (expression) {
  const tokens = tokenize(expression)
  let cursor = 0

  function currentToken () {
    return tokens[cursor]
  }

  function syntaxError (message, token = currentToken()) {
    throw new SyntaxError(`${message} at position ${token?.start ?? expression.length} in expression "${expression}"`)
  }

  function matchOperator (operator) {
    const token = currentToken()

    if (token.type === 'operator' && token.value === operator) {
      cursor++
      return true
    }

    return false
  }

  function matchPunctuator (punctuator) {
    const token = currentToken()

    if (token.type === 'punctuator' && token.value === punctuator) {
      cursor++
      return true
    }

    return false
  }

  function expectPunctuator (punctuator) {
    if (!matchPunctuator(punctuator)) {
      syntaxError(`Expected "${punctuator}"`)
    }
  }

  function expectIdentifier () {
    const token = currentToken()

    if (token.type !== 'identifier') {
      syntaxError('Expected an identifier', token)
    }

    cursor++

    return token.value
  }

  function parsePrimary () {
    const token = currentToken()

    if (token.type === 'literal') {
      cursor++
      return { type: 'Literal', value: token.value }
    }

    if (token.type === 'identifier') {
      cursor++
      return { type: 'Identifier', name: token.value }
    }

    if (matchPunctuator('(')) {
      const expressionNode = parseExpression()
      expectPunctuator(')')
      return expressionNode
    }

    if (matchPunctuator('[')) {
      const elements = []

      if (!matchPunctuator(']')) {
        while (true) {
          elements.push(parseExpression())

          if (matchPunctuator(']')) {
            break
          }

          expectPunctuator(',')

          if (matchPunctuator(']')) {
            break
          }
        }
      }

      return { type: 'ArrayExpression', elements }
    }

    syntaxError('Unexpected token', token)
  }

  function parsePostfix () {
    let node = parsePrimary()

    while (true) {
      if (matchPunctuator('.')) {
        const property = expectIdentifier()
        node = {
          type: 'MemberExpression',
          object: node,
          property: { type: 'Identifier', name: property },
          computed: false
        }
        continue
      }

      if (matchPunctuator('[')) {
        const property = parseExpression()
        expectPunctuator(']')
        node = {
          type: 'MemberExpression',
          object: node,
          property,
          computed: true
        }
        continue
      }

      if (matchPunctuator('(')) {
        const args = []

        if (!matchPunctuator(')')) {
          while (true) {
            args.push(parseExpression())

            if (matchPunctuator(')')) {
              break
            }

            expectPunctuator(',')

            if (matchPunctuator(')')) {
              break
            }
          }
        }

        node = {
          type: 'CallExpression',
          callee: node,
          arguments: args
        }

        continue
      }

      break
    }

    return node
  }

  function parseUnary () {
    const token = currentToken()

    if (token.type === 'operator' && ['!', '+', '-'].includes(token.value)) {
      cursor++

      return {
        type: 'UnaryExpression',
        operator: token.value,
        argument: parseUnary()
      }
    }

    return parsePostfix()
  }

  function parseMultiplicative () {
    let node = parseUnary()

    while (true) {
      const token = currentToken()

      if (token.type === 'operator' && ['*', '/', '%'].includes(token.value)) {
        cursor++
        node = {
          type: 'BinaryExpression',
          operator: token.value,
          left: node,
          right: parseUnary()
        }
        continue
      }

      break
    }

    return node
  }

  function parseAdditive () {
    let node = parseMultiplicative()

    while (true) {
      const token = currentToken()

      if (token.type === 'operator' && ['+', '-'].includes(token.value)) {
        cursor++
        node = {
          type: 'BinaryExpression',
          operator: token.value,
          left: node,
          right: parseMultiplicative()
        }
        continue
      }

      break
    }

    return node
  }

  function parseRelational () {
    let node = parseAdditive()

    while (true) {
      const token = currentToken()

      if (token.type === 'operator' && ['<', '<=', '>', '>='].includes(token.value)) {
        cursor++
        node = {
          type: 'BinaryExpression',
          operator: token.value,
          left: node,
          right: parseAdditive()
        }
        continue
      }

      break
    }

    return node
  }

  function parseEquality () {
    let node = parseRelational()

    while (true) {
      const token = currentToken()

      if (token.type === 'operator' && ['==', '!=', '===', '!=='].includes(token.value)) {
        cursor++
        node = {
          type: 'BinaryExpression',
          operator: token.value,
          left: node,
          right: parseRelational()
        }
        continue
      }

      break
    }

    return node
  }

  function parseLogicalAnd () {
    let node = parseEquality()

    while (matchOperator('&&')) {
      node = {
        type: 'LogicalExpression',
        operator: '&&',
        left: node,
        right: parseEquality()
      }
    }

    return node
  }

  function parseLogicalOr () {
    let node = parseLogicalAnd()

    while (matchOperator('||')) {
      node = {
        type: 'LogicalExpression',
        operator: '||',
        left: node,
        right: parseLogicalAnd()
      }
    }

    return node
  }

  function parseConditional () {
    const test = parseLogicalOr()

    if (matchPunctuator('?')) {
      const consequent = parseExpression()
      expectPunctuator(':')

      return {
        type: 'ConditionalExpression',
        test,
        consequent,
        alternate: parseConditional()
      }
    }

    return test
  }

  function parseExpression () {
    return parseConditional()
  }

  const ast = parseExpression()

  if (currentToken().type !== 'eof') {
    syntaxError('Unexpected trailing tokens', currentToken())
  }

  return ast
}

function getMemberValue (object, property) {
  if (object == null) {
    return undefined
  }

  const propertyName = String(property)

  if (BANNED_MEMBER_NAMES.has(propertyName)) {
    return undefined
  }

  if (object === Math) {
    if (SAFE_MATH_PROPERTIES.has(propertyName) || SAFE_MATH_FUNCTIONS.has(propertyName)) {
      return Math[propertyName]
    }

    return undefined
  }

  if (isRandomGenerator(object)) {
    if (SAFE_RANDOM_GENERATOR_METHODS.has(propertyName) && typeof object[propertyName] === 'function') {
      return object[propertyName]
    }

    return undefined
  }

  if (typeof object === 'string' || object instanceof String) {
    if (propertyName === 'length') {
      return object.length
    }

    if (/^(?:0|[1-9][0-9]*)$/.test(propertyName)) {
      return object.charAt(Number.parseInt(propertyName, 10))
    }

    if (SAFE_STRING_METHODS.has(propertyName)) {
      return String.prototype[propertyName]
    }

    return undefined
  }

  if (Array.isArray(object)) {
    if (propertyName === 'length') {
      return object.length
    }

    if (/^(?:0|[1-9][0-9]*)$/.test(propertyName)) {
      return object[Number.parseInt(propertyName, 10)]
    }

    if (SAFE_ARRAY_METHODS.has(propertyName)) {
      return Array.prototype[propertyName]
    }

    return undefined
  }

  if (typeof object === 'function' || typeof object === 'number' || typeof object === 'boolean' || typeof object === 'bigint' || typeof object === 'symbol') {
    return undefined
  }

  if (isPlainObject(object)) {
    if (!Object.prototype.hasOwnProperty.call(object, propertyName)) {
      return undefined
    }

    const value = object[propertyName]

    return typeof value === 'function' ? undefined : value
  }

  return undefined
}

function callMemberFunction (receiver, property, args) {
  if (receiver == null) {
    return undefined
  }

  const propertyName = String(property)

  if (BANNED_MEMBER_NAMES.has(propertyName)) {
    return undefined
  }

  if (receiver === Math) {
    if (!SAFE_MATH_FUNCTIONS.has(propertyName) || typeof Math[propertyName] !== 'function') {
      return undefined
    }

    return Math[propertyName](...args)
  }

  if (isRandomGenerator(receiver)) {
    if (!SAFE_RANDOM_GENERATOR_METHODS.has(propertyName) || typeof receiver[propertyName] !== 'function') {
      return undefined
    }

    return receiver[propertyName](...args)
  }

  if (typeof receiver === 'string' || receiver instanceof String) {
    if (!SAFE_STRING_METHODS.has(propertyName) || typeof String.prototype[propertyName] !== 'function') {
      return undefined
    }

    return String.prototype[propertyName].apply(receiver, args)
  }

  if (Array.isArray(receiver)) {
    if (!SAFE_ARRAY_METHODS.has(propertyName) || typeof Array.prototype[propertyName] !== 'function') {
      return undefined
    }

    return Array.prototype[propertyName].apply(receiver, args)
  }

  return undefined
}

function evaluateIdentifier (name, scope) {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    return scope[name]
  }

  return undefined
}

function evaluateNode (node, scope) {
  switch (node.type) {
    case 'Literal':
      return node.value

    case 'Identifier':
      return evaluateIdentifier(node.name, scope)

    case 'ArrayExpression':
      return node.elements.map(element => evaluateNode(element, scope))

    case 'UnaryExpression': {
      const value = evaluateNode(node.argument, scope)

      if (node.operator === '!') {
        return !value
      }

      if (node.operator === '+') {
        return +value
      }

      if (node.operator === '-') {
        return -value
      }

      return undefined
    }

    case 'BinaryExpression': {
      const left = evaluateNode(node.left, scope)
      const right = evaluateNode(node.right, scope)

      if (node.operator === '+') {
        return left + right
      }

      if (node.operator === '-') {
        return left - right
      }

      if (node.operator === '*') {
        return left * right
      }

      if (node.operator === '/') {
        return left / right
      }

      if (node.operator === '%') {
        return left % right
      }

      if (node.operator === '<') {
        return left < right
      }

      if (node.operator === '<=') {
        return left <= right
      }

      if (node.operator === '>') {
        return left > right
      }

      if (node.operator === '>=') {
        return left >= right
      }

      /* eslint-disable eqeqeq */
      if (node.operator === '==') {
        return left == right
      }

      if (node.operator === '!=') {
        return left != right
      }
      /* eslint-enable eqeqeq */

      if (node.operator === '===') {
        return left === right
      }

      if (node.operator === '!==') {
        return left !== right
      }

      return undefined
    }

    case 'LogicalExpression':
      if (node.operator === '&&') {
        const left = evaluateNode(node.left, scope)

        return left ? evaluateNode(node.right, scope) : left
      }

      if (node.operator === '||') {
        const left = evaluateNode(node.left, scope)

        return left || evaluateNode(node.right, scope)
      }

      return undefined

    case 'ConditionalExpression':
      if (evaluateNode(node.test, scope)) {
        return evaluateNode(node.consequent, scope)
      }

      return evaluateNode(node.alternate, scope)

    case 'MemberExpression': {
      const object = evaluateNode(node.object, scope)
      const property = node.computed
        ? evaluateNode(node.property, scope)
        : node.property.name

      return getMemberValue(object, property)
    }

    case 'CallExpression': {
      const args = node.arguments.map(argument => evaluateNode(argument, scope))

      if (node.callee.type === 'Identifier') {
        const fn = evaluateIdentifier(node.callee.name, scope)

        if (typeof fn === 'function' && Object.prototype.hasOwnProperty.call(SAFE_ROOT_FUNCTIONS, node.callee.name)) {
          return fn(...args)
        }

        return undefined
      }

      if (node.callee.type === 'MemberExpression') {
        const receiver = evaluateNode(node.callee.object, scope)
        const property = node.callee.computed
          ? evaluateNode(node.callee.property, scope)
          : node.callee.property.name

        return callMemberFunction(receiver, property, args)
      }

      return undefined
    }
  }

  return undefined
}

function compileExpression (expression, scopeFactory) {
  const cachedAst = EXPRESSION_CACHE.get(expression)
  const ast = cachedAst || parseExpressionString(expression)

  if (!cachedAst) {
    EXPRESSION_CACHE.set(expression, ast)
  }

  return function compiledExpression (...args) {
    return evaluateNode(ast, scopeFactory(...args))
  }
}

export function compileObjectDataExpression (expression) {
  return compileExpression(transformExpressionPlaceholders(expression), (ObjectData, MapZoom, RandomGeneratorValue) => {
    return buildScope({
      ObjectData,
      MapZoom,
      RandomGenerator: RandomGeneratorValue
    })
  })
}

export function compileSortExpression (expression) {
  return compileExpression(expression, (a, b) => {
    return buildScope({
      a,
      b
    })
  })
}
