const regl = require('../regl')()
var seedrandom = require('seedrandom')

function cpuReduce (data, op) {
  var result = op(data[0], data[1])
  for (var i = 3; i < data.length; i++) {
    result = op(result, data[i])
  }
  return result
}

function gpuReduce (data, op) {
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
      rcpDim: regl.prop('rcpDim')
    },

    framebuffer: regl.prop('outFbo'),

    count: 3
  })

  var textureData = []
  var i
  for (i = 0; i < data.length; i++) {
    var g = data[i]
    textureData.push(g, g, g, g)
  }

  // dimensions of the first texture is dimXdim.
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
/*
    regl({framebuffer: inFbo})(() => {
      console.log('done: ', regl.read())
    })*/

//    console.log('tex: ', inFbo.color[0])

    reducePass({inTex: inFbo.color[0], outFbo: outFbo, rcpDim: 1.0 / (outFbo.width * 2)})
  }

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
