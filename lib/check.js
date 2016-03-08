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

function assert (pred, message) {
  if (!pred) {
    raise(message)
  }
}

function checkParameter (param, possibilities, message) {
  assert(param in possibilities,
    'unknown parameter ' + param + (message ? ': ' + message : ''))
}

function checkIsTypedArray (data, message) {
  assert(
    Object.prototype.toString.call(data) in dtypes,
    message)
}

module.exports = Object.assign(assert, {
  error: REGLError,
  runtime: REGLRuntimeError,
  raise: raise,
  raiseRuntime: raiseRuntime,
  parameter: checkParameter,
  isTypedArray: checkIsTypedArray
})
