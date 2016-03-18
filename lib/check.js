// Error checking and parameter validation

var dtypes = require('./dtypes.json')

function extend (Parent, Child, name) {
  var proto = Child.prototype = new Parent()
  proto.name = name
  proto.constructor = Child
}

function REGLError (message) {
  this.message = 'regl: ' + message
  this.stack = (new Error()).stack
}
extend(REGLError, Error, 'REGLError')

function REGLRuntimeError (rawError, shortMessage, longMessage) {
  this.shortMessage = shortMessage || ''
  this.longMessage = longMessage || ''
  this.rawError = rawError || ''
  this.message =
    'regl runtime: ' + (shortMessage || rawError || '') +
    (longMessage ? '\n' + longMessage : '')
  this.stack = (new Error()).stack
}
extend(REGLRuntimeError, REGLError, 'REGLRuntimeError')

function raise (message) {
  throw new REGLError(message)
}

function raiseRuntime (rawError, shortMessage, longMessage) {
  throw new REGLRuntimeError(rawError, shortMessage, longMessage)
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
    Object.prototype.toString.call(data) in dtypes,
    'invalid parameter type' + encolon(message) +
    '. must be a typed array')
}

function checkTypeOf (value, type, message) {
  check(typeof param === type,
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

module.exports = Object.assign(check, {
  error: REGLError,
  runtime: REGLRuntimeError,
  raise: raise,
  raiseRuntime: raiseRuntime,
  parameter: checkParameter,
  type: checkTypeOf,
  isTypedArray: checkIsTypedArray,
  nni: checkNonNegativeInt
})
