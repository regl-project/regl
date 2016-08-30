/*
  <p>Metaball rendering demo. Many ideas and code taken from <a href="https://www.clicktorelease.com/code/bumpy-metaballs">here</a></p>

 */

const regl = require('../regl')()
const surfaceNets = require('surface-nets')
const ndarray = require('ndarray')
const normals = require('angle-normals')
const mat3 = require('gl-mat3')
const camera = require('./util/camera')(regl, {
  distance: 1.5,
  maxDistance: 3,
  minDistance: 0.5,
  center: [1, 1, 1],
  theta: 1.0
})

const maxCount = 4096

const positionBuffer = regl.buffer({
  length: maxCount * 3 * 4,
  type: 'float',
  usage: 'dynamic'
})

const normalBuffer = regl.buffer({
  length: maxCount * 3 * 4,
  type: 'float',
  usage: 'dynamic'
})

const cellsBuffer = regl.elements({
  length: (maxCount*3* 3) * 3 * 2,
  count: (maxCount*3* 3),
  type: 'uint16',
  usage: 'dynamic',
  primitive: 'triangles',
})

const drawBackground = regl({
  vert: `
    precision mediump float;
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0., 1.);
    }`,
  frag: `
    precision mediump float;
    uniform vec3 color;
    uniform float noise, width, height;

    #define VIG_REDUCTION_POWER 1.
    #define VIG_BOOST 1.

    float random(vec3 scale,float seed) {
      return fract(sin(dot(gl_FragCoord.xyz+seed,scale))*43758.5453+seed);
    }

    void main () {
      vec2 resolution = vec2(width, height);
      vec2 center = resolution * 0.5;
      float vignette = distance( center, gl_FragCoord.xy ) / resolution.x;
      vignette = VIG_BOOST - vignette * VIG_REDUCTION_POWER;

      float n = noise * (.5 - random(vec3(1.), length(gl_FragCoord)));

      float v = .5 * length(vec2(gl_FragCoord.y / resolution.y, (1. - abs(.5 - gl_FragCoord.x / resolution.x))));
      vec3 base = color;
      base += vec3(pow(v, 2.));

      gl_FragColor = vec4(base * vec3(vignette) + vec3(n), 1.);
    }`,
  uniforms: {
    color: [36 / 255.0, 70 / 255.0, 106 / 255.0],
    width: regl.context('viewportWidth'),
    height: regl.context('viewportHeight'),
    noise: 0.05
  },
  attributes: {
    position: [-4, -4, 4, -4, 0, 4]
  },
  count: 3
})

const drawMetaballs = regl({
  vert: `
    precision mediump float;
    uniform mat4 projection, view;
    uniform mat3 normalMatrix;

    attribute vec3 position, normal;

    varying vec3 vNormal, vONormal, vU;
    varying vec4 vPosition, vOPosition;

    void main () {
      vNormal = normalMatrix * normal;
      vONormal = normal;
      vPosition = vec4(position, 1.0);
      vOPosition = view * vPosition;
      vU = normalize(vec3(vOPosition));
      gl_Position = projection * vOPosition;
    }`,
  frag: `
    precision mediump float;
    uniform sampler2D textureMap, normalMap;
    uniform float normalScale, texScale;
    uniform vec3 color, eye;

    varying vec3 vNormal, vONormal, vU;
    varying vec4 vPosition, vOPosition;

    float random(vec3 scale, float seed) {
      return fract(sin(dot(gl_FragCoord.xyz + seed,scale)) * 43758.5453 + seed);
    }

    vec3 spherical_environment_map(vec3 ray, vec3 normal) {
      vec3 r = reflect(normalize(ray), normalize(normal));
      float m = 2.0 * sqrt(r.x * r.x + r.y * r.y + (r.z + 1.0) * (r.z + 1.0));
      vec2 calculatedNormal = vec2(r.x / m + 0.5, r.y / m + 0.5);
      return texture2D(textureMap, calculatedNormal).rgb;
    }

    mat3 tangent_space_basis(vec3 blend_weights) {
      vec3 tanX = vec3(vNormal.x, -vNormal.z, vNormal.y);
      vec3 tanY = vec3(vNormal.z, vNormal.y, -vNormal.x);
      vec3 tanZ = vec3(-vNormal.y, vNormal.x, vNormal.z);
      vec3 blended_tangent = tanX * blend_weights.xxx +
                             tanY * blend_weights.yyy +
                             tanZ * blend_weights.zzz;

      return mat3(
        normalize(blended_tangent),
        normalize(cross(vNormal, blended_tangent)),
        normalize(vNormal)
      );
    }

    vec3 blended_bump(vec3 blend_weights) {
      vec2 coord1 = vPosition.yz * texScale;
      vec2 coord2 = vPosition.zx * texScale;
      vec2 coord3 = vPosition.xy * texScale;

      vec3 bump1 = texture2D(normalMap, coord1).rgb;
      vec3 bump2 = texture2D(normalMap, coord2).rgb;
      vec3 bump3 = texture2D(normalMap, coord3).rgb;

      return bump1 * blend_weights.xxx +
             bump2 * blend_weights.yyy +
             bump3 * blend_weights.zzz;
    }

    void main() {
      vec3 blend_weights = abs(normalize(vONormal.xyz));
      blend_weights = (blend_weights - 0.2) * 7.;
      blend_weights = max(blend_weights, 0.);
      blend_weights /= (blend_weights.x + blend_weights.y + blend_weights.z);

      mat3 tsb = tangent_space_basis(blend_weights);
      vec3 bump = blended_bump(blend_weights);

      vec3 normalTex = bump * 2.0 - 1.0;
      normalTex.xy *= normalScale;
      normalTex.y *= -1.;
      normalTex = normalize(normalTex);
      vec3 finalNormal = tsb * normalTex;
      vec3 base = spherical_environment_map(vU, finalNormal);

      float rim = 1.75 * max(0., abs(dot(normalize(vNormal), normalize(-vOPosition.xyz))));
      base += 10. * base * color * clamp(1. - rim, 0., .15);

      base = vec3(1.) - (vec3(1.) - base) * (vec3(1.) - base);

      float dither = .05 * random(vec3(1.), length(gl_FragCoord));
      base += vec3(dither);

      gl_FragColor = vec4(base.rgb, 1.);
    }`,
  attributes: {
    position: {
      buffer: positionBuffer,
    },
    normal: {
      buffer: normalBuffer,
    }
  },
  uniforms: {
    color: [36 / 255.0, 70 / 255.0, 106 / 255.0],
    sphereColor: [36 / 255.0, 70 / 255.0, 106 / 255.0],
    normalScale: 1,
    texScale: 10,
    normalMatrix: (context) => {
      let a = mat3.create()
      mat3.normalFromMat4(a, context.view)
      return a
    },
    textureMap: regl.prop('textureMap'),
    normalMap: regl.prop('normalMap')
  },
  elements: cellsBuffer
})

const numblobs = 20
const strength = 1.2 / ((Math.sqrt(numblobs) - 1) / 4 + 1)
const subtract = 12
const size = 50
const bounds = [[0.5, 0.5, 0.5], [1.5, 1.5, 1.5]]
const position = (time, i) => {
  return [
    Math.sin(i + 1.26 * time * (1.03 + 0.5 * Math.cos(0.21 * i))) * 0.27 + 0.5,
    Math.cos(i + 1.12 * time * 0.21 * Math.sin((0.72 + 0.83 * i))) * 0.27 + 0.5,
    Math.cos(i + 1.32 * time * 0.1 * Math.sin((0.92 + 0.53 * i))) * 0.27 + 0.5
  ]
}
let start_bounds, end_bounds
[start_bounds, end_bounds] = bounds
const step_sizes = [0, 1, 2].map((i) => (end_bounds[i] - start_bounds[i]) / size)
const r = size * Math.sqrt(strength / subtract)

const render = (tick) => {
  let time = 0.5 * tick
  let fieldArray = new Float32Array(size * size * size)

  for (let n = 0; n < numblobs; n++) {
    let ballx, bally, ballz
    [ballx, bally, ballz] = position(time, n)
    let zs = ballz * size
    let ys = bally * size
    let xs = ballx * size

    let min_z = Math.floor(zs - r)
    if (min_z < 1) min_z = 1
    let max_z = Math.floor(zs + r)
    if (max_z > size - 1) max_z = size - 1
    let min_y = Math.floor(ys - r)
    if (min_y < 1) min_y = 1
    let max_y = Math.floor(ys + r)
    if (max_y > size - 1) max_y = size - 1
    let min_x = Math.floor(xs - r)
    if (min_x < 1) min_x = 1
    let max_x = Math.floor(xs + r)
    if (max_x > size - 1) max_x = size - 1

    for (let z = min_z; z < max_z; z++) {
      let z_offset = size * size * z

      for (let y = min_y; y < max_y; y++) {
        let y_offset = size * y

        for (let x = min_x; x < max_x; x++) {
          let fx = x / size - ballx
          let fy = y / size - bally
          let fz = z / size - ballz
          let val = strength / (0.000001 + (fx * fx) + (fy * fy) + (fz * fz)) - subtract
          if (val > 0.0) fieldArray[z_offset + y_offset + x] += val
        }
      }
    }
  }

  let mesh = surfaceNets(ndarray(fieldArray, [size, size, size]), 80.0)
  let coordinate_positions = mesh.positions.map((p) => {
    return p.map((index, i) => start_bounds[i] + (index * step_sizes[i]))
  })
  return {positions: coordinate_positions, cells: mesh.cells}
}

require('resl')({
  manifest: {
    sphereTexture: {
      type: 'image',
      src: 'spheretexture.jpg',
      parser: (data) => regl.texture({
        data: data,
        wrapT: 'clamp',
        wrapS: 'clamp',
        mag: 'linear',
        min: 'linear'
      })
    },
    normalTexture: {
      type: 'image',
      src: 'normaltexture.jpg',
      parser: (data) => regl.texture({
        data: data,
        wrapT: 'repeat',
        wrapS: 'repeat',
        min: 'linear mipmap linear',
        mag: 'linear'
      })
    }
  },
  onDone: ({sphereTexture, normalTexture}) => {
    regl.frame(({time}) => {
      let mesh = render(time)
      positionBuffer({data: mesh.positions})
      cellsBuffer({data: mesh.cells})
      normalBuffer({data: normals(mesh.cells, mesh.positions)})
      camera(() => {
        drawBackground({depth: {enable: false, mask: false}})
        regl.clear({depth: 1})
        drawMetaballs({
          textureMap: sphereTexture,
          normalMap: normalTexture
        })
      })
    })
  }
})
