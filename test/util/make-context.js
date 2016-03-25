var createContext = require('gl')
var regl = require('../../regl')

module.exports = function makeContext (options) {
  var gl = createContext(gl)
  return {
    gl: gl,
    regl: regl(gl)
  }
}
