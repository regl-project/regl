// Error checking and parameter validation
var isTypedArray = require('./is-typed-array')

function raise (message) {
  var error = new Error('(regl) ' + message)
  console.error(error)
  throw error
}

function check (pred, message) {
  if (!pred) {
    raise(message)
  }
}

function encolon (message) {
  if (message) {
    return ': ' + message
  }
  return ''
}

function checkParameter (param, possibilities, message) {
  check(param in possibilities,
    'unknown parameter (' + param + ')' + encolon(message) +
    '. possible values: ' + Object.keys(possibilities).join())
}

function checkIsTypedArray (data, message) {
  check(
    isTypedArray(data),
    'invalid parameter type' + encolon(message) +
    '. must be a typed array')
}

function checkTypeOf (value, type, message) {
  check(typeof value === type,
    'invalid parameter type' + encolon(message) +
    '. expected ' + type + ', got ' + (typeof value))
}

function checkNonNegativeInt (value, message) {
  check(
    (value >= 0) &&
    ((value | 0) === value),
    'invalid parameter type, (' + value + ')' + encolon(message) +
    '. must be a nonnegative integer')
}

function checkOneOf (value, list, message) {
  check(
    list.indexOf(value) >= 0,
    'invalid value' + encolon(message) + '. must be one of: ' + list)
}

module.exports = Object.assign(check, {
  raise: raise,
  parameter: checkParameter,
  type: checkTypeOf,
  isTypedArray: checkIsTypedArray,
  nni: checkNonNegativeInt,
  oneOf: checkOneOf
})
