/*
  tags: basic

  <p>This example implements a simple 2D tiled sprite renderer.</p>

 */

const regl = require('../regl')()
const mouse = require('mouse-change')()

require('resl')({
  manifest: {
    map: {
      type: 'text',
      src: 'assets/map.json',
      parser: JSON.parse
    },

    tiles: {
      type: 'image',
      src: 'assets/tiles.png',
      parser: regl.texture
    }
  },

  onDone: ({map, tiles}) => {
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
        tiles,
        tileSize: [16.0, 16.0],
        map: regl.texture(map),
        mapSize: [map[0].length, map.length],
        view: regl.prop('view')
      },

      attributes: {
        position: [ -1, -1, 1, -1, -1, 1, 1, 1, -1, 1, 1, -1 ]
      },

      count: 6
    })

    regl.frame(({viewportWidth, viewportHeight}) => {
      const {x, y} = mouse

      const boxX = map[0].length * x / viewportWidth
      const boxY = map.length * y / viewportHeight
      const boxH = 10
      const boxW = viewportWidth / viewportHeight * boxH

      drawBackground({
        view: [
          boxX - 0.5 * boxW,
          boxY - 0.5 * boxH,
          boxX + 0.5 * boxW,
          boxY + 0.5 * boxH
        ]
      })
    })
  }
})
