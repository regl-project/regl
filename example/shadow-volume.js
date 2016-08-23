/*
  tags: shadows, stencil, advanced

  <p> This example shows how to implement shadow volumes. </p>

  <p>This implementation was based on Mikola Lysneko's implementation
  <a href="https://github.com/stackgl/webgl-workshop/tree/master/exercises/stencil-shadows">here</a>.
  But note that it has been cleaned up a lot, many comments have been added, and some bugs have been fixed.
  </p>

  <p> You can read more about shadow volumes <a href="http://www.gamasutra.com/view/feature/131351/the_mechanics_of_robust_stencil_.php?print=1">here</a> and
  <a href="http://http.developer.nvidia.com/GPUGems/gpugems_ch09.html">here</a>

*/

const c = document.createElement('canvas')

const webglCanvas = document.body.appendChild(c)
var gl = c.getContext('webgl', {
  antialias: true,
  stencil: true
})

const fit = require('canvas-fit')
const mat4 = require('gl-mat4')

const regl = require('../regl')({gl: gl})

const camera = require('canvas-orbit-camera')(webglCanvas)
window.addEventListener('resize', fit(webglCanvas), false)


camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(-28.0)

var DIFFUSE_COLOR_RABBIT = [0.7, 0.3, 0.3]
var AMBIENT_COLOR_RABBIT = [0.3, 0.2, 0.3]

var DIFFUSE_COLOR_PLANE = [0.7, 0.7, 0.7]
var AMBIENT_COLOR_PLANE = [0.3, 0.3, 0.3]

require('resl')({
  manifest: {
    DATA: {
      // The mesh data of the shadow-casting rabbit
      /*
        the mesh-data of the bunny was created by this script:
        https://github.com/stackgl/webgl-workshop/blob/master/exercises/stencil-shadows/data/prepare.js
         */
      type: 'text',
      src: 'assets/shadow_bunny.json',
      parser: JSON.parse
    }
  },
  onDone: ({DATA}) => {
    var meshBuffer = regl.buffer(DATA.MESH)
    var shadowBuffer = regl.buffer(DATA.SHADOW)

    // common state, used throughout the entire program.
    const globalScope = regl({
      uniforms: {
        lightDir: () => [-0.39, -0.87, -0.29],

        // create the combined projection and view matrices.
        camera: ({tick, viewportWidth, viewportHeight}) => {
          var fovy = Math.PI / 2
          var aspect = viewportWidth / viewportHeight
          var near = 0.01
          var f = 1.0 / Math.tan(fovy / 2)
          var out = []
          var eps = 1.0

          /*
            Note that we do not use a normal perspective matrix.

            This projection matrix below is basically this matrix
            https://github.com/stackgl/gl-mat4/blob/master/perspective.js
            Except that we've let 'far' go to infinity,
            and that we add an epsilon factor at some places

            It is basically the matrix given in equation (8) of this article:
            http://www.gamasutra.com/view/feature/131351/the_mechanics_of_robust_stencil_.php?print=1
          */
          out[0] = f / aspect
          out[1] = 0
          out[2] = 0
          out[3] = 0
          out[4] = 0
          out[5] = f
          out[6] = 0
          out[7] = 0
          out[8] = 0
          out[9] = 0
          out[10] = -1 + eps
          out[11] = -1
          out[12] = 0
          out[13] = 0
          out[14] = (eps - 2) * near
          out[15] = 0
          var proj = out

          var view = camera.view()
          return mat4.multiply([], proj, view)
        }
      }
    })

    // ----First pass: Normally draw mesh, no stencil buffer
    const pass1 = regl({
      // use depth-buffer as usual.
      depth: {
        enable: true,
        mask: true,
        func: '<='
      },

      // no stencil test
      stencil: {
        enable: false
      },

      // turn on color write
      colorMask: [true, true, true, true],

      // cull back-faces as usual.
      cull: {
        enable: true,
        face: 'back'
      }
    })

    // ---Second pass: Draw to stencil buffer
    const pass2 = regl({
      depth: {
        mask: false, // don't write to depth buffer
        enable: true, // but DO use the depth test!
        func: '<'
      },

      // setup stencil buffer.
      stencil: {
        enable: true,
        mask: 0xff,
        func: {
          // stencil test always passes.
          // since we are only writing to the stencil buffer in this pass.
          cmp: 'always',
          ref: 0,
          mask: 0xff
        },
        // as can be seen, basically we are doing Carmack's reverse.
        opBack: {
          fail: 'keep',
          zfail: 'increment wrap',
          zpass: 'keep'
        },
        opFront: {
          fail: 'keep',
          zfail: 'decrement wrap',
          zpass: 'keep'
        }
      },
      // do no culling. This means that we can write to the stencil
      // buffer in a single pass! So we handle both the backfaces and the frontfaces
      // in this pass.
      cull: {
        enable: false
      },

      // don't write to color buffer.
      colorMask: [false, false, false, false]
    })

    // ----Final pass: Draw mesh with shadows
    const pass3 = regl({
      depth: {
        mask: false,
        enable: true,
        func: '<='
      },

      // setup stencil buffer.
      stencil: {
        enable: true,
        mask: 0xff,
        // IF the stencil value at the fragment is not zero,
        // then by Carmack's reverse, the fragment is in shadow!
        func: {
          cmp: '!=',
          ref: 0,
          mask: 0xff
        },
        // do no writing to stencil buffer in this pass.
        // we already did that in the previous pass.
        op: {
          fail: 'keep',
          zfail: 'keep',
          pass: 'keep'
        }
      },

      // DO write to color buffer.
      colorMask: [true, true, true, true],

      cull: {
        enable: true,
        face: 'back'
      }
    })

    var VERT = `
    precision mediump float;
    attribute vec3 position;
    attribute vec3 normal;

    uniform vec3 lightDir;
    uniform mat4 camera;
    uniform mat4 model;

    varying float intensity;

    void main() {
      intensity = max(-dot(lightDir, normal), 0.0);
      gl_Position = camera * model * vec4(position, 1);
    }
    `

    const FRAG = `
    precision mediump float;

    uniform vec3 diffuse;
    uniform vec3 ambient;

    varying float intensity;

    void main() {
      gl_FragColor = vec4(diffuse * intensity + ambient, 1);
    }
    `

    const planeElements = []
    var planePosition = []
    var planeNormal = []

    var s = 10.0
    var y = 0.0
    planePosition.push([-s, y, -s])
    planePosition.push([+s, y, -s])
    planePosition.push([-s, y, +s])
    planePosition.push([+s, y, +s])

    planeNormal.push([0.0, 1.0, 0.0])
    planeNormal.push([0.0, 1.0, 0.0])
    planeNormal.push([0.0, 1.0, 0.0])
    planeNormal.push([0.0, 1.0, 0.0])

    planeElements.push([3, 1, 0])
    planeElements.push([0, 2, 3])

    // draw shadow-receiving plane.
    // the plane doesn't cast any shadows.
    var drawPlane = regl({
      vert: VERT,
      frag: FRAG,

      uniforms: {
        ambient: () => AMBIENT_COLOR_PLANE,

        diffuse: (_, props) => {
          var intensity = props.intensity
          return [
            intensity * DIFFUSE_COLOR_PLANE[0],
            intensity * DIFFUSE_COLOR_PLANE[1],
            intensity * DIFFUSE_COLOR_PLANE[2]]
        },
        model: regl.prop('model')
      },
      attributes: {
        position: planePosition,
        normal: planeNormal
      },
      elements: planeElements,
      cull: {
        enable: true
      }
    })

    // draw shadow-casting bunny
    // the mesh-data of the bunny was created by this script:
    // https://github.com/stackgl/webgl-workshop/blob/master/exercises/stencil-shadows/data/prepare.js
    const drawRabbit = regl({
      vert: VERT,
      frag: FRAG,

      attributes: {
        position: {
          buffer: meshBuffer,
          offset: 0,
          normalized: false,
          stride: 24,
          size: 3
        },
        normal: {
          buffer: meshBuffer,
          offset: 12,
          normalized: false,
          stride: 24,
          size: 3
        }
      },

      uniforms: {
        ambient: () => AMBIENT_COLOR_RABBIT,

        diffuse: (_, props) => {
          var intensity = props.intensity
          return [
            intensity * DIFFUSE_COLOR_RABBIT[0],
            intensity * DIFFUSE_COLOR_RABBIT[1],
            intensity * DIFFUSE_COLOR_RABBIT[2]]
        },
        model: regl.prop('model')
      },

      count: () => DATA.MESH.length / 6
    })

    // contains common states for rendering shadow volumes.
    const shadowScope = regl({
      frag: `
      precision mediump float;

      void main() {
        if(gl_FrontFacing) {
          gl_FragColor = vec4(0,1,0,1);  // useful color for debugging.
        } else {
          gl_FragColor = vec4(1,0,0,1); // useful color for debugging.
        }
      }
      `
    })

    // draws a shadow silhouette
    const drawShadowSilhoutte = regl({
      vert: `
      precision mediump float;
      attribute vec4 position;
      attribute vec3 normal0, normal1;

      uniform vec3 lightDir;
      uniform mat4 camera;
      uniform mat4 model;
      void main() {
        /*
          Every edge of the rabbit is assigned a triangle. To all the vertices of that assigned
          triangle, we assign the face-normals of the two triangles incident to that edge.

          For that assigned triangle we have that:
          The first vertex is the first edge-vertex, and w=1
          The second vertex is the second edge-vertex, and w=1
          The third vertex is simply (0,0,0,0)

          Now clearly, only if the first normal is facing the light, and the second normal
          is facing away from the light, we have that the edge is part of the shadow silhouette.

          If it is part of the silhouette, we project the first and second vertices
          to infinity, in the direction of the light.
          For the third vertex, we have that w=0, so it is kept in place.
          Because the three vertices are placed in this way, the shadow silhouette is created for that edge.
          So that's how this vertex shader works.

          (if the above doesn't make sense, try drawing it out on paper.
          It will make sense.)
        */
        if(dot(normal0, lightDir) <= 0.0 &&
           dot(normal1, lightDir) >= 0.0) {
          gl_Position = camera*model*(position + vec4((1.0-position.w) * lightDir, 0.0));
        } else {
          gl_Position = vec4(0,0,0,0);
        }
      }
      `,

      attributes: {
        position: {
          buffer: shadowBuffer,
          offset: 0,
          normalized: false,
          stride: 40,
          size: 4
        },
        normal0: {
          buffer: shadowBuffer,
          offset: 16,
          normalized: false,
          stride: 40,
          size: 3
        },
        normal1: {
          buffer: shadowBuffer,
          offset: 28,
          normalized: false,
          stride: 40,
          size: 3
        }
      },

      count: () => DATA.SHADOW.length / 10,

      uniforms: {
        model: regl.prop('model')
      }
    })

    // this draws the shadow caps
    const drawShadowCaps = regl({
      vert: `
      precision mediump float;
      attribute vec3 position, normal;

      uniform vec3 lightDir;
      uniform mat4 camera;

      uniform mat4 model;

      /*
        The below vertex shader needs some explaining:

        We define dark cap and light cap as in figure 9-6 of this article:
        http://http.developer.nvidia.com/GPUGems/gpugems_ch09.html

        Firstly, drawing the light cap is easy, because we can just draw the rabbit mesh as usual. See figure 9-6, and you should understand.

        Secondly. however, we have the dark cap. Basically, to create the dark cap,
        we need to project the mesh onto infinity, in the direction of the light.
        And infinity, in the case of OpenGL, is just the faces of the clip-volume.
        The clip-volume is just a cube, and everything outside of this cube, is simply not drawn by OpenGL.

        So to project something to infinity, we need to project it onto one of the faces of this cube.
        The face we project onto depends on the light direction, and what we are doing in the function
        'extend', is that we are finding which face to project upon, and then we project the vertex
        of the mesh onto that face, thus creating the dark cap.
      */

      vec4 extend(vec3 p) {
        vec4 tlightDir = camera * vec4(lightDir,0);
        vec3 light = normalize(tlightDir.xyz);
        vec3 dpos = (1.0 - p) / light;
        vec3 dneg = (vec3(-1.0,-1.0,0.0) - p) / light;
        vec3 dt   = mix(dneg, dpos, step(0.0, light));
        return vec4(0.999 * min(min(dt.x, dt.y), dt.z) * light + p, 0);
      }

      void main() {
        vec4 projected = camera * model * vec4(position,1);
        if(dot(normal,lightDir) <= 0.0) {
          // light cap
          gl_Position = projected;
        } else {
          // dark cap
          gl_Position = extend(projected.xyz/projected.w);
        }
      }
      `,

      attributes: {
        position: {
          buffer: meshBuffer,
          offset: 0,
          normalized: false,
          stride: 24,
          size: 3
        },
        normal: {
          buffer: meshBuffer,
          offset: 12,
          normalized: false,
          stride: 24,
          size: 3
        }
      },

      count: () => DATA.MESH.length / 6,

      uniforms: {
        model: regl.prop('model')
      }
    })

    regl.frame(({tick}) => {
      var rabbits = []

      var phi0 = tick * 0.003
      var i = 0
      var theta
      var mRabbit

      // create model matrices of lower rabbit ring
      for (i = 0; i <= 0.9; i += 0.1) {
        theta = Math.PI * 2 * i
        mRabbit = mat4.identity([])
        mat4.translate(mRabbit, mRabbit, [2.0 * Math.cos(theta + phi0), 0.6, 2.0 * Math.sin(theta + phi0)])
        rabbits.push(mRabbit)
      }

      // create model matrices of upper rabbit ring.
      for (i = 0; i <= 0.9; i += 0.2) {
        theta = Math.PI * 2 * i + 1.3
        mRabbit = mat4.identity([])
        mat4.translate(mRabbit, mRabbit, [2.0 * Math.cos(theta + phi0 * 0.3), 1.3, 2.0 * Math.sin(theta + phi0 * 0.3)])
        rabbits.push(mRabbit)
      }

      var mPlane = mat4.identity([])
      mat4.translate(mPlane, mPlane, [0, 0, 0])

      globalScope(() => {
        regl.clear({depth: 1, color: [0, 0, 0, 1]})

        // ----First pass: Draw mesh, no stencil buffer
        pass1(() => {
          // draw all the shadow-casting rabbits.
          for (var i = 0; i < rabbits.length; i++) {
            drawRabbit({intensity: 1.0, model: rabbits[i]})
          }
        })
        drawPlane({intensity: 1.0, model: mPlane})

        // ---Second pass: Draw to stencil buffer
        pass2(() => {
          regl.clear({stencil: 0})
          shadowScope(() => {
            for (var i = 0; i < rabbits.length; i++) {
              drawShadowSilhoutte({model: rabbits[i]})
              drawShadowCaps({model: rabbits[i]})
            }
          })
        })

        // ----Final pass: Draw mesh with shadows
        pass3(() => {
          /*
            to render the shadows, we render the meshes at the fragments that passes the stencil-test,
            but with a slightly darker color
          */
          for (var i = 0; i < rabbits.length; i++) {
            drawRabbit({intensity: 0.1, model: rabbits[i]})
          }
          drawPlane({intensity: 0.1, model: mPlane})
        })
      })
      camera.tick()
    })
  }
})
