/*
  tags: audio, advanced

  <p>This example shows how to implement an audio visualization, using an mp3-file as input.</p>

*/
/* global AudioContext */
const regl = require('../regl')({pixelRatio: 1})
const perspective = require('gl-mat4/perspective')
const lookAt = require('gl-mat4/lookAt')

const N = 256

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

    const terrainTexture = regl.texture({
      data: (new Uint8Array(N * N)).fill(128),
      radius: N,
      channels: 1,
      min: 'linear',
      mag: 'linear',
      wrap: 'repeat'
    })

    const colorTexture = regl.texture({
      width: N / 4,
      height: 1,
      channels: 4,
      min: 'linear',
      mag: 'linear',
      wrap: 'repeat'
    })

    const drawTerrain = regl({
      vert: `
      precision highp float;

      #define N float(${N})
      #define WEIGHT1 vec4(-1.0, 8.0, -8.0, 1.0)
      #define WEIGHT2 vec4(-1.0, 16.0, 16.0, -1.0)

      attribute vec2 vertId;

      uniform float t;
      uniform mat4 projection, view;
      uniform vec3 lightPosition;
      uniform float offsetRow;
      uniform sampler2D terrain, color;

      varying vec3 grad, fragColor, eyeDir, lightDir;
      varying float curvature;

      float f(vec2 x) {
        return 0.025 * pow(texture2D(terrain, x).r, 2.0) *
          (1.0 + 2.5 * pow(texture2D(color, vec2(x.y, 0.0)).a, 3.0));
      }

      vec4 stencil(vec2 x, vec2 d) {
        return vec4(
          f(x - 2.0 * d),
          f(x - d),
          f(x + d),
          f(x + 2.0 * d));
      }

      void main () {
        vec2 uv = (vertId + vec2(0.0, offsetRow)) / N;

        float h0 = f(uv);
        vec4 hx = stencil(uv, vec2(1.0 / N, 0.0));
        vec4 hy = stencil(uv, vec2(0.0, 1.0 / N));

        grad = normalize(vec3(
          dot(WEIGHT1, hx),
          dot(WEIGHT1, hy),
          0.025));

        curvature =
          max(max((dot(WEIGHT2, hx) - 30.0 * h0),
              (dot(WEIGHT2, hy) - 30.0 * h0)), 0.0);

        vec3 pos = vec3(vertId / N, h0 + 0.4);
        lightDir = lightPosition - pos;

        vec4 viewPos = view * vec4(pos, 1);
        gl_Position = projection * viewPos;
        eyeDir = viewPos.xyz / viewPos.w;

        vec3 audioColor = texture2D(color, vec2(uv.y, 0)).rgb;
        float minC = 0.9 * min(min(audioColor.r, audioColor.g), audioColor.b);
        float maxC = max(max(audioColor.r, audioColor.g), audioColor.b);
        fragColor = (audioColor - minC) / (maxC - minC);
      }`,

      frag: `
      precision highp float;

      varying vec3 grad, fragColor, eyeDir, lightDir;
      varying float curvature;

      void main () {
        vec3 N = normalize(grad);
        vec3 V = normalize(eyeDir);
        vec3 L = normalize(lightDir);

        vec3 H = normalize(V + L);

        float ao = 1.0 - curvature;
        float diffuse = max(dot(L, N), 0.0);
        float fresnel = 0.1 + 0.5 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
        float light = 0.25 * ao + 0.8 * diffuse + fresnel;
        gl_FragColor = vec4(light * fragColor, 1);
      }`,

      attributes: {
        vertId: Array(4 * N * N).fill().map((_, i) => {
          const x = 0.5 * Math.floor(i / (2 * N))
          const y = 0.5 * (i % (2 * N))
          return [
            x, y,
            x + 0.5, y,
            x, y + 0.5,
            x, y + 0.5,
            x + 0.5, y + 0.5,
            x + 0.5, y
          ]
        })
      },

      uniforms: {
        offsetRow: ({tick}) => tick % N,
        terrain: terrainTexture,
        projection: ({viewportWidth, viewportHeight}) =>
          perspective([],
            Math.PI / 8,
            viewportWidth / viewportHeight,
            0.01,
            1000),
        view: ({tick}) =>
          lookAt([],
            [ 0.5 + 0.2 * Math.cos(0.001 * tick),
              1,
              0.7 + 0.2 * Math.cos(0.003 * tick + 2.4) ],
            [0.5, 0, 0],
            [0, 0, 1]),
        lightPosition: ({tick}) => [
          0.5 + Math.sin(0.01 * tick),
          1.0 + Math.cos(0.01 * tick),
          1.0 + 0.6 * Math.cos(0.04 * tick) ],
        color: colorTexture,
        t: ({tick}) => 0.01 * tick
      },

      elements: null,
      instances: -1,

      count: 4 * N * N * 6
    })

    const timeSamples = {
      width: N,
      height: 1,
      data: new Uint8Array(N)
    }
    const freqSamples = new Uint8Array(N)
    regl.frame(({tick}) => {
      const offsetRow = tick % N

      // Clear background
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })

      // Update texture
      analyser.getByteTimeDomainData(timeSamples.data)
      terrainTexture.subimage(timeSamples, 0, offsetRow)

      // Update colors
      analyser.getByteFrequencyData(freqSamples)
      colorTexture.subimage(freqSamples)

      // Render terrain
      drawTerrain()
    })
  }
})
