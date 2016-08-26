/*
  tags: gpgpu, advanced

  <p>No description.</p>

 */

const regl = require('../regl')({
  extensions: ['webgl_draw_buffers', 'oes_texture_float']
})
const mouse = require('mouse-change')()

const VERTEX_TEXTURE_SIZE = 64

const EDGE_LENGTH = 0.5 / VERTEX_TEXTURE_SIZE
const EDGE_STIFFNESS = 0.08

const FIELD_RES = 1024
const BLUR_RADIUS = 16
const BLUR_PASSES = 2
const DT = 0.0001
const DAMPING = 0.98
const FIELD_STRENGTH = 0.05
const MOUSE_SIZE = 32

function vertexIndex (v) {
  return [ v % VERTEX_TEXTURE_SIZE, (v / VERTEX_TEXTURE_SIZE) | 0 ]
}

function indexVertex (i, j) {
  return i + j * VERTEX_TEXTURE_SIZE
}

// Initialize vertex data
const VERTEX_COUNT = VERTEX_TEXTURE_SIZE * VERTEX_TEXTURE_SIZE
const VERTEX_STATE_DATA = new Float32Array(4 * VERTEX_COUNT)
const VERTEX_IDS = new Float32Array(2 * VERTEX_COUNT)
;(() => {
  for (let i = 0; i < VERTEX_TEXTURE_SIZE; ++i) {
    for (let j = 0; j < VERTEX_TEXTURE_SIZE; ++j) {
      const ptr = VERTEX_TEXTURE_SIZE * i + j
      VERTEX_IDS[2 * ptr] = i / VERTEX_TEXTURE_SIZE
      VERTEX_IDS[2 * ptr + 1] = j / VERTEX_TEXTURE_SIZE

      // Initial configuration of vertices
      VERTEX_STATE_DATA[4 * ptr] = Math.random()
      VERTEX_STATE_DATA[4 * ptr + 1] = Math.random()
    }
  }
})()
const VERTEX_ID_BUFFER = regl.buffer(VERTEX_IDS)
const VERTEX_STATE = [
  regl.framebuffer({
    color: regl.texture({
      radius: VERTEX_TEXTURE_SIZE,
      data: VERTEX_STATE_DATA,
      type: 'float'
    }),
    depthStencil: false
  }),
  regl.framebuffer({
    radius: VERTEX_TEXTURE_SIZE,
    colorType: 'float',
    depthStencil: false
  })
]

// Initialize edges
const ARCS = []
;(() => {
  function edge (si, sj, ti, tj) {
    const s = indexVertex(si, sj)
    const t = indexVertex(ti, tj)
    ARCS.push([s, t], [t, s])
  }
  for (let i = 0; i < VERTEX_TEXTURE_SIZE; ++i) {
    for (let j = 0; j < VERTEX_TEXTURE_SIZE; ++j) {
      if (i < VERTEX_TEXTURE_SIZE - 1) {
        edge(i, j, i + 1, j)
      }
      if (j < VERTEX_TEXTURE_SIZE - 1) {
        edge(i, j, i, j + 1)
      }
    }
  }
})()

// Initialize fields
const FIELDS = [
  regl.framebuffer({
    color: regl.texture({
      type: 'float',
      wrap: 'repeat',
      radius: FIELD_RES
    }),
    depthStencil: false
  }),
  regl.framebuffer({
    color: regl.texture({
      type: 'float',
      wrap: 'repeat',
      radius: FIELD_RES
    }),
    depthStencil: false
  })
]

// ------------------------------------
// Potential field computation
// ------------------------------------
const setFBO = regl({
  framebuffer: regl.prop('framebuffer')
})

const splatVerts = regl({
  vert: `
  precision highp float;
  attribute vec2 id;
  uniform sampler2D vertexState;
  void main () {
    vec4 state = texture2D(vertexState, id);
    gl_Position = vec4(2.0 * fract(state.xy) - 1.0, 0, 1);
  }`,

  frag: `
  precision highp float;
  void main () {
    gl_FragColor = vec4(1, 0, 0, 0);
  }`,

  attributes: {
    id: VERTEX_ID_BUFFER
  },
  uniforms: {
    vertexState: regl.prop('vertexState')
  },
  blend: {
    enable: true,
    func: {
      src: 1,
      dst: 1
    },
    equation: 'add'
  },
  depth: {enable: false, mask: false},
  primitive: 'points',
  count: VERTEX_COUNT,
  elements: null
})

const blurPass = regl({
  framebuffer: regl.prop('dest'),

  vert: `
  precision highp float;
  attribute vec2 p;
  varying vec2 uv;
  void main () {
    uv = 0.5 * (p + 1.0);
    gl_Position = vec4(p, 0, 1);
  }`,

  frag: `
  precision highp float;
  uniform sampler2D src;
  uniform vec2 axis;
  varying vec2 uv;
  void main () {
    float f = 0.0;
    for (int i = -${BLUR_RADIUS}; i <= ${BLUR_RADIUS}; ++i) {
      f += (${BLUR_RADIUS + 1}.0 - abs(float(i))) / ${2 * BLUR_RADIUS + 1}.0 *
          texture2D(src, axis * float(i) + uv).r;
    }
    gl_FragColor = vec4(f, 0, 0, 1);
  }`,

  attributes: {
    p: [ -4, 0, 4, 4, 4, -4 ]
  },
  uniforms: {
    src: (context, props) => {
      return props.src
    },
    axis: (context, props) => {
      let result = [0, 0]
      result[props.axis] = 1.0 / FIELD_RES
      return result
    }
  },
  depth: {enable: false, mask: false},
  count: 3
})

const gradPass = regl({
  framebuffer: regl.prop('dest'),

  vert: `
  precision highp float;
  attribute vec2 p;
  varying vec2 uv;
  void main () {
    uv = 0.5 * (p + 1.0);
    gl_Position = vec4(p, 0, 1);
  }`,

  frag: `
  precision highp float;
  uniform sampler2D src;
  uniform vec2 deriv;
  varying vec2 uv;
  void main () {
    float f01 = texture2D(src, uv - vec2(deriv.x, 0)).x;
    float f21 = texture2D(src, uv + vec2(deriv.x, 0)).x;
    float f10 = texture2D(src, uv - vec2(0, deriv.y)).x;
    float f12 = texture2D(src, uv + vec2(0, deriv.y)).x;
    gl_FragColor = vec4(f21 - f01, f12 - f10, 0, 1);
  }`,

  attributes: {
    p: [ -4, 0, 4, 4, 4, -4 ]
  },
  uniforms: {
    src: regl.prop('src'),
    deriv: (context, props) => {
      return [1 / props.src.width, 1 / props.src.height]
    }
  },
  depth: {enable: false, mask: false},
  count: 3
})

const applySpringForces = regl({
  framebuffer: regl.prop('dest'),

  vert: `
  precision highp float;
  attribute vec4 edge;
  varying vec2 force;
  uniform sampler2D vertexState;
  uniform float restLength, stiffness;
  void main () {
    vec4 s0 = texture2D(vertexState, edge.rg);
    vec4 s1 = texture2D(vertexState, edge.ba);
    vec2 d = s1.xy - s0.xy;
    float l = max(length(d), 0.001);
    force = stiffness * log(l / restLength) * d / l;
    gl_Position = vec4(2.0 * edge.xy - 1.0 + 1.0 / ${VERTEX_TEXTURE_SIZE}.0, 0, 1);
  }`,

  frag: `
  precision highp float;
  varying vec2 force;
  void main () {
    gl_FragColor = vec4(0, 0, force);
  }`,

  attributes: {
    edge: ARCS.map((arc) => {
      const ps = vertexIndex(arc[0])
      const pt = vertexIndex(arc[1])
      return [
        ps[0] / VERTEX_TEXTURE_SIZE,
        ps[1] / VERTEX_TEXTURE_SIZE,
        pt[0] / VERTEX_TEXTURE_SIZE,
        pt[1] / VERTEX_TEXTURE_SIZE
      ]
    })
  },

  uniforms: {
    vertexState: regl.prop('src'),
    restLength: EDGE_LENGTH,
    stiffness: EDGE_STIFFNESS
  },

  blend: {
    enable: true,
    func: {
      src: 1,
      dst: 1
    },
    equation: 'add'
  },
  depth: {enable: false, mask: false},
  count: ARCS.length,
  primitive: 'points'
})

// ------------------------------------
// Vertex advection
// ------------------------------------
const integrateVerts = regl({
  framebuffer: regl.prop('dest'),

  vert: `
  precision highp float;
  attribute vec2 p;
  varying vec2 id;
  void main () {
    id = 0.5 * (p + 1.0);
    gl_Position = vec4(p, 0, 1);
  }`,

  frag: `
  precision highp float;
  uniform sampler2D vertexState, field;
  uniform float temperature, t;
  varying vec2 id;

  float rnd (vec2 co) {
  	return fract(sin(t*0.1+dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
  }

  void main () {
    vec4 state = texture2D(vertexState, id);
    vec2 p = state.rg;
    vec2 v = state.ba;
    vec2 force = texture2D(field, p).xy;
    p += ${DT} * v;
    v = float(${DAMPING}) * (v - float(${FIELD_STRENGTH}) * force);
    vec2 jitter = vec2(rnd(id), rnd(id + 1000.0)) - 0.5;
    gl_FragColor = vec4(p + temperature * jitter, v);
  }`,
  attributes: {
    p: [-4, 0, 4, -4, 4, 4]
  },
  uniforms: {
    vertexState: regl.prop('src'),
    field: regl.prop('field'),
    temperature: ({tick}) => 1.0 / (0.5 * tick + 20.0),
    t: regl.context('tick')
  },
  count: 3
})

const renderPoints = regl({
  vert: `
  precision highp float;
  attribute vec2 id;
  uniform sampler2D vertexState;
  void main () {
    vec4 state = texture2D(vertexState, id);
    gl_PointSize = 2.0;
    gl_Position = vec4(2.0 * fract(state.xy) - 1.0, 0, 1);
  }`,

  frag: `
  precision highp float;
  void main () {
    gl_FragColor = vec4(0, 0, 0, 1);
  }`,

  attributes: {
    id: VERTEX_ID_BUFFER
  },
  uniforms: {
    vertexState: ({tick}) => VERTEX_STATE[tick % 2]
  },
  depth: {enable: false, mask: false},
  primitive: 'points',
  count: VERTEX_COUNT,
  elements: null
})

var lineWidth = 2
if (lineWidth > regl.limits.lineWidthDims[1]) {
  lineWidth = regl.limits.lineWidthDims[1]
}

const renderEdges = regl({
  vert: `
  precision highp float;
  attribute vec4 id;
  attribute float arcDir;
  uniform float dir;
  uniform sampler2D vertexState;
  void main () {
    float side = arcDir + dir - 2.0 * dir * arcDir;
    vec2 s0 = texture2D(vertexState, id.rg).xy;
    vec2 s1 = texture2D(vertexState, id.ba).xy;
    vec2 shift = mix(fract(s0) - s0, fract(s1) - s1, side);
    gl_Position = vec4(2.0 * (s0.xy + shift) - 1.0, 0, 1);
  }`,

  frag: `
  void main () {
    gl_FragColor = vec4(0.1, 0, 1, 1);
  }`,

  attributes: {
    id: ARCS.map((arc) => {
      const s = vertexIndex(arc[0])
      const t = vertexIndex(arc[1])
      return [
        s[0] / VERTEX_TEXTURE_SIZE,
        s[1] / VERTEX_TEXTURE_SIZE,
        t[0] / VERTEX_TEXTURE_SIZE,
        t[1] / VERTEX_TEXTURE_SIZE
      ]
    }),
    arcDir: ARCS.map((arc, i) => i % 2)
  },
  uniforms: {
    vertexState: ({tick}) => VERTEX_STATE[tick % 2],
    dir: regl.prop('dir')
  },
  depth: {enable: false, mask: false},
  count: ARCS.length,
  primitive: 'lines',
  lineWidth: lineWidth
})

const splatMouse = regl({
  vert: `
  uniform vec2 mouse;
  attribute float p;
  void main () {
    gl_PointSize = ${MOUSE_SIZE}.0;
    gl_Position = vec4(mouse, p, 1);
  }`,
  frag: `
  precision highp float;
  uniform float strength;
  void main () {
    float s = strength * exp(-16.0 * dot(gl_PointCoord.xy, gl_PointCoord.xy));
    gl_FragColor = vec4(s, 0, 0, 1);
  }`,
  attributes: { p: [0] },
  uniforms: {
    mouse: ({drawingBufferWidth, drawingBufferHeight, pixelRatio}) => [
      2.0 * pixelRatio * mouse.x / drawingBufferWidth - 1.0,
      1.0 - 2.0 * pixelRatio * mouse.y / drawingBufferHeight
    ],
    strength: () => mouse.buttons ? 5.0 : 1.0
  },
  count: 1,
  primitive: 'points'
})

// Main integration loop
function step ({tick}) {
  setFBO({ framebuffer: FIELDS[0] }, () => {
    regl.clear({ color: [0, 0, 0, 1] })
    splatMouse()
    splatVerts({
      vertexState: VERTEX_STATE[(tick + 1) % 2]
    })
  })
  for (let i = 0; i < 2 * BLUR_PASSES; ++i) {
    blurPass({
      dest: FIELDS[(i + 1) % 2],
      src: FIELDS[i % 2],
      axis: (i % 2)
    })
  }
  gradPass({
    dest: FIELDS[1],
    src: FIELDS[0]
  })
  applySpringForces({
    dest: VERTEX_STATE[(tick + 1) % 2],
    src: VERTEX_STATE[tick % 2]
  })
  integrateVerts({
    dest: VERTEX_STATE[tick % 2],
    src: VERTEX_STATE[(tick + 1) % 2],
    field: FIELDS[1]
  })
}

regl.frame((context) => {
  step(context)
  regl.clear({
    color: [1, 1, 1, 1]
  })
  renderEdges([{dir: 0}, {dir: 1}])
  renderPoints()
})
