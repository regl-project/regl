const webglCanvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')(webglCanvas)
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(webglCanvas)
window.addEventListener('resize', fit(webglCanvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')

var sphereMesh = require('primitive-sphere')(1.0, {
  segments: 16
})


// configure intial camera view.
camera.rotate([0.0, 0.0], [0.0, -0.4])
camera.zoom(10.0)

const fbo = regl.framebuffer({
  color: [
    regl.texture({type: 'uint8'}), // albedo
    regl.texture({type: 'float'}), // normal
    regl.texture({type: 'float'}), // position
  ],
  depth: true
})

var boxPosition = [
  // side faces
  [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
  [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
  [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
  [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
  [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5],  // top face
  [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]  // bottom face
]

const boxElements = [
  [2, 1, 0], [2, 0, 3],
  [6, 5, 4], [6, 4, 7],
  [10, 9, 8], [10, 8, 11],
  [14, 13, 12], [14, 12, 15],
  [18, 17, 16], [18, 16, 19],
  [20, 21, 22], [23, 20, 22]
]

// all the normals of a single block.
var boxNormal = [
  // side faces
  [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0],
  [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0],
  [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0],
  [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0],
  // top
  [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0],
  // bottom
  [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0]
]

const globalScope = regl({
  uniforms: {
    view: () => camera.view(),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       2000)
  }
})

const outputGBuffer = regl({
  frag: `
#extension GL_EXT_draw_buffers : require
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 color;

  void main () {
    gl_FragData[0] = vec4(color, 1.0);
    gl_FragData[1] = vec4(vNormal, 0.0);
    gl_FragData[2] = vec4(vPosition, 0.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  varying vec3 vPosition;
  varying vec3 vNormal;

  uniform mat4 projection, view, model;

  void main() {
    vNormal = normal;
    vec4 worldSpacePosition = model * vec4(position, 1);
    vPosition = worldSpacePosition.xyz;
    gl_Position = projection * view * worldSpacePosition;
  }`,
  framebuffer: fbo
})

const drawDirectionalLight = regl({
  frag: `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D albedoTex, normalTex;

  uniform vec3 ambientLight;
  uniform vec3 diffuseLight;
  uniform vec3 lightDir;

  void main() {
    vec3 albedo = texture2D(albedoTex, uv).xyz;
    vec3 n = texture2D(normalTex, uv).xyz;

    vec3 ambient = ambientLight * albedo;
    vec3 diffuse = diffuseLight * albedo * clamp(dot(n, lightDir) , 0.0, 1.0 );

    gl_FragColor = vec4(ambient + diffuse, 1.0);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,
  attributes: {
    position: [ -4, -4, 4, -4, 0, 4 ]
  },
  uniforms: {
    albedoTex: ({count}) => fbo.color[0],
    normalTex: ({count}) => fbo.color[1],
    ambientLight: [0.3, 0.3, 0.3],
    diffuseLight: [0.7, 0.7, 0.7],
    lightDir: [0.39, 0.87, 0.29]
  },
  depth: { enable: false },
  count: 3
})


const drawPointLight = regl({
    depth: { enable: false },
  frag: `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D albedoTex, normalTex, positionTex;

  uniform vec3 ambientLight;
  uniform vec3 diffuseLight;

  uniform float lightRadius;
  uniform vec3 lightPosition;

  varying vec4 vPosition;

  void main() {

    vec2 uv = (vPosition.xy / vPosition.w ) * 0.5 + 0.5;
    vec3 albedo = texture2D(albedoTex, uv).xyz;
    vec3 n = texture2D(normalTex, uv).xyz;
    vec4 position = texture2D(positionTex, uv);

    vec3 lightDist = (position.xyz) - lightPosition;
    float lightDistLength = length(lightDist);
    vec3 l = - lightDist * 1.0 / ( lightDistLength );

    float ztest = step(0.0, lightRadius - lightDistLength );

    vec3 ambient = ambientLight * albedo;
    vec3 diffuse = diffuseLight * albedo * clamp( dot(n, l ), 0.0, 1.0 );

    gl_FragColor = vec4((diffuse+ambient) * ztest
                        *(1.0 - lightDistLength / lightRadius)
                        ,1.0);
  }`,

  vert: `
  precision mediump float;
  uniform mat4 projection, view, model;
  attribute vec3 position;

  varying vec4 vPosition;

  void main() {
    vec4 pos = projection * view * model * vec4(position, 1);
   vPosition = pos;
    gl_Position = pos;
  }`,
  uniforms: {
    albedoTex: ({count}) => fbo.color[0],
    normalTex: ({count}) => fbo.color[1],
    positionTex: ({count}) => fbo.color[2],
    ambientLight: regl.prop('ambientLight'),
    diffuseLight: regl.prop('diffuseLight'),
    lightPosition: regl.prop('translate'),
    lightRadius: regl.prop('radius'),
    model: (_, props, batchId) => {
      var m = mat4.identity([])



      mat4.translate(m, m, props.translate)
      var s = props.scale

      var r = props.radius
      mat4.scale(m, m, [r, r, r])



      return m
    }
  },
  attributes: {
    position: () => sphereMesh.positions,
    normal: () => sphereMesh.normals
  },
  elements: () => sphereMesh.cells,
  blend: {
    enable: true,
    func: {
      src: 'one',
      dst: 'one'
    },
  },
  cull: {
    enable: true
  },
  // We render only the inner faces of the light sphere.
  // In other words, we render the back-faces and not the front-faces of the sphere.
  // If we render the front-faces, the lighting of the light sphere disappears if
  // we are inside the sphere, which is weird. But by rendering the back-faces instead,
  // we solve this problem.
  frontFace: 'cw',
})

function Mesh (elements, position, normal) {
  this.elements = elements
  this.position = position
  this.normal = normal
}

Mesh.prototype.draw = regl({
  uniforms: {
    model: (_, props, batchId) => {
      var m = mat4.identity([])


      mat4.translate(m, m, props.translate)
      var s = props.scale

      if (typeof s === 'number') {
        mat4.scale(m, m, [s, s, s])
      } else { // else, we assume an array
        mat4.scale(m, m, s)
      }

      if(typeof props.yRotate !== 'undefined')
        mat4.rotateY(m, m, props.yRotate)


      return m
    },
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7,
    color: regl.prop('color')
  },
  attributes: {
    position: regl.this('position'),
    normal: regl.this('normal')
  },
  elements: regl.this('elements'),
  cull: {
    enable: true
  },
})

var bunnyMesh = new Mesh(bunny.cells, bunny.positions, normals(bunny.cells, bunny.positions))
var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)



//console.log("l: ", sphereMesh.positions, sphereMesh.normals, sphereMesh.cells)

function randomRange (min, max) {
  var t = Math.random()
  return min * (1.0 - t) + max * t
}

function randomColor (c, variance) {
  return [
    c[0] + randomRange(-variance, +variance),
    c[1] + randomRange(-variance, +variance),
    c[2] + randomRange(-variance, +variance),
  ]
}



regl.frame(({tick, viewportWidth, viewportHeight}) => {
  regl.updateTimer()

  fbo.resize(viewportWidth, viewportHeight)

  globalScope(() => {
    outputGBuffer(() => {
      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      })

      var S =800 // box size
      var T = 0.1 // box wall thickness
      var C = [0.45, 0.45, 0.45] // box color

      var N_BUNNIES = 5

      var bunnies = []

      // modulo that works for negative numbers
      function negMod (x, n) {
        return ((x % n) + n) % n
      }

      for (x = -N_BUNNIES; x <= +N_BUNNIES; x++) {

        for (z = -N_BUNNIES; z <= +N_BUNNIES; z++) {

          var xs = x / (N_BUNNIES+1)
          var zs = z / (N_BUNNIES+1)

          // pseudo-random color
          var c = [
            ((Math.abs(3 * x + 5 * z + 100) % 10) / 10) * 0.84,
            ((Math.abs(64 * x + x * z + 23) % 13) / 13) * 0.87,
            ((Math.abs(143 * x * z + x * z * z + 19) % 11) / 11) * 0.91,
          ]

          var A = S / 20 // max bunny displacement amount.

          // random displavement
          var xd = (negMod(z *z * 231 + x * x * 343, 24) / 24) * 0.97 * A
          var zd = (negMod(z * x * 198 + x * x * z * 24, 25) / 25) * 0.987 * A


          var s = ((Math.abs(3024 * z + 5239 * x + 1321) % 50) / 50) * 3.4 + 0.9

          var r = ((Math.abs(9422 * z*x + 3731 * x*x + 2321) % 200) / 200) * 2 * Math.PI

          bunnies.push({scale: s, translate: [xs * S / 2.0+ xd, -0.2, zs * S / 2.0 + zd], color: c, yRotate: r})
        }

      }

      bunnyMesh.draw(bunnies)
      //      boxMesh.draw({scale: 4.2, translate: [0.0, 9.0, 0], color: [0.05, 0.5, 0.5]})¨


  /*
      bunnyMesh.draw({scale: 0.7, translate: [0.0, -0.2, 8.0], color: [0.55, 0.2, 0.05]})
      bunnyMesh.draw({scale: 0.8, translate: [-10, -0.2, 0.0], color: [0.55, 0.55, 0.05]})
      bunnyMesh.draw({scale: 0.8, translate: [-40, -0.2, 0.0], color: [0.55, 0.55, 0.05]})
      bunnyMesh.draw({scale: 0.8, translate: [+60, -0.2, 0.0], color: [0.55, 0.55, 0.97]})
*/

      boxMesh.draw({scale: [S, T, S], translate: [0.0, 0.0, 0], color: C})
      boxMesh.draw({scale: [T, S, S], translate: [S / 2, S / 2, 0], color: C})
      boxMesh.draw({scale: [T, S, S], translate: [-S / 2, S / 2, 0], color: C})
      boxMesh.draw({scale: [S, S, T], translate: [0, S / 2, S / 2], color: C})
      boxMesh.draw({scale: [S, S, T], translate: [0, S / 2, -S / 2], color: C})
    })

    drawDirectionalLight()

    pointLights = []

    var N = 10

    for(var i = 0; i < N; ++i) {
      var theta = 2 * Math.PI * i * (1.0 / (N));
      theta += tick * 0.01
      var R = 100

      var mod = i % 3
      var r,g,b
      var a = 0.8
      r = 0.2
      b = 0.7

      if (mod === 0) {
        g = 0.2
      } else if (mod === 1) {
        g = 0.7
      } else if (mod === 2) {
        g = 0.5
      }

      mod = (i+2) % 3

      if (mod === 0) {
        r = 0.1
      } else if (mod === 1) {
        r = 0.9
      } else if (mod === 2) {
        r = 0.5
      }

      mod = (i+9) % 4

      if (mod === 0) {
        b = 0.6
      } else if (mod === 1) {
        r = 0.24
      } else if (mod === 2) {
        r = 1.0
      } else if (mod === 3) {
        r = 0.1
      }

//      pointLights.push({radius:30.0, translate: [R * Math.sin(theta), 0.0, R * Math.cos(theta)], ambientLight: [a * r, a * g, a * b], diffuseLight: [r, g, b]})
    }

    pointLights = [
      {radius:20.0, translate: [0.0, 0.0, 0.0], ambientLight: [0.4, 0.0, 0.0], diffuseLight: [0.6, 0.0, 0.0]},
      {radius:20.0, translate: [60.0, 0.0, 0.0], ambientLight: [0.0, 0.2, 0.0], diffuseLight: [0.0, 0.6, 0.0]}
    ]

    drawPointLight(pointLights)
  })

  camera.tick()
})
