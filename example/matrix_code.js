/*
  tags: advanced, fbo, gpgpu, msdf, mrt

  <p>This example is an implementation of the green code seen in The Matrix film and video game franchise.</p>

  <p>This is a simplified version of the Matrix effect found <a href="https://github.com/Rezmason/matrix">here</a>.</p>

  <p>This example demonstrates five concepts:
    <ul>
      <li>Drawing to floating point frame buffer objects, or 'FBO's, for performing computation and post-processing</li>
      <li>GPU-side computation, with a fragment shader updating two alternating FBOs</li>
      <li>Rendering crisp "vector" graphics, with a multiple-channel signed distance field (or 'MSDF')</li>
      <li>Creating a blur/bloom effect from a texture pyramid</li>
      <li>Color mapping with noise, to hide banding</li>
    </ul>
  </p>

*/

const numColumns = 60
const glyphTextureColumns = 8
const glyphSequenceLength = 57
const msdfURL = 'assets/matrix_glyphs_msdf.png'
const paletteURL = 'assets/matrix_palette.png'

document.body.style = 'background-color: black;'
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false })
const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
window.addEventListener('resize', fit(canvas), false)

const regl = require('../regl')({
  canvas,
  extensions: [
    'OES_texture_half_float',
    'OES_texture_half_float_linear'
  ],
  optionalExtensions: [
    // These extensions are also needed, but Safari misreports that they are missing
    'EXT_color_buffer_half_float',
    'WEBGL_color_buffer_float',
    'OES_standard_derivatives'
  ]
})

// These two framebuffers are used to compute the raining code.
// they take turns being the source and destination of the "compute" shader.
// The half float data type is crucial! It lets us store almost any real number,
// whereas the default type limits us to integers between 0 and 255.

// These FBOs are smaller than the screen, because their pixels correspond
// with glyphs in the final image, and the glyphs are much larger than a pixel.
const state = (Array(2)).fill().map(() =>
  regl.framebuffer({
    color: regl.texture({
      radius: numColumns,
      type: 'half float'
    }),
    depthStencil: false
  }))

const makePassTexture = () => regl.texture({
  type: 'half float',
  min: 'linear',
  mag: 'linear'
})

const makePassFBO = () => regl.framebuffer({ color: makePassTexture() })
const makePyramid = height => Array(height).fill().map(makePassFBO)
// A pyramid is just an array of FBOs, where each FBO is half the width
// and half the height of the FBO below it.
const resizePyramid = (pyramid, vw, vh, scale) => pyramid.forEach(
  (fbo, index) => fbo.resize(
    Math.floor(vw * scale / Math.pow(2, index)),
    Math.floor(vh * scale / Math.pow(2, index))
  )
)
const pyramidUniforms = pyramid => {
  const uniforms = {}
  for (let i = 0; i < pyramid.length; i++) {
    uniforms[`tex_${i}`] = pyramid[i]
  }
  return uniforms
}

const pyramidHeight = 5
const renderedFBO = makePassFBO()
const highPassPyramid = makePyramid(pyramidHeight)
const horizontalBlurPyramid = makePyramid(pyramidHeight)
const verticalBlurPyramid = makePyramid(pyramidHeight)
const bloomedFBO = makePassFBO()

const updateRain = regl({
  frag: `
    precision highp float;

    #define PI 3.14159265359
    #define SQRT_2 1.4142135623730951
    #define SQRT_5 2.23606797749979

    uniform float glyphSequenceLength;
    uniform float numColumns;
    uniform float glyphTextureColumns;
    uniform float time;
    uniform sampler2D lastState;

    highp float rand( const in vec2 uv ) {
      const highp float a = 12.9898, b = 78.233, c = 43758.5453;
      highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
      return fract(sin(sn) * c);
    }

    void main()  {

      vec2 uv = gl_FragCoord.xy / numColumns;

      float columnTimeOffset = rand(vec2(gl_FragCoord.x, 0.0));
      float columnSpeedOffset = rand(vec2(gl_FragCoord.x + 0.1, 0.0));

      vec4 data = texture2D( lastState, uv );

      if (length(data) == 0.) {
        data.rba = vec3(rand(uv), 0., 0.);
        data.g = rand(uv);
      }

      float columnTime = (columnTimeOffset * 1000.0 + time * 0.5) * (0.5 + columnSpeedOffset * 0.5) + (sin(time * columnSpeedOffset) * 0.2);
      float glyphTime = gl_FragCoord.y * 0.01 + columnTime;

      float value = 1.0 - fract((glyphTime + 0.3 * sin(SQRT_2 * glyphTime) + 0.2 * sin(SQRT_5 * glyphTime)));

      float brightness = 3.0 * log(value * 1.25);

      float glyphCycleSpeed = 0.0;
      if (brightness > 0.0) glyphCycleSpeed = pow(1.0 - brightness, 4.0);

      float glyphCycle = data.g;
      glyphCycle = fract(glyphCycle + 0.005 * glyphCycleSpeed);

      float symbol = floor(glyphSequenceLength * glyphCycle);
      float symbolX = mod(symbol, glyphTextureColumns);
      float symbolY = ((glyphTextureColumns - 1.0) - (symbol - symbolX) / glyphTextureColumns);

      gl_FragColor = vec4(
        brightness,
        glyphCycle,
        symbolY * glyphTextureColumns + symbolX,
        1.
      );
    }
  `,

  uniforms: {
    glyphSequenceLength,
    time: regl.context('time')
  },

  framebuffer: ({ tick }) => state[(tick + 1) % 2] // The crucial state FBO alternator
})

// We render the code into an FBO using MSDFs: https://github.com/Chlumsky/msdfgen
const renderRain = regl({
  vert: `
  attribute vec2 aPosition;
  uniform float width;
  uniform float height;
  varying vec2 vUV;
  void main() {
    vUV = aPosition / 2.0 + 0.5;
    vec2 size = width > height ? vec2(width / height, 1.) : vec2(1., height / width);
    gl_Position = vec4( size * aPosition, 0.0, 1.0 );
  }
  `,

  frag: `
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives: enable
    #endif
    precision lowp float;

    uniform sampler2D glyphMSDF;
    uniform sampler2D lastState;
    uniform float numColumns;
    uniform float glyphTextureColumns;

    varying vec2 vUV;

    float median3(vec3 i) {
      return max(min(i.r, i.g), min(max(i.r, i.g), i.b));
    }

    void main() {
      // Unpack the values from the font texture
      vec4 glyph = texture2D(lastState, vUV);
      float brightness = max(0., glyph.r);
      float symbolIndex = glyph.b;

      // resolve UV to MSDF texture coord
      vec2 symbolUV = vec2(mod(symbolIndex, glyphTextureColumns), floor(symbolIndex / glyphTextureColumns));
      vec2 glyphUV = fract(vUV * numColumns);
      vec2 msdfUV = (glyphUV + symbolUV) / glyphTextureColumns;

      // MSDF
      vec3 dist = texture2D(glyphMSDF, msdfUV).rgb;
      float sigDist = median3(dist) - 0.5;
      float alpha = clamp(sigDist/fwidth(sigDist) + 0.5, 0.0, 1.0);

      gl_FragColor = vec4(vec3(brightness * alpha), 1.0);
    }
  `,

  uniforms: {
    glyphMSDF: regl.prop('glyphMSDF'),
    width: regl.context('viewportHeight'),
    height: regl.context('viewportWidth')
  },

  framebuffer: renderedFBO
})

// Next a bloom is applied, aka an added high-pass blur.

// The high pass restricts the blur to bright things in our source texture.
const highPass = regl({
  frag: `
  precision mediump float;
  varying vec2 vUV;
  uniform sampler2D tex;
  uniform float threshold;
  void main() {
    float value = texture2D(tex, vUV).r;
    if (value < threshold) {
      value = 0.;
    }
    gl_FragColor = vec4(vec3(value), 1.0);
  }
  `,
  uniforms: {
    tex: regl.prop('tex'),
    threshold: 0.3
  },
  framebuffer: regl.prop('fbo')
})

// A 2D gaussian blur is just a 1D blur done horizontally, then done vertically.
// The FBO pyramid's levels represent separate levels of detail;
// by blurring them all, this 3x1 blur approximates a more complex gaussian.
const blur = regl({
  frag: `
  precision mediump float;
  varying vec2 vUV;
  uniform sampler2D tex;
  uniform vec2 direction;
  uniform float width, height;
  void main() {
    vec2 size = width > height ? vec2(width / height, 1.) : vec2(1., height / width);
    gl_FragColor =
      texture2D(tex, vUV) * 0.442 +
      (
        texture2D(tex, vUV + direction / max(width, height) * size) +
        texture2D(tex, vUV - direction / max(width, height) * size)
      ) * 0.279;
  }
  `,
  uniforms: {
    tex: regl.prop('tex'),
    direction: regl.prop('direction'),
    height: regl.context('viewportWidth'),
    width: regl.context('viewportHeight')
  },
  framebuffer: regl.prop('fbo')
})

// The pyramid of textures gets flattened onto the source texture.
const combineBloom = regl({
  frag: `
  precision mediump float;
  varying vec2 vUV;
  ${verticalBlurPyramid.map((_, index) => `uniform sampler2D tex_${index};`).join('\n')}
  uniform sampler2D tex;
  void main() {
    vec4 total = vec4(0.);
    ${verticalBlurPyramid.map((_, index) => `total += texture2D(tex_${index}, vUV);`).join('\n')}
    gl_FragColor = total + texture2D(tex, vUV);
  }
  `,
  uniforms: Object.assign({ tex: regl.prop('tex') }, pyramidUniforms(verticalBlurPyramid)),
  framebuffer: regl.prop('fbo')
})

// Finally, the values are mapped to colors in a palette texture.
// A little noise is introduced, to hide the banding that appears
// in subtle gradients. The noise is also time-driven, so its grain
// won't persist across subsequent frames. This is a safe trick
// in screen space.

const colorizeByPalette = regl({
  frag: `
  precision mediump float;
  #define PI 3.14159265359

  uniform sampler2D tex;
  uniform sampler2D palette;
  uniform float ditherMagnitude;
  uniform float time;
  varying vec2 vUV;

  highp float rand( const in vec2 uv, const in float t ) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
    return fract(sin(sn) * c + t);
  }

  void main() {
    float value = texture2D( tex, vUV ).r - rand( gl_FragCoord.xy, time ) * ditherMagnitude;
    gl_FragColor = texture2D(palette, vec2(value, 0.));
  }
  `,

  uniforms: {
    ditherMagnitude: 0.05,
    palette: regl.prop('palette'),
    tex: bloomedFBO,
    time: regl.context('time')
  }
})

// All this takes place in a full screen quad.
const setupQuad = regl({
  vert: `
  precision mediump float;
  attribute vec2 aPosition;
  varying vec2 vUV;
  void main() {
    vUV = 0.5 * (aPosition + 1.0);
    gl_Position = vec4(aPosition, 0, 1);
  }`,

  attributes: {
    aPosition: [ -4, -4, 4, -4, 0, 4 ]
  },

  uniforms: {
    lastState: ({ tick }) => state[tick % 2],
    numColumns,
    glyphTextureColumns
  },

  depth: { enable: false },
  count: 3
})

require('resl')({
  manifest: {
    glyphMSDF: {
      type: 'image',
      src: msdfURL,
      parser: data => regl.texture({
        data,
        mag: 'linear',
        min: 'linear',
        flipY: true
      })
    },
    palette: {
      type: 'image',
      src: paletteURL,
      parser: data => regl.texture({
        data,
        mag: 'linear',
        min: 'linear'
      })
    }
  },
  onDone: resources => {
    setupQuad({}, updateRain)
    regl.frame(({ viewportWidth, viewportHeight }) => {
      // All the FBOs except the compute FBOs need to be sized to the window.
      renderedFBO.resize(viewportWidth, viewportHeight)
      bloomedFBO.resize(viewportWidth, viewportHeight)
      // The blur pyramids can be lower resolution than the screen.
      const bloomScale = 0.5
      resizePyramid(highPassPyramid, viewportWidth, viewportHeight, bloomScale)
      resizePyramid(horizontalBlurPyramid, viewportWidth, viewportHeight, bloomScale)
      resizePyramid(verticalBlurPyramid, viewportWidth, viewportHeight, bloomScale)

      // And here is the full draw sequence.
      setupQuad(() => {
        updateRain()
        renderRain(resources)
        highPassPyramid.forEach(fbo => highPass({ fbo, tex: renderedFBO }))
        horizontalBlurPyramid.forEach((fbo, index) => blur({ fbo, tex: highPassPyramid[index], direction: [1, 0] }))
        verticalBlurPyramid.forEach((fbo, index) => blur({ fbo, tex: horizontalBlurPyramid[index], direction: [0, 1] }))
        combineBloom({ tex: renderedFBO, fbo: bloomedFBO })
        colorizeByPalette(resources)
      })
    })
  }
})
