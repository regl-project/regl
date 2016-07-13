const regl = require('../regl')()

const FIELD_RES = 128
const BLUR_RADIUS = 5
const VERTEX_TEXTURE_SIZE = 32

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
const VERTEX_STATE = regl.framebuffer({
  color: regl.texture({
    radius: VERTEX_TEXTURE_SIZE,
    data: VERTEX_STATE_DATA,
    type: 'float'
  }),
  depthStencil: false
})

// ------------------------------------
// Field computation
// ------------------------------------
const FIELDS = [
  regl.framebuffer({
    radius: FIELD_RES,
    colorType: 'float',
    depthStencil: false
  }),
  regl.framebuffer({
    radius: FIELD_RES,
    colorType: 'float',
    depthStencil: false
  })
]

const setFBO = regl({
  framebuffer: regl.prop('framebuffer')
})

const copyTex = regl({
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
  varying vec2 uv;
  void main () {
    gl_FragColor = texture2D(src, uv);
  }`,

  attributes: {
    p: [ -4, 0, 4, 4, 4, -4 ]
  },

  uniforms: {
    src: regl.prop('texture')
  },

  depth: {enable: false, mask: false},
  count: 3
})

const splatVerts = regl({
  framebuffer: FIELDS[0],

  vert: `
  precision highp float;
  attribute vec2 id;
  uniform sampler2D vertexState;
  void main () {
    vec4 state = texture2D(vertexState, id);
    gl_Position = vec4(0.5 * (state.xy + 1.0), 0, 1);
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
      f += abs(float(i - ${BLUR_RADIUS})) / float(${BLUR_RADIUS}) *
          texture2D(src, axis * float(i) + uv).r;
    }
    gl_FragColor = vec4(f, 0, 0, 1);
  }`,

  attributes: {
    p: [ -4, 0, 4, 4, 4, -4 ]
  },

  uniforms: {
    src: (context, props) => {
      return props.src.color[0]
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

function computeField (vertexState) {
  setFBO({ framebuffer: FIELDS[0] }, () => {
    regl.clear({ color: [1, 0, 0, 1] })
  })
  /*
  splatVerts({
    vertexState: vertexState.color[0]
  })
  */
  /*
  for (let i = 0; i < 2; ++i) {
    blurPass({
      dest: FIELDS[i ^ 1],
      src: FIELDS[i],
      axis: i
    })
  }
  */
  return FIELDS[0]
}

regl.frame((context) => {
  let field = computeField(VERTEX_STATE)

  copyTex({
    texture: field.color[0]
  })
})
