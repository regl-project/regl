const regl = require('../regl')()

const drawDoggie = regl({
  frag: `
  precision mediump float;
  uniform sampler2D texture;
  uniform vec2 screenShape;
  uniform float time;

  varying vec2 uv;

  vec4 background () {
    vec2 pos = 0.5 - gl_FragCoord.xy / screenShape;
    float r = length(pos);
    float theta = atan(pos.y, pos.x);
    return vec4(
      cos(pos.x * time) + sin(pos.y * pos.x * time),
      cos(100.0 * r * cos(0.3 * time) + theta),
      sin(time / r + pos.x * cos(10.0 * time + 3.0)),
      1);
  }

  void main () {
    vec4 color = texture2D(texture, uv);
    float chromakey = step(0.15 + max(color.r, color.b), color.g);
    gl_FragColor = mix(color, background(), chromakey);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main () {
    uv = position;
    gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
  }`,

  attributes: {
    position: regl.buffer([
      -2, 0,
      0, -2,
      2, 2])
  },

  uniforms: {
    texture: regl.texture('doggie-chromakey.ogv'),

    screenShape: function (args, batchId, stats) {
      return [stats.width, stats.height]
    },

    time: function (args, batchId, stats) {
      return 0.01 * stats.count
    }
  },

  count: 3
})

regl.frame(() => {
  drawDoggie()
})
