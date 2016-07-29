/* global alert*/

function flatten (data) {
  var result = []
  var dimension = data[0].length
  var ptr = 0
  for (var i = 0; i < data.length; ++i) {
    var v = data[i]
    for (var j = 0; j < dimension; ++j) {
      result[ptr++] = v[j]
    }
  }
  return result
}

var cubePosition = [
  // positive z face.
  [-0.5, +0.5, +0.5],
  [+0.5, +0.5, +0.5],
  [+0.5, -0.5, +0.5],
  [-0.5, -0.5, +0.5],

  // positive x face
  [+0.5, +0.5, +0.5],
  [+0.5, +0.5, -0.5],
  [+0.5, -0.5, -0.5],
  [+0.5, -0.5, +0.5],

  // negative z face
  [+0.5, +0.5, -0.5],
  [-0.5, +0.5, -0.5],
  [-0.5, -0.5, -0.5],
  [+0.5, -0.5, -0.5],

  // negative x face.
  [-0.5, +0.5, -0.5],
  [-0.5, +0.5, +0.5],
  [-0.5, -0.5, +0.5],
  [-0.5, -0.5, -0.5],

  // top face
  [-0.5, +0.5, -0.5],
  [+0.5, +0.5, -0.5],
  [+0.5, +0.5, +0.5],
  [-0.5, +0.5, +0.5],

  // bottom face
  [-0.5, -0.5, -0.5],
  [+0.5, -0.5, -0.5],
  [+0.5, -0.5, +0.5],
  [-0.5, -0.5, +0.5]
]

var cubeUv = [
  // positive z face.
  [0.0, 0.0],
  [1.0, 0.0],
  [1.0, 1.0],
  [0.0, 1.0],

  // positive x face.
  [0.0, 0.0],
  [1.0, 0.0],
  [1.0, 1.0],
  [0.0, 1.0],

  // negative z face.
  [0.0, 0.0],
  [1.0, 0.0],
  [1.0, 1.0],
  [0.0, 1.0],

  // negative x face.
  [0.0, 0.0],
  [1.0, 0.0],
  [1.0, 1.0],
  [0.0, 1.0],

  // top face
  [0.0, 0.0],
  [1.0, 0.0],
  [1.0, 1.0],
  [0.0, 1.0],

  // bottom face
  [0.0, 0.0],
  [1.0, 0.0],
  [1.0, 1.0],
  [0.0, 1.0]
]

var cubeElements = [
  // positive z face.
  [2, 1, 0],
  [2, 0, 3],

  // positive x face.
  [6, 5, 4],
  [6, 4, 7],

  // negative z face.
  [10, 9, 8],
  [10, 8, 11],

  // negative x face.
  [14, 13, 12],
  [14, 12, 15],

  // top face.
  [18, 17, 16],
  [18, 16, 19],

  // bottom face
  [20, 21, 22],
  [23, 20, 22]
]

module.exports = function (gl, canvasWidth, canvasHeight) {
  var cubePositionBuffer
  var cubeUvBuffer
  var cubeElementsBuffers

  var cubeTexture

  var shaderProgram
  var cubePositionAttribute
  var cubeUvAttribute

  var projectionUniformLocation
  var viewUniformLocation

  function initBuffers () {
    cubePositionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer)

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatten(cubePosition)), gl.STATIC_DRAW)

    cubeUvBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeUvBuffer)

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatten(cubeUv)), gl.STATIC_DRAW)

    cubeElementsBuffers = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeElementsBuffers)

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(flatten(cubeElements)), gl.STATIC_DRAW)
  }

  function initTextures () {
    cubeTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, cubeTexture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([
        255, 255, 255, 255,
        128, 128, 128, 255,
        128, 128, 128, 255,
        255, 255, 255, 255
      ]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  }

  function setupScene () {
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.viewport(0, 0, canvasWidth, canvasHeight)

    initShaders()
    initBuffers()
    initTextures()

    // bind buffers.
    gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer)
    gl.enableVertexAttribArray(cubePositionAttribute)
    gl.vertexAttribPointer(cubePositionAttribute, 3, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeUvBuffer)
    gl.enableVertexAttribArray(cubeUvAttribute)
    gl.vertexAttribPointer(cubeUvAttribute, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeElementsBuffers)

    // set texture.
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, cubeTexture)

    // set uniforms
    gl.useProgram(shaderProgram)
    gl.uniform1i(gl.getUniformLocation(shaderProgram, 'tex'), 0)

    var perspectiveMatrix = perspective(Math.PI / 4, canvasWidth / canvasHeight, 0.01, 10.0)
    gl.uniformMatrix4fv(projectionUniformLocation, false, new Float32Array(perspectiveMatrix))
  }

  function drawScene (args) {
    const t = 0.01 * args.tick
    var m = lookAt(
      [5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t)], [0, 0.0, 0], [0, 1, 0])
    gl.uniformMatrix4fv(viewUniformLocation, false, new Float32Array(m))

    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0)
  }

  function initShaders () {
    var vert = `
    precision mediump float;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    uniform mat4 projection, view;
    void main() {
      vUv = uv;
      gl_Position = projection * view * vec4(position, 1);
    }
    `

    var frag = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D tex;
    void main () {
      gl_FragColor = texture2D(tex,vUv*7.0);
    }
    `

    var fragmentShader = getShader(frag, gl.FRAGMENT_SHADER)
    var vertexShader = getShader(vert, gl.VERTEX_SHADER)

    shaderProgram = gl.createProgram()
    gl.attachShader(shaderProgram, vertexShader)
    gl.attachShader(shaderProgram, fragmentShader)
    gl.linkProgram(shaderProgram)

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram))
    }

    gl.useProgram(shaderProgram)
    cubePositionAttribute = gl.getAttribLocation(shaderProgram, 'position')

    cubeUvAttribute = gl.getAttribLocation(shaderProgram, 'uv')

    projectionUniformLocation = gl.getUniformLocation(shaderProgram, 'projection')
    viewUniformLocation = gl.getUniformLocation(shaderProgram, 'view')
  }

  function getShader (sourceCode, type) {
    var shader = gl.createShader(type)

    gl.shaderSource(shader, sourceCode)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader))
      return null
    }

    return shader
  }

  // Taken from gl-mat4
  // https://github.com/stackgl/gl-mat4/blob/master/lookAt.js
  function lookAt (eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len
    var eyex = eye[0]
    var eyey = eye[1]
    var eyez = eye[2]
    var upx = up[0]
    var upy = up[1]
    var upz = up[2]
    var centerx = center[0]
    var centery = center[1]
    var centerz = center[2]

    z0 = eyex - centerx
    z1 = eyey - centery
    z2 = eyez - centerz

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2)
    z0 *= len
    z1 *= len
    z2 *= len

    x0 = upy * z2 - upz * z1
    x1 = upz * z0 - upx * z2
    x2 = upx * z1 - upy * z0
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2)
    if (!len) {
      x0 = 0
      x1 = 0
      x2 = 0
    } else {
      len = 1 / len
      x0 *= len
      x1 *= len
      x2 *= len
    }

    y0 = z1 * x2 - z2 * x1
    y1 = z2 * x0 - z0 * x2
    y2 = z0 * x1 - z1 * x0

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2)
    if (!len) {
      y0 = 0
      y1 = 0
      y2 = 0
    } else {
      len = 1 / len
      y0 *= len
      y1 *= len
      y2 *= len
    }

    return [
      x0, y0, z0, 0,
      x1, y1, z1, 0,
      x2, y2, z2, 0, -(x0 * eyex + x1 * eyey + x2 * eyez), -(y0 * eyex + y1 * eyey + y2 * eyez), -(z0 * eyex + z1 * eyey + z2 * eyez),
      1
    ]
  }

  // Taken from gl-mat4
  // https://github.com/stackgl/gl-mat4/blob/master/perspective.js
  function perspective (fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2)
    var nf = 1 / (near - far)

    return [
      f / aspect, 0.0, 0.0, 0.0,
      0.0, f, 0.0, 0.0,
      0.0, 0.0, (far + near) * nf, -1.0,
      0.0, 0.0, (2 * far * near) * nf, 0.0
    ]
  }

  return {
    proc: drawScene,
    setup: setupScene
  }
}
