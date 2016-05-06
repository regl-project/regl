const regl = require('../regl')()
const mouse = require('mouse-change')()
const MAP = require('./assets/map.json')

const setupScene = regl({
  attributes: {
    position: regl.buffer([ -1, -1, 1, -1, -1, 1, 1,  1, -1, 1, 1, -1 ])
  },
  uniforms: {
    view: regl.prop('view')
  },
  count: 6
})

const drawBackground = regl({
  frag: `
  precision mediump float;
  uniform sampler2D map, tiles;
  uniform vec2 mapSize, tileSize;
  varying vec2 uv;
  void main() {
    vec2 tileCoord = floor(255.0 * texture2D(map, floor(uv) / mapSize).ra);
    gl_FragColor = texture2D(tiles, (tileCoord + fract(uv)) / tileSize);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform vec4 view;
  varying vec2 uv;
  void main() {
    uv = mix(view.xw, view.zy, 0.5 * (1.0 + position));
    gl_Position = vec4(position, 1, 1);
  }`,

  depth: { enable: false },

  uniforms: {
    tiles: regl.texture('assets/tiles.png'),
    tileSize: [16.0, 16.0],
    map: regl.texture(MAP),
    mapSize: [MAP[0].length, MAP.length]
  }
})

regl.frame(() => {
  const {x, y} = mouse
  const {width, height} = regl.stats

  // Compute size of view box
  const boxX = MAP[0].length * x / width
  const boxY = MAP.length * y / height
  const boxH = 10
  const boxW = width / height * boxH

  setupScene({
    view: [
      boxX - 0.5 * boxW,
      boxY - 0.5 * boxH,
      boxX + 0.5 * boxW,
      boxY + 0.5 * boxH
    ]
  }, () => {
    drawBackground()
  })
})
