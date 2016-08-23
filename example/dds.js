/*
  tags: advanced
  <p>This example shows how you can parse dds files with resl.</p>
 */

const regl = require('../regl')({
  extensions: 'WEBGL_compressed_texture_s3tc'
})
const parseDDS = require('parse-dds')

require('resl')({
  manifest: {
    diffuse: {
      type: 'binary',
      src: 'assets/alpine_cliff_a.dds',
      parser: (data) => {
        const dds = parseDDS(data)
        const image = dds.images[0]
        return regl.texture({
          format: 'rgba s3tc ' + dds.format,
          shape: dds.shape,
          mag: 'linear',
          data: new Uint8Array(data, image.offset, image.length)
        })
      }
    },

    specular: {
      type: 'image',
      src: 'assets/alpine_cliff_a_spec.png',
      parser: (data) => regl.texture({
        mag: 'linear',
        data: data
      })
    },

    normals: {
      type: 'image',
      src: 'assets/alpine_cliff_a_norm.png',
      parser: (data) => regl.texture({
        mag: 'linear',
        data: data
      })
    }
  },

  onDone: ({ diffuse, specular, normals }) => {
    const draw = regl({
      frag: `
      precision mediump float;
      uniform sampler2D specular, normals, diffuse;
      varying vec3 lightDir, eyeDir;
      varying vec2 uv;
      void main () {
        float d = length(lightDir);
        vec3 L = normalize(lightDir);
        vec3 E = normalize(eyeDir);
        vec3 N = normalize(2.0 * texture2D(normals, uv).rgb - 1.0);
        N = vec3(-N.x, N.yz);
        vec3 D = texture2D(diffuse, uv).rgb;
        vec3 kD = D * (0.01 +
          max(0.0, dot(L, N) * (0.6 + 0.8 / d) ));
        vec3 S = texture2D(specular, uv).rgb;
        vec3 kS = 2.0 * pow(max(0.0, dot(normalize(N + L), -E)), 10.0) * S;
        gl_FragColor = vec4(kD + kS, 1);
      }`,

      vert: `
      precision mediump float;
      attribute vec2 position;
      uniform vec2 lightPosition;
      varying vec3 lightDir, eyeDir;
      varying vec2 uv;
      void main () {
        vec2 P = 1.0 - 2.0 * position;
        uv = vec2(position.x, 1.0 - position.y);
        eyeDir = -vec3(P, 1);
        lightDir = vec3(lightPosition - P, 1);
        gl_Position = vec4(P, 0, 1);
      }`,

      attributes: {
        position: [
          -2, 0,
          0, -2,
          2, 2
        ]
      },

      uniforms: {
        specular: specular,
        normals: normals,
        diffuse: diffuse,
        lightPosition: ({tick}) => {
          var t = 0.025 * tick
          return [2.0 * Math.cos(t), 2.0 * Math.sin(t)]
        }
      },

      count: 3
    })

    regl.frame(() => {
      draw()
    })
  }
})
