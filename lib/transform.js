var Stream = require('stream')
var PassThrough = Stream.PassThrough
var Transform = Stream.Transform
var util = require('util')
var path = require('path')
var fs = require('fs')

var REGL_PATH = path.normalize(path.join(__dirname,
  '../regl.js'))
var UNCHECKED = fs.readFileSync(path.join(__dirname,
  '../dist/regl.min.js')).toString()

function ReplaceREGL (options) {
  Transform.call(this, options)
}
util.inherits(ReplaceREGL, Transform)

ReplaceREGL.prototype._transform = function (chunk, enc, cb) {
  cb()
}

ReplaceREGL.prototype._flush = function (cb) {
  this.push(UNCHECKED)
  cb()
}

module.exports = function (file, options) {
  if ((options._flags && options._flags.debug) ||
    path.normalize(file) !== REGL_PATH) {
    return new PassThrough()
  }
  return new ReplaceREGL()
}
