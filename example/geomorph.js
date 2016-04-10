const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')

// Generate LODs for bunny simplicial complex using vertex clustering
var NUM_LODS = 4

const lodCells = bunny.cells.reduce((edges, cell) => {
  edges.push(
    [cell[0], cell[1]],
    [cell[1], cell[2]],
    [cell[2], cell[0]])
  return edges
}, [])
const lodPositions = [bunny.positions]
const lodOffsets = [lodCells.length]


for (let lod = 1; lod < NUM_LODS; ++lod) {
  const points = lodPositions[lod - 1]
  const binSize = 0.1 * Math.pow(2, lod)

  const grid = {}
  points.forEach((p, i) => {
    const binId = p.map(x => Math.floor(x / binSize)).join()
    if (binId in grid) {
      grid[binId].push(i)
    } else {
      grid[binId] = [i]
    }
  })

  const snapped = Array(points.length)
  Object.keys(grid).forEach(binId => {
    const bin = grid[binId]
    const centroid = [0, 0, 0]
    bin.forEach(function (idx) {
      const p = points[idx]
      for (let i = 0; i < 3; ++i) {
        centroid[i] += p[i] / bin.length
      }
    })
    bin.forEach(function (idx) {
      snapped[idx] = centroid
    })
  })
  lodPositions.push(snapped)

  const cellCount = lodOffsets[lod - 1]
  let ptr = 0
  for (let idx = 0; idx < cellCount; ++idx) {
    const cell = lodCells[idx]
    if (snapped[cell[0]] !== snapped[cell[1]]) {
      lodCells[idx] = lodCells[ptr]
      lodCells[ptr++] = cell
    }
  }
  lodOffsets.push(ptr)
}

const drawBunny = regl({
  vert: `
  precision mediump float;

  attribute vec3 p0, p1, p2, p3;

  uniform mat4 view, projection;
  uniform float lod;

  float box (float t) {
    return step(0.0, t) - step(1.0, t);
  }

  void main () {
    vec3 position =
      mix(p0, p1, lod)       * box(lod) +
      mix(p1, p2, lod - 1.0) * box(lod - 1.0) +
      mix(p2, p3, lod - 2.0) * box(lod - 2.0);
    gl_Position = projection * view * vec4(position, 1);
  }`,

  frag: `
  precision mediump float;

  void main() {
    gl_FragColor = vec4(1, 1, 1, 1);
  }`,

  attributes: {
    p0: regl.buffer(lodPositions[0]),
    p1: regl.buffer(lodPositions[1]),
    p2: regl.buffer(lodPositions[2]),
    p3: regl.buffer(lodPositions[3])
  },

  elements: regl.elements(lodCells),

  uniforms: {
    view: function (args, batchId, stats) {
      var t = 0.004 * stats.count
      return mat4.lookAt([],
        [20 * Math.cos(t), 6, 20 * Math.sin(t)],
        [0, 2.5, 0],
        [0, 1, 0])
    },
    projection: function (args, batchId, stats) {
      return mat4.perspective([],
        Math.PI / 4,
        stats.width / stats.height,
        0.01,
        1000)
    },
    lod: regl.prop('lod')
  },

  lineWidth: 1,

  count: function (args) {
    return 2 * lodOffsets[Math.floor(args.lod)]
  }
})

regl.frame(function (count) {
  regl.clear({
    depth: 1,
    color: [0, 0, 0, 1]
  })

  drawBunny({
    lod: Math.min(2.99, Math.max(0, 1.6 * (1 + Math.cos(0.003 * count))))
  })
})
