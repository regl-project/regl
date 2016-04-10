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


for (let lod = 1; lod <= NUM_LODS; ++lod) {
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

const lodBuffers = lodPositions.map(regl.buffer)

const drawBunny = regl({
  vert: `
  precision mediump float;

  attribute vec3 p0, p1;

  uniform mat4 view, projection;
  uniform float lod;

  void main () {
    vec3 position = mix(p0, p1, lod);
    gl_Position = projection * view * vec4(position, 1);
  }`,

  frag: `
  precision mediump float;

  void main() {
    gl_FragColor = vec4(1, 1, 1, 1);
  }`,

  attributes: {
    p0: ({lod}) => lodBuffers[Math.floor(lod)],
    p1: ({lod}) => lodBuffers[Math.ceil(lod)]
  },

  elements: regl.elements(lodCells),

  uniforms: {
    view: (args, batchId, stats) => {
      var t = 0.004 * stats.count
      return mat4.lookAt([],
        [20 * Math.cos(t), 6, 20 * Math.sin(t)],
        [0, 2.5, 0],
        [0, 1, 0])
    },
    projection: (args, batchId, stats) => {
      return mat4.perspective([],
        Math.PI / 4,
        stats.width / stats.height,
        0.01,
        1000)
    },
    lod: ({lod}) => lod - Math.floor(lod)
  },

  lineWidth: 1,
  count: ({lod}) => 2 * lodOffsets[Math.floor(lod)]
})

regl.frame(count => {
  regl.clear({
    depth: 1,
    color: [0, 0, 0, 1]
  })

  drawBunny({
    lod: Math.min(NUM_LODS, Math.max(0,
      0.5 * NUM_LODS * (1 + Math.cos(0.003 * count))))
  })
})
