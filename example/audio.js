/* global AudioContext */
const regl = require('../regl')()
const perspective = require('gl-mat4/perspective')
const lookAt = require('gl-mat4/lookAt')

const N = 512

require('resl')({
  manifest: {
    song: {
      type: 'audio',
      src: 'assets/8bitpeoples-bamboo-cactus.mp3',
      stream: true
    }
  },

  onDone: ({song}) => {
    const context = new AudioContext()
    const source = context.createMediaElementSource(song)
    const analyser = context.createAnalyser()
    source.connect(analyser)
    source.connect(context.destination)

    song.play()

    const terrainData = new Uint8Array(N * N)
    terrainData.fill(128)
    const terrainTexture = regl.texture()

    const drawTerrain = regl({
      vert: `
      precision highp float;

      #define N float(${N})
      #define WEIGHT1 vec4(-1.0, 8.0, -8.0, 1.0)
      #define WEIGHT2 vec4(-1.0, 16.0, 16.0, -1.0)

      attribute vec2 vertId;

      uniform mat4 projection, view;
      uniform float offsetRow;
      uniform sampler2D terrain;

      varying vec3 grad;
      varying float curvature;

      float f(vec2 x) {
        return 0.5 * texture2D(terrain, x + vec2(0.0, offsetRow / N)).r;
      }

      vec4 stencil(vec2 x, vec2 d) {
        return vec4(
          f(x - 2.0 * d),
          f(x - d),
          f(x + d),
          f(x + 2.0 * d));
      }

      void main () {
        vec2 uv = vertId / N;

        float h0 = f(uv);
        vec4 hx = stencil(uv, vec2(1.0 / N, 0.0));
        vec4 hy = stencil(uv, vec2(0.0, 1.0 / N));

        grad = normalize(vec3(
          dot(WEIGHT1, hx),
          dot(WEIGHT1, hy),
          1.0));

        curvature =
          max((dot(WEIGHT2, hx) - 30.0 * h0),
              (dot(WEIGHT2, hy) - 30.0 * h0));

        gl_Position = projection * view * vec4(uv, h0, 1);
      }`,

      frag: `
      precision highp float;

      uniform vec3 lightDir;
      uniform vec3 color;

      varying vec3 grad;
      varying float curvature;

      void main () {
        float ao = max(1.0 - 0.8 * max(curvature, 0.0), 0.25);
        float light = ao;
        gl_FragColor = vec4(light * color, 1);
      }`,

      attributes: {
        vertId: Array(N * N).fill().map((_, i) => {
          const x = Math.floor(i / N)
          const y = i % N
          return [
            x, y,
            x + 1, y,
            x, y + 1,
            x, y + 1,
            x + 1, y + 1,
            x + 1, y
          ]
        })
      },

      uniforms: {
        offsetRow: ({count}) => count % N,
        terrain: terrainTexture,
        projection: ({viewportWidth, viewportHeight}) =>
          perspective([],
            Math.PI / 8,
            viewportWidth / viewportHeight,
            0.01,
            1000),
        view: ({count}) =>
          lookAt([],
            [0.5, 0, 0.6],
            [0.5, 1, 0],
            [0, 0, 1]),
        lightDir: [-1, -1, 1],
        color: [0.6, 0.4, 1.0]
      },

      count: N * N * 6
    })

    regl.frame(({count}) => {
      const offsetRow = count % N

      // Clear background
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })

      // Update texture
      analyser.getByteTimeDomainData(
        terrainData.subarray(offsetRow * N, (offsetRow + 1) * N))
      terrainTexture({
        mag: 'linear',
        min: 'linear',
        wrap: 'repeat',
        shape: [N, N, 1],
        data: terrainData
      })

      // Render terrain
      drawTerrain()
    })
  }
})
