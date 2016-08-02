/*
  <p> This example shows how to implement shadow volumes. </p>
*/

const c = document.createElement('canvas')
const webglCanvas = document.body.appendChild(c)
var gl = c.getContext('webgl', {
  antialias: true,
  stencil: true
})

const fit = require('canvas-fit')
const mat4 = require('gl-mat4')

const regl = require('../regl')({gl: gl})

window.addEventListener('resize', fit(webglCanvas), false)

var DATA = require('./data.json')

var DIFFUSE_COLOR_RABBIT = [0.8, 0.6, 0.9]
var AMBIENT_COLOR_RABBIT = [0.3, 0.2, 0.3]

var meshBuffer = regl.buffer(DATA.MESH)
var shadowBuffer = regl.buffer(DATA.SHADOW)

const globalScope = regl({
  uniforms: {
    lightDir: ({tick}) => {
      var t = tick * 50.0
      var w = 1.0 / Math.sqrt(2)
      var theta = 0.001 * t
      //return [w * Math.cos(theta), -w, w * Math.sin(theta)]
      return [w * 1.0, -w, w * 0.0]
    },

    camera: ({tick, viewportWidth, viewportHeight}) => {
      /*    var t = tick * 50.0
            var theta = Math.PI * Math.cos(0.000357 * t)
            var c = Math.cos(theta)
            var s = Math.sin(theta)
            return [c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0.5, 1]
      */


      //var proj = mat4.perspective([],
      //  Math.PI / 2,
      //  viewportWidth / viewportHeight,
      //  0.01,
      //                            1000)


      var fovy = Math.PI / 2
      var aspect = viewportWidth / viewportHeight
      var near = 0.1
      var far = 1000.0

      var f = 1.0 / Math.tan(fovy / 2),
          nf = 1 / (near - far);
      var out = []
      out[0] = f / aspect;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = f;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = -1 //(far + near) * nf;
      out[11] = -1
      out[12] = 0;
      out[13] = 0;
      out[14] = -2 * near  //(2 * far * near) * nf;
      out[15] = 0;

      var proj = out

      var view = mat4.lookAt([], [0,2,2], [0,0,0], [0,1,0])
      return mat4.multiply([], proj, view)


    }
  }
})

// ----First pass: Draw mesh, no stencil buffer
const pass1 = regl({
  // use depth-buffer as usual.
  depth: {
    enable: true,
    mask: true,
    func: '<='
  },

  // no stencil buffer
  stencil: {
    enable: false
  },

  // turn on color write
  colorMask: [true, true, true, true]
})

// ---Second pass: Draw to stencil buffer
const pass2 = regl({
  depth: {
    mask: false, // don't write to depth buffer
    enable: true, // but DO use the depth test!
    func: 'less'
  },

  // setup stencil buffer.
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'always',
      ref: 0,
      mask: 0xff
    },
    opBack: {
      fail: 'keep',
      zfail: 'increment wrap',
      pass: 'keep'
    },
    opFront: {
      fail: 'keep',
      zfail: 'decrement wrap',
      pass: 'keep'
    }
  },

  // don't write to color buffer.
  colorMask: [false, false, false, false]
})

// ----Final pass: Draw mesh with shadows
const pass3 = regl({
  depth: {
    mask: false,
    enable: true,
    func: 'lequal'
  },

  // setup stencil buffer.
  stencil: {
    enable: true,
    mask: 0xff,
    func: {
      cmp: 'notequal',
      ref: 0,
      mask: 0xff
    },
    opBack: {
      fail: 'keep',
      zfail: 'keep',
      pass: 'keep'
    },
    opFront: {
      fail: 'keep',
      zfail: 'keep',
      pass: 'keep'
    }
  },

  // don't write to color buffer.
  colorMask: [true, true, true, true]
})

const VERT= `
precision mediump float;
attribute vec3 position;
attribute vec3 normal;

uniform vec3 lightDir;
uniform mat4 camera;

varying float intensity;

void main() {
  intensity = max(-dot(lightDir, normal), 0.0);
  gl_Position = camera * vec4(position, 1);
}
`

const FRAG = `
precision mediump float;

uniform vec3 diffuse;
uniform vec3 ambient;

varying float intensity;

void main() {
  gl_FragColor = vec4(diffuse * intensity + ambient, 1);
}
`


const planeElements = []
var planePosition = []
var planeNormal = []

var s = 100.0
var y = -4.0
planePosition.push([-s, y, -s])
planePosition.push([+s, y, -s])
planePosition.push([-s, y, +s])
planePosition.push([+s, y, +s])

planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])

planeElements.push([3, 1, 0])
planeElements.push([0, 2, 3])

var drawPlane = regl({
  vert: VERT,

  frag: FRAG,

  uniforms: {
    ambient: () => AMBIENT_COLOR_RABBIT,

    diffuse: (_, props) => {
      var intensity = props.intensity
      return [
        intensity * DIFFUSE_COLOR_RABBIT[0],
        intensity * DIFFUSE_COLOR_RABBIT[1],
        intensity * DIFFUSE_COLOR_RABBIT[2]]
    }
  },
  attributes: {
    position: planePosition,
    normal: planeNormal
  },
  elements: planeElements,
  cull: {
    enable: false,
  },
})

const drawRabbit = regl({
  vert: VERT,

  frag: FRAG,

  // this converts the vertices of the mesh into the position attribute
  attributes: {
    position: {
      buffer: meshBuffer,
      offset: 0,
      normalized: false,
      stride: 24,
      size: 3
    },
    normal: {
      buffer: meshBuffer,
      offset: 12,
      normalized: false,
      stride: 24,
      size: 3
    }
  },

  uniforms: {
    ambient: () => AMBIENT_COLOR_RABBIT,

    diffuse: (_, props) => {
      var intensity = props.intensity
      return [
        intensity * DIFFUSE_COLOR_RABBIT[0],
        intensity * DIFFUSE_COLOR_RABBIT[1],
        intensity * DIFFUSE_COLOR_RABBIT[2]]
    }
  },

  count: () => DATA.MESH.length / 6
})

const shadowScope = regl({
  frag: `
  precision mediump float;

  void main() {
    if(gl_FrontFacing) {
      gl_FragColor = vec4(0,1,0,1);
    } else {
      gl_FragColor = vec4(1,0,0,1);
    }
  }
  `
})

const drawShadowSilhoutte = regl({
  vert: `
  precision mediump float;
  attribute vec4 position;
  attribute vec3 normal0, normal1;

  uniform vec3 lightDir;
  uniform mat4 camera;

  void main() {
    if(dot(normal0, lightDir) <= 0.0 &&
       dot(normal1, lightDir) >= 0.0) {
      gl_Position = camera*(position + vec4((1.0-position.w) * lightDir, 0.0));
    } else {
      gl_Position = vec4(0,0,0,0);
    }
  }
  `,

  attributes: {
    position: {
      buffer: shadowBuffer,
      offset: 0,
      normalized: false,
      stride: 40,
      size: 4
    },
    normal0: {
      buffer: shadowBuffer,
      offset: 16,
      normalized: false,
      stride: 40,
      size: 3
    },
    normal1: {
      buffer: shadowBuffer,
      offset: 28,
      normalized: false,
      stride: 40,
      size: 3
    }
  },

  count: () => DATA.SHADOW.length / 10
})

const drawShadowCaps = regl({
  vert: `
  precision mediump float;
  attribute vec3 position, normal;

  uniform vec3 lightDir;
  uniform mat4 camera;

  vec4 extend(vec3 p) {
    vec4 tlightDir = camera * vec4(lightDir,0);
    vec3 light = normalize(tlightDir.xyz);
    vec3 dpos = (1.0 - p) / light;
    vec3 dneg = (vec3(-1.0,-1.0,0.0) - p) / light;
    vec3 dt   = mix(dneg, dpos, step(0.0, light));
    return vec4(0.999 * min(min(dt.x, dt.y), dt.z) * light + p, 1);
  }

  void main() {
    vec4 projected = camera * vec4(position,1);
    if(dot(normal,lightDir) <= 0.0) {
      gl_Position = projected;
    } else {
      gl_Position = extend(projected.xyz/projected.w);
    }
  }
  `,

  attributes: {
    position: {
      buffer: meshBuffer,
      offset: 0,
      normalized: false,
      stride: 24,
      size: 3
    },
    normal: {
      buffer: meshBuffer,
      offset: 12,
      normalized: false,
      stride: 24,
      size: 3
    }
  },

  count: () => DATA.MESH.length / 6
})

regl.frame(() => {
  globalScope(() => {
    regl.clear({depth: 1, color: [0, 0, 0, 1]})
    // ----First pass: Draw mesh, no stencil buffer
    pass1(() => {
      drawRabbit({intensity: 1.0})
    })
    drawPlane({intensity: 1.0})

    pass2(() => {
      regl.clear({stencil: 0})
      shadowScope(() => {
        drawShadowSilhoutte()
        drawShadowCaps()
      })
    })

    pass3(() => {
      drawRabbit({intensity: 0.1})
      drawPlane({intensity: 0.1})

    })
  })
})
