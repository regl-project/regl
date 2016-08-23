/*
  tags: advanced

  <p>This example demonstrates rendering screen space projected lines
  from a technique described <a href="https://mattdesl.svbtle.com/drawing-lines-is-hard">here</a>.</p>

  <p>This technique requires each vertex to reference the previous and next vertex in the line;
  this example utilizes attribute byte offsets to share a single position buffer for all three
  of these attributes.</p>
*/
const createRegl = require('../regl')
const mat4 = require('gl-mat4')
const createCamera = require('canvas-orbit-camera')
const fit = require('canvas-fit')

const { push, unshift } = Array.prototype

const geometry = {
  polarCurve (buffer, howMany, polarFn) {
    const thetaMax = Math.PI * 2
    for (let i = 0; i < howMany; i++) {
      const theta = i / (howMany - 1) * thetaMax
      const radius = polarFn(theta, i)
      const x = Math.cos(theta) * radius
      const y = Math.sin(theta) * radius
      buffer.push(x, y, 0)
    }
    return buffer
  }
}

const links = {
  lineMesh (buffer, howMany, index) {
    for (let i = 0; i < howMany - 1; i++) {
      const a = index + i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      buffer.push(
        a, b, c,
        c, b, d)
    }
    return buffer
  }
}

const buffer = {
  duplicate (buffer, stride, dupScale) {
    if (stride == null) stride = 1
    if (dupScale == null) dupScale = 1
    const out = []
    const component = new Array(stride * 2)
    for (let i = 0, il = buffer.length / stride; i < il; i++) {
      const index = i * stride
      for (let j = 0; j < stride; j++) {
        const value = buffer[index + j]
        component[j] = value
        component[j + stride] = value * dupScale
      }
      push.apply(out, component)
    }
    return out
  },

  mapElement (buffer, elementIndex, stride, map) {
    for (let i = 0, il = buffer.length / stride; i < il; i++) {
      const index = elementIndex + i * stride
      buffer[index] = map(buffer[index], index, i)
    }
    return buffer
  },

  pushElement (buffer, elementIndex, stride) {
    const component = new Array(stride)
    const ai = elementIndex * stride
    for (let i = 0; i < stride; i++) {
      component[i] = buffer[ai + i]
    }
    push.apply(buffer, component)
    return buffer
  },

  unshiftElement (buffer, elementIndex, stride) {
    const component = new Array(stride)
    const ai = elementIndex * stride
    for (let i = 0; i < stride; i++) {
      component[i] = buffer[ai + i]
    }
    unshift.apply(buffer, component)
    return buffer
  }
}

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT

const canvas = document.createElement('canvas')
const regl = createRegl(canvas)
const camera = createCamera(canvas)

const POINTS = 200
const POINTS_TOTAL = POINTS + 2
const curve = geometry.polarCurve([], POINTS,
  (t) => Math.sin(2.5 * t) * 20)

const positions = curve.slice()
buffer.mapElement(positions, 2, 3, (v, a, i) => (i / POINTS - 0.5) * 20)
buffer.pushElement(positions, 0, 3)
buffer.unshiftElement(positions, POINTS - 1, 3)

const offset = new Array(POINTS)
  .fill(1)
  .map((v, i) => (i + 1) / POINTS)

const positionsDupSource = new Float32Array(buffer.duplicate(positions, 3))
const positionsDup = new Float32Array(positionsDupSource)
const offsetDup = buffer.duplicate(offset, 1, -1)
const indices = links.lineMesh([], POINTS, 0)

const positionBuffer = regl.buffer({
  usage: 'dynamic',
  type: 'float',
  length: POINTS_TOTAL * 2 * 3 * FLOAT_BYTES
})
const offsetBuffer = regl.buffer({
  usage: 'static',
  type: 'float',
  length: POINTS_TOTAL * 2 * 1 * FLOAT_BYTES,
  data: offsetDup
})

const attributes = {
  prevPosition: {
    buffer: positionBuffer,
    offset: 0,
    stride: FLOAT_BYTES * 3
  },
  currPosition: {
    buffer: positionBuffer,
    offset: FLOAT_BYTES * 3 * 2,
    stride: FLOAT_BYTES * 3
  },
  nextPosition: {
    buffer: positionBuffer,
    offset: FLOAT_BYTES * 3 * 4,
    stride: FLOAT_BYTES * 3
  },
  offsetScale: offsetBuffer
}

const uniforms = {
  projection: ({viewportWidth, viewportHeight}) => (
    mat4.perspective([],
      Math.PI / 2,
      viewportWidth / viewportHeight,
      0.01,
      1000)
  ),
  model: mat4.identity([]),
  view: () => camera.view(),
  aspect: ({viewportWidth, viewportHeight}) => (
    viewportWidth / viewportHeight
  ),

  color: [0.8, 0.5, 0, 1],
  thickness: 1,
  miter: 0
}

const elements = regl.elements({
  primitive: 'triangles',
  usage: 'static',
  type: 'uint16',
  data: indices
})

// Vertex shader from https://mattdesl.svbtle.com/drawing-lines-is-hard
// The MIT License (MIT) Copyright (c) 2015 Matt DesLauriers
const vert = `
uniform mat4 projection;
uniform mat4 model;
uniform mat4 view;
uniform float aspect;

uniform float thickness;
uniform int miter;

attribute vec3 prevPosition;
attribute vec3 currPosition;
attribute vec3 nextPosition;
attribute float offsetScale;

void main() {
  vec2 aspectVec = vec2(aspect, 1.0);
  mat4 projViewModel = projection * view * model;
  vec4 prevProjected = projViewModel * vec4(prevPosition, 1.0);
  vec4 currProjected = projViewModel * vec4(currPosition, 1.0);
  vec4 nextProjected = projViewModel * vec4(nextPosition, 1.0);

  // get 2D screen space with W divide and aspect correction
  vec2 prevScreen = prevProjected.xy / prevProjected.w * aspectVec;
  vec2 currScreen = currProjected.xy / currProjected.w * aspectVec;
  vec2 nextScreen = nextProjected.xy / nextProjected.w * aspectVec;

  float len = thickness;

  // starting point uses (next - current)
  vec2 dir = vec2(0.0);
  if (currScreen == prevScreen) {
    dir = normalize(nextScreen - currScreen);
  }
  // ending point uses (current - previous)
  else if (currScreen == nextScreen) {
    dir = normalize(currScreen - prevScreen);
  }
  // somewhere in middle, needs a join
  else {
    // get directions from (C - B) and (B - A)
    vec2 dirA = normalize((currScreen - prevScreen));
    if (miter == 1) {
      vec2 dirB = normalize((nextScreen - currScreen));
      // now compute the miter join normal and length
      vec2 tangent = normalize(dirA + dirB);
      vec2 perp = vec2(-dirA.y, dirA.x);
      vec2 miter = vec2(-tangent.y, tangent.x);
      dir = tangent;
      len = thickness / dot(miter, perp);
    } else {
      dir = dirA;
    }
  }

  vec2 normal = vec2(-dir.y, dir.x) * thickness;
  normal.x /= aspect;
  vec4 offset = vec4(normal * offsetScale, 0.0, 1.0);
  gl_Position = currProjected + offset;
}`

const frag = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`

const draw = regl({
  attributes,
  uniforms,
  elements,
  vert,
  frag
})

regl.frame(({tick}) => {
  regl.clear({
    color: [0.1, 0.1, 0.1, 1],
    depth: 1
  })
  camera.tick()
  buffer.mapElement(positionsDup, 2, 3, (v, a, i) => {
    const start = positionsDupSource[a]
    const offset = Math.sin(tick * 0.05 + Math.floor(i / 2) * 0.1) * 5
    return start + offset
  })
  positionBuffer.subdata(positionsDup, 0)
  draw()
})

window.addEventListener('resize', fit(canvas), false)
document.body.appendChild(canvas)
