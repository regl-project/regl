var flow = require('./flow')

function REGLBuffer (handle, data, size, type, usage) {
  this.handle = handle
  this.data = data
  this.size = size
  this.type = type
  this.usage = usage
}

function isBuffer (object) {
  return object instanceof REGLBuffer
}

function createBuffer (options) {
}

module.exports = {
  isBuffer: isBuffer,
  create: createBuffer
}
