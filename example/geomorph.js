const regl = require('../regl')()
const mat4 = require('gl-mat4')
const bunny = require('bunny')

// We'll generate 4 refined levels of detail for the bunny mesh
var NUM_LODS = 4

// First we extract the edges from the bunny mesh
const lodCells = bunny.cells.reduce((edges, cell) => {
  edges.push(
    [cell[0], cell[1]],
    [cell[1], cell[2]],
    [cell[2], cell[0]])
  return edges
}, [])

// We initialize the finest level of detail to be just the mesh
const lodPositions = [bunny.positions]
const lodOffsets = [lodCells.length]

// For each level of detail, we cluster the vertices and then move all
// of the non-degenerate cells to the front of the buffer
for (let lod = 1; lod <= NUM_LODS; ++lod) {
  const points = lodPositions[lod - 1]

  // Here we use an exponentially growing bin size, though you could really
  // use whatever you like here as long as it is monotonically increasing
  const binSize = 0.2 * Math.pow(2.2, lod)

  // For the first phase of clustering, we map each vertex into a bin
  const grid = {}
  points.forEach((p, i) => {
    const binId = p.map(x => Math.floor(x / binSize)).join()
    if (binId in grid) {
      grid[binId].push(i)
    } else {
      grid[binId] = [i]
    }
  })

  // Next we iterate over the bins and snap each vertex to the centroid of
  // all vertices in its bin
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

  // Finally we partition the cell array in place so that all non-degenerate
  // cells are moved to the front of the array
  const cellCount = lodOffsets[lod - 1]
  let ptr = 0
  for (let idx = 0; idx < cellCount; ++idx) {
    const cell = lodCells[idx]
    if (snapped[cell[0]] !== snapped[cell[1]]) {
      lodCells[idx] = lodCells[ptr]
      lodCells[ptr++] = cell
    }
  }

  // And we save this offset of the last non degenerate cell so that when we
  // draw at this level of detail we don't waste time drawing degenerate cells
  lodOffsets.push(ptr)
}

// Now that the LODs are computed we upload them to the GPU
const lodBuffers = lodPositions.map(regl.buffer)

// Ok!  It's time to define our command:
const drawBunnyWithLOD = regl({
  vert: `
  precision mediump float;

  // p0 and p1 are the two LOD arrays for this command
  attribute vec3 p0, p1;

  // We use a simplified camera model here without a model matrix
  uniform mat4 view, projection;

  // This parameter is the fractional level
  uniform float lod;

  void main () {
    vec3 position = mix(p0, p1, lod);
    gl_Position = projection * view * vec4(position, 1);
  }`,

  frag: `
  void main() {
    gl_FragColor = vec4(1, 1, 1, 1);
  }`,

  // We take the two LOD attributes directly above and below the current
  // fractional LOD
  attributes: {
    p0: ({lod}) => lodBuffers[Math.floor(lod)],
    p1: ({lod}) => lodBuffers[Math.ceil(lod)]
  },

  // For the elements we use the LOD-orderd array of edges that we computed
  // earlier.  regl automatically infers the primitive type from this data.
  elements: regl.elements(lodCells),

  uniforms: {
    // This is a standard perspective camera
    projection: (args, batchId, stats) => {
      return mat4.perspective([],
        Math.PI / 4,
        stats.width / stats.height,
        0.01,
        1000)
    },

    // We slowly rotate the camera around the center of the bunny
    view: (args, batchId, stats) => {
      var t = 0.004 * stats.count
      return mat4.lookAt([],
        [20 * Math.cos(t), 10, 20 * Math.sin(t)],
        [0, 2.5, 0],
        [0, 1, 0])
    },

    // We set the lod uniform to be the fractional LOD
    lod: ({lod}) => lod - Math.floor(lod)
  },

  // Finally we only draw as many primitives as are present in the finest LOD
  count: ({lod}) => 2 * lodOffsets[Math.floor(lod)]
})

regl.frame(count => {
  regl.clear({
    depth: 1,
    color: [0, 0, 0, 1]
  })

  // To use the LOD draw command, we just pass it an object with the LOD as
  // a single property:
  drawBunnyWithLOD({
    lod: Math.min(NUM_LODS, Math.max(0,
      0.5 * NUM_LODS * (1 + Math.cos(0.003 * count))))
  })
})
