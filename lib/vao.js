var values = require('./util/values')

module.exports = function wrapVAOState (gl, extensions, stats, config) {
  var extension = extensions.oes_vertex_array_object
  var hasSupport = Boolean(extension)
  var sharedVAO = null
  var vaoCount = 0
  var vaoSet = {}

  return {
    getShared: getSharedVAO,
    hasSupport: hasSupport,
    create: createVAO,
    clear: clearVAOs
  }

  function getSharedVAO () {
    return sharedVAO
  }

  //
  // Creates and returns a new `REGLVAO' instance after adding
  // it to the internal object set. If successful, the `stats.vaoCount'
  // is incremented. Upon destruction of this instance, the
  // `stats.vaoCount' is decremented. A `REGLVAO' instance has a unique
  // ID and a reference to the underyling vertex array object handle
  // created with `gl.createVertexArray()' or the extensions equivalent.
  //
  function createVAO () {
    var vao = new REGLVAO(gl)
    vaoSet[vao.id] = vao
    stats.vaoCount = vaoCount
    sharedVAO = vao
    return vao
  }

  //
  // Destroys all `REGLVAO' instances in the internal object set.
  // by calling `gl.deleteVertexArray()' or the extensions equivalent.
  //
  function clearVAOs () {
    values(vaoSet).forEach(function (vao) {
      if (vao && typeof vao.destroy === 'function') {
        vao.destroy()
      }
    })
  }

  //
  // Encapsualtes a vertex array object handle and provides methods
  // for binding, unbinding, and destroying a vertex array object.
  //
  function REGLVAO (gl) {
    this.id = -1
    this.handle = null

    if (extension) {
      this.handle = extension.createVertexArrayOES()
      if (this.handle) {
        this.id = vaoCount++
      }
    }

    this.bind = function () {
      if (extension && this.handle) {
        extension.bindVertexArrayOES(this.handle)
      }
    }

    this.unbind = function () {
      if (extension) {
        extension.bindVertexArrayOES(null)
      }
    }

    this.destroy = function () {
      if (extension && this.handle) {
        extension.deleteVertexArrayOES(this.handle)
        vaoCount = Math.max(0, vaoCount - 1)
        stats.vaoCount = vaoCount
        this.id = -1
        this.handle = null
      }
    }
  }
}
