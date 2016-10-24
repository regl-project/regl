var tape = require('tape')
var createContext = require('./util/create-context')
var createREGL = require('../regl')

tape('regl constructor', function (t) {
  // loading from a bad selector string breaks
  t.throws(function () {
    createREGL('a bad selector')
  }, /\(regl\)/, 'constructing from bad selector should throw')

  t.throws(function () {
    createREGL({
      'bad property': 'foo'
    })
  }, /\(regl\)/, 'bad properties throw')

  var regl
  var gl = createContext(2, 2)

  // Check some variations on extension loading
  regl = createREGL(gl)
  t.ok(!!regl, 'construction from context successful')
  regl.destroy()

  regl = createREGL({ gl: gl })
  t.ok(!!regl, 'construction from context options successful')
  regl.destroy()

  regl = createREGL({ gl: gl, pixelRatio: 3 })
  regl.draw(function (context) {
    t.equals(context.pixelRatio, 3, 'pixel ratio ok')
  })
  regl.destroy()

  var callCount = 0
  var input
  regl = createREGL({
    gl: gl,
    onDone: function (err, regl) {
      input = regl
      callCount += 1
      t.ok(!err, 'creation success')
    }
  })
  t.equals(callCount, 1, 'onDone called')
  t.equals(input, regl, 'onDone passes context args ok')
  t.ok(!!regl, 'construction from context options successful')
  regl.destroy()

  // check extension loading works
  var supportedExtensions = gl.getSupportedExtensions()
  var baseREGL = createREGL(gl)
  supportedExtensions.forEach(function (ext) {
    regl = createREGL({
      gl: gl,
      extensions: ext
    })
    t.ok(regl.hasExtension(ext), 'extension loading ' + ext + ' ok')
    regl.destroy()

    regl = createREGL({
      gl: gl,
      optionalExtensions: ext
    })
    t.ok(regl.hasExtension(ext), 'optional extension loading ' + ext + ' ok')
    regl.destroy()

    t.ok(!baseREGL.hasExtension(ext), 'extension not loaded by default')
  })
  baseREGL.destroy()

  // check that bad extensions don't load
  t.throws(function () {
    regl = createREGL({
      gl: gl,
      extensions: 'ext_bogus_extension'
    })
  }, /\(regl\)/, 'hard extension requirements fail predictably')

  callCount = 0
  createREGL({
    gl: gl,
    extensions: 'ext_bogus_extension',
    onDone: function (err, regl) {
      callCount += 1
      t.ok(err, 'hard extension loading fails')
    }
  })
  t.equals(callCount, 1, 'onDone successfully called')

  regl = createREGL({
    gl: gl,
    optionalExtensions: 'ext_bogus_extension'
  })
  t.ok(regl, 'optional extensions are skipped if they fail')
  t.ok(!regl.hasExtension('ext_bogus_extension'),
    'bogus extension not loaded')
  regl.destroy()

  createContext.destroy(gl)

  // failure modes from context loading
  var fakeCanvas = {
    nodeName: 'CANVAS',
    getContext: function () {
      return null
    }
  }

  t.throws(function () {
    regl = createREGL({
      canvas: fakeCanvas
    })
  }, /\(regl\)/, 'context creation fails if webgl not supported')

  callCount = 0
  regl = createREGL({
    canvas: fakeCanvas,
    onDone: function (err, regl) {
      t.ok(err, 'error message ok: ' + err)
      t.ok(!regl, 'fake canvas throws')
    }
  })

  t.ok(!regl, 'webgl detection works')

  if (typeof document !== 'undefined') {
    checkDOM()
  }

  function checkDOM () {
    var canvas = document.createElement('canvas')

    var regl = createREGL({
      canvas: canvas,
      attributes: {
        alpha: false,
        premultipliedAlpha: false,
        stencil: true
      }
    })
    t.equals(regl._gl.canvas, canvas, 'create from canvas ok')
    t.equals(regl.attributes.premultipliedAlpha, false, 'create from attributes ok')
    regl.destroy()

    var container = document.createElement('div')
    regl = createREGL(container)
    t.equals(
      regl._gl.canvas, container.firstChild,
      'appended node successfully')
    t.equals(gl.getError(), 0, 'error ok')
    regl.destroy()
  }

  t.end()
})
