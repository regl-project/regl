var wrapExtensions = require('../lib/extension')
var createContext = require('./util/create-context')
var wrapVAOState = require('../lib/vao')
var createREGL = require('../../regl')
var tape = require('tape')

var EXTENSION_NAME = 'OES_vertex_array_object'

var vaoFunctions = {
  bindVertexArrayOES: 0,
  createVertexArrayOES: 0,
  deleteVertexArrayOES: 0
}

function createConfig (gl, config) {
  return Object.assign({
    gl: gl,
    canvas: gl.canvas,
    extensions: [],
    optionalExtensions: [],
    onDone: onDone
  }, config)
}

function onDone (res) { void res }
function onDestroy () { }

function reset () {
  Object.keys(vaoFunctions).forEach(function (fn) {
    vaoFunctions[fn] = 0
  })
}

function cleanup (gl) {
  var ext = gl.getExtension(EXTENSION_NAME)
  if (ext) {
    Object.keys(vaoFunctions).forEach(function (fn) {
      if (ext.hasOwnProperty(fn)) {
        delete ext[fn]
      }
    })
  }
}

function spyExtension (gl) {
  var ext = gl.getExtension(EXTENSION_NAME)
  if (ext) {
    Object.keys(vaoFunctions).forEach(function (fn) {
      var oldFn = ext[fn].bind(ext)
      ext[fn] = function () {
        vaoFunctions[fn]++
        return oldFn.apply(ext, arguments)
      }
    })
  }
  return gl
}

tape('vertex array object created when attributes given', function (t) {
  var gl = spyExtension(createContext(16, 16))
  var config = createConfig(gl, {extensions: [EXTENSION_NAME]})
  var regl = createREGL(config)
  var ext = wrapExtensions(gl, config)
  var vaoState = wrapVAOState(gl, ext.extensions, regl.stats, {})

  t.assert('boolean', typeof vaoState.hasSupport, 'vaoState.hasSupport is boolean')

  reset()

  if (vaoState.hasSupport === false) {
    t.skip('vaoState.hasSupport is false')
    end()
    return
  }

  test()
  end()

  function end () {
    regl.destroy()
    if (vaoState.hasSupport) {
      t.assert(vaoFunctions.deleteVertexArrayOES === 1,
               'deleteVertexArray called once')
      t.assert(regl.stats.vaoCount === 0,
               'regl.stats.vaoCount is 0 after destruction.')
    }
    createContext.destroy(gl)
    cleanup(gl)
    t.end()
  }

  function test () {
    var frag = [
      'precision mediump float;',
      'void main() {',
      'gl_FragColor = vec4(1, 1, 1, 1);',
      '}'
    ].join('\n')

    var vert = [
      'precision mediump float;',
      'attribute vec3 position;',
      'void main() {',
      'gl_Position = vec4(position, 1.0);',
      '}'
    ].join('\n')

    t.assert(Object.keys(vaoFunctions).every(function (key) {
      return vaoFunctions[key] === 0
    }), 'no vertex array object function should have been called')

    t.assert(regl.stats.vaoCount === 0,
             'no vertex array objects should be created')

    var commandWithAttribute = regl({
      vert: vert,
      frag: frag,
      count: 3,
      attributes: {
        position: [
          [-1.0, -0.5 * Math.sqrt(3), 0.0],
          [1.0, -0.5 * Math.sqrt(3), 0.0],
          [0.0, 0.5 * Math.sqrt(3), 0.0]
        ]
      }
    })

    t.assert(regl.stats.vaoCount === 1,
             'one vertex array objects should be created')

    regl.clear({color: [0, 0, 0, 0]})
    commandWithAttribute()
    t.assert(vaoFunctions.bindVertexArrayOES === 1,
             'bindVertexArray called once')
  }
})

tape('vertex array object never created when attributes are not given', function (t) {
  var gl = spyExtension(createContext(16, 16))
  var config = createConfig(gl, {extensions: [EXTENSION_NAME]})
  var regl = createREGL(config)
  var ext = wrapExtensions(gl, config)
  var vaoState = wrapVAOState(gl, ext.extensions, regl.stats, {})

  t.assert('boolean', typeof vaoState.hasSupport)

  reset()

  if (vaoState.hasSupport === false) {
    t.skip('vaoState.hasSupport is false')
    end()
    return
  }

  test()
  end()

  function end () {
    regl.destroy()
    if (vaoState.hasSupport) {
      t.assert(vaoFunctions.deleteVertexArrayOES === 0,
               'deleteVertexArray never called')
      t.assert(regl.stats.vaoCount === 0,
               'regl.stats.vaoCount is 0 after destruction.')
    }
    cleanup(gl)
    createContext.destroy(gl)
    t.end()
  }

  function test () {
    t.assert(Object.keys(vaoFunctions).every(function (key) {
      return vaoFunctions[key] === 0
    }), 'no vertex array object function should have been called')

    t.assert(regl.stats.vaoCount === 0,
             'no vertex array objects should be created')

    var commandWithOutAttributes = regl({
      context: {
        noop: function () {}
      }
    })

    t.assert(regl.stats.vaoCount === 0,
             'no vertex array objects should be created with out attributes.')

    regl.clear({color: [0, 0, 0, 0]})
    commandWithOutAttributes(function () { })
  }
})
