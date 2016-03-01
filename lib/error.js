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

function defaultTypeMessage (expectedType, receivedValue) {
  return 'Type mismatch.  Expected type ' + expectedType.name +
        ', but got value `' + receivedValue + '`'
}

function REGLTypeError (expectedType, receivedValue, message) {
  this.expectedType = expectedType
  this.receivedValue = receivedValue
  this.message = 'regl type: ' +
    (message || defaultTypeMessage(expectedType, receivedValue))
  this.stack = (new Error()).stack
}
extend(REGLTypeError, REGLError, 'REGLTypeError')

module.exports = {
  error: REGLError,
  type: REGLTypeError,
  runtime: REGLRuntimeError
}
