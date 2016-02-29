module.exports = REGLError

function REGLError (rawError, shortMessage, longMessage) {
  this.shortMessage = shortMessage || ''
  this.longMessage = longMessage || ''
  this.rawError = rawError || ''
  this.message =
    'regl: ' + (shortMessage || rawError || '') +
    (longMessage ? '\n' + longMessage : '')
  this.stack = (new Error()).stack
}

var proto = REGLError.prototype = new Error()
proto.name = 'REGLError'
proto.constructor = REGLError
