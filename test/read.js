var createContext = require('./util/create-context')
var createREGL = require('../../regl')
var tape = require('tape')

tape('read pixels', function (t) {
  var W = 5
  var H = 5
  var gl = createContext(W, H)
  var regl = createREGL({
    gl: gl,
    optionalExtensions: ['oes_texture_float', 'ext_srgb']
  })

  function checkFBO (pixels, color, name) {
    function checkPixels () {
      for (var i = 0; i < W * H * 4; i += 4) {
        if (pixels[i] !== color[0] ||
            pixels[i + 1] !== color[1] ||
            pixels[i + 2] !== color[2] ||
            pixels[i + 3] !== color[3]) {
          return false
        }
      }
      return true
    }

    t.ok(checkPixels(), name)
  }

  function throws (name, args) {
    t.throws(function () {
      regl.read.apply(regl, args)
    }, /\(regl\)/, name)
  }

  // typedarray input
  var bytes = new Uint8Array(100)
  var result = regl.read(bytes)
  t.equals(result, bytes, 'read typedarray ok')

  // width/height input
  t.equals(regl.read({width: 2, height: 2}).length, 16, 'width/height ok')

  // options input
  t.equals(regl.read({x: 3, y: 3}).length, 16, 'offset ok')

  // read out of bounds
  throws('bad width', [{width: -2}])
  throws('bad height', [{height: -2}])
  throws('bad offset', [{ x: -2 }])
  throws('bad typedarray', [{data: []}])
  throws('small typedarray', [new Uint8Array(1)])

  // check pixels for default framebuffer
  regl.clear({color: [1, 0, 0, 1]})
  var pixels = regl.read()
  checkFBO(pixels, [255, 0, 0, 255], 'read null fbo ok')

  regl.clear({color: [1, 0, 0, 1]})
  pixels = new Uint8Array(W * H * 4)
  regl.read({data: pixels})
  checkFBO(pixels, [255, 0, 0, 255], 'read null fbo, reuse buffer, ok')

  pixels = new Float32Array(W * H * 4)
  throws('throws if attempt use Float32Array to null fbo', [{data: pixels}])
  throws('throws if attempt use object to null fbo', [{data: {}}])

  // now do it for an uint8 fbo
  var fbo = regl.framebuffer({
    width: W,
    height: H,
    colorFormat: 'rgba',
    colorType: 'uint8'
  })
  regl({framebuffer: fbo})(function () {
    regl.clear({color: [1, 0, 0, 1]})
    pixels = regl.read()
    checkFBO(pixels, [255, 0, 0, 255], 'read uint8 fbo ok')
  })

  regl({framebuffer: fbo})(function () {
    regl.clear({color: [1, 0, 0, 1]})
    pixels = new Uint8Array(W * H * 4)
    regl.read({data: pixels})
    checkFBO(pixels, [255, 0, 0, 255], 'read uint8 fbo, reuse buffer, ok')
  })

  regl({framebuffer: fbo})(function () {
    pixels = new Float32Array(W * H * 4)
    throws('throws if attempt use Float32Array to uint8 fbo', [{data: pixels}])
    throws('throws if attempt use object to uint8 fbo', [{data: {}}])
  })

  // now do it for an float fbo
  if (regl.hasExtension('oes_texture_float')) {
    fbo = regl.framebuffer({
      width: W,
      height: H,
      colorFormat: 'rgba',
      colorType: 'float'
    })

    regl({framebuffer: fbo})(function () {
      regl.clear({color: [0.5, 0.25, 0.5, 0.25]})
      pixels = regl.read()
      checkFBO(pixels, [0.5, 0.25, 0.5, 0.25], 'read float fbo ok')
    })

    regl({framebuffer: fbo})(function () {
      regl.clear({color: [0.5, 0.25, 0.5, 0.25]})
      pixels = new Float32Array(W * H * 4)
      regl.read({data: pixels})
      checkFBO(pixels, [0.5, 0.25, 0.5, 0.25], 'read float fbo, reuse buffer, ok')
    })

    regl({framebuffer: fbo})(function () {
      pixels = new Uint8Array(W * H * 4)
      throws('throws if attempt use Uint8Array to float fbo', [{data: pixels}])
      throws('throws if attempt use object to float fbo', [{data: {}}])
    })
  }

  var badTestCases = []
  badTestCases.push('rgba4')
  badTestCases.push('rgb565')
  badTestCases.push('rgb5 a1')
  if (regl.hasExtension('ext_srgb')) {
    badTestCases.push('srgba')
  }

  badTestCases.forEach(function (testCase, i) {
    fbo = regl.framebuffer({
      colorFormat: testCase,
      width: W,
      height: H
    })
    regl({framebuffer: fbo})(function () {
      throws('attempt to read from renderbuffer of type ' + testCase, [{}])
    })
  })

  regl.destroy()
  t.equals(gl.getError(), 0, 'error ok')
  createContext.destroy(gl)
  t.end()
})
