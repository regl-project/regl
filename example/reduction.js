/*
  <p>This example implements a parallell reduction algorithm on the GPU. </p>

  <p>Given some elements x0, x1, x2,..., and a binary operator 'op', the parallell reduction
  becomes 'op(x0, op(x1, op(x2,...) ))'. For example, given the elements 4, 2, 4, 1, and the operator '+',
  the parallell reduction will be 11, which is just the sum of the elements. </p>
 */

const regl = require('../regl')()
var seedrandom = require('seedrandom')

/*
  Reduction on the CPU
 */
function cpuReduce (data, op) {
  var result = op(data[0], data[1])
  for (var i = 3; i < data.length; i++) {
    result = op(result, data[i])
  }
  return result
}

/*
  Reduction on the GPU.

  We basically use the technique described in section 37.2 of this article:
  http://http.developer.nvidia.com/GPUGems/gpugems_ch37.html

  The algorithm: We basically start with a texture (A) of size
  (N)x(N). Then we create an FBO (B) of size (N/2)x(N/2). Then we render to FBO (B), and
  every fragment will sample four texels from (A). And by doing so, we will have performed
  a reduction of 2x2 sized blocks.

  Next, we create an FBO (C) of size (N/4)x(N/4), and, like above, we
  to render (C) to while sampling from (B), and so on. We keep going
  until we are left with an FBO of size 1x1. And that single pixel in
  that FBO contains our desired result.

  Note that we are using a texture of type RGBA8 in the below
  implementation. This means that we can't really use '+' as an
  operator for the reduction, since it will easily overflow. This can
  be solved by switching to a texture of type RGBA32F.
  But we are not using that, because it requires an extensions that is not always available.
  So to maximize compability, we use RGBA8 in this demo.
  So if you want to use the below reduce implementation in your own code, you will probably
  have to switch to RGBA32F.

  And to simplify things, we will be making the assumption that data.length will be one the numbers
  1x1, 2x2, 4x4, 8x8, 16x16,...
*/
function gpuReduce (data, op) {
  // a single reduce pass
  var reducePass = regl({
    frag: `
    precision mediump float;
    uniform sampler2D tex;
    varying vec2 uv;
    uniform float rcpDim;

    float op(float a, float b) {
      return ${op};
    }

    void main () {
      float a = texture2D(tex, uv - vec2(0.0, 0.0) * rcpDim).x;
      float b = texture2D(tex, uv - vec2(1.0, 0.0) * rcpDim).x;
      float c = texture2D(tex, uv - vec2(0.0, 1.0) * rcpDim).x;
      float d = texture2D(tex, uv - vec2(1.0, 1.0) * rcpDim).x;

      float result = op(op(a, b), op(c, d));
      gl_FragColor = vec4(result);
    }`,

    vert: `
    precision mediump float;
    attribute vec2 position;
    varying vec2 uv;
    void main () {
      uv = position;
      gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
    }`,

    attributes: {
      position: [-2, 0, 0, -2, 2, 2]
    },

    uniforms: {
      tex: regl.prop('inTex'),
      rcpDim: regl.prop('rcpDim') // reciprocal texture dimensions.
    },

    framebuffer: regl.prop('outFbo'),

    count: 3
  })

  // We must use a texture format of type RGBA. Because you cannot create a single channel FBO of type
  // ALPHA in WebGL.
  var textureData = []
  var i
  for (i = 0; i < data.length; i++) {
    var g = data[i]
    textureData.push(g, g, g, g)
  }

  // dimensions of the first texture is (dim)X(dim).
  var DIM = Math.sqrt(data.length)
  var dim = DIM

  var firstTexture = regl.texture({
    width: dim,
    height: dim,
    data: textureData,
    format: 'rgba',
    type: 'uint8',
    mag: 'nearest',
    min: 'nearest'
  })

  var fbos = []
  do {
    dim >>= 1
    fbos.push(regl.framebuffer({
      colorFormat: 'rgba',
      colorType: 'uint8',
      width: dim,
      height: dim
    }))
  } while (dim > 1)

  // first pass.
  reducePass({inTex: firstTexture, outFbo: fbos[0], rcpDim: 1.0 / (fbos[0].width * 2)})

  // the rest of the passes.
  for (i = 0; i < fbos.length - 1; i++) {
    var inFbo = fbos[i + 0]
    var outFbo = fbos[i + 1]

    reducePass({inTex: inFbo.color[0], outFbo: outFbo, rcpDim: 1.0 / (outFbo.width * 2)})
  }

  // now retrieve the result from the GPU
  var result
  regl({framebuffer: fbos[fbos.length - 1]})(() => {
    result = regl.read()[0]
  })
  return result
}

var seed = 'seed'

for (var j = 0; j < 100; j++) {
  seed += j

  var rng = seedrandom(seed)

  var data = []
  for (var i = 0; i < 512 * 512; i++) {
    data.push(Math.floor(rng() * 255))
  }

  var gpu = gpuReduce(data, 'max(a,b)')
  var cpu = cpuReduce(data, (a, b) => Math.max(a, b))

  if (cpu !== gpu) {
    console.log('FAILED')
    console.log('cpu: ', cpu)
    console.log('gpu: ', gpu)
    console.log('data: ', data)
    break
  }
  if (j % 10 === 0) {
    console.log('j: ', j)
  }
}
console.log('done')
