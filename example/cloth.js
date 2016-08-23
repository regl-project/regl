/*
  tags: physics, advanced

<p>In this example, we use the mass-spring model described by Thomas Jakobsen to implement
a simple cloth simulation. It is also demonstrated how we can manage a dynamic mesh in regl. <p>

<p> You can read more about cloth simulation <a href="http://graphics.cs.cmu.edu/nsp/course/15-869/2006/papers/jakobsen.htm">here</a> and
<a href="http://gamedevelopment.tutsplus.com/tutorials/simulate-fabric-and-ragdolls-with-simple-verlet-integration--gamedev-519">here</a>

</p>
 */

const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')(canvas)
const mat4 = require('gl-mat4')
const camera = require('canvas-orbit-camera')(canvas)
window.addEventListener('resize', fit(canvas), false)
const vec3 = require('gl-vec3')

// configure intial camera view.
camera.view(mat4.lookAt([], [0, 3.0, 30.0], [0, 0, -5.5], [0, 1, 0]))
camera.rotate([0.0, 0.0], [3.14 * 0.15, 0.0])

const uv = []
const elements = []
var position = []
var oldPosition = []
const normal = []
var constraints = []

// create a constraint between the vertices with the indices i0 and i1.
function Constraint (i0, i1) {
  this.i0 = i0
  this.i1 = i1

  this.restLength = vec3.distance(position[i0], position[i1])
}

var size = 5.5
var xmin = -size
var xmax = +size
var ymin = -size
var ymax = +size

// the tesselation level of the cloth.
const N = 20

var row
var col

// create cloth vertices and uvs.
for (row = 0; row <= N; ++row) {
  var z = (row / N) * (ymax - ymin) + ymin
  var v = row / N

  for (col = 0; col <= N; ++col) {
    var x = (col / N) * (xmax - xmin) + xmin
    var u = col / N

    position.push([x, 0.0, z])
    oldPosition.push([x, 0.0, z])
    uv.push([u, v])
  }
}

const positionBuffer = regl.buffer({
  length: position.length * 3 * 4,
  type: 'float',
  usage: 'dynamic'
})

var i, i0, i1, i2, i3

// for every vertex, create a corresponding normal.
for (i = 0; i < position.length; ++i) {
  normal.push([0.0, 0.0, 0.0])
}

const normalBuffer = regl.buffer({
  length: normal.length * 3 * 4,
  type: 'float',
  usage: 'dynamic'
})

// create faces
for (row = 0; row <= (N - 1); ++row) {
  for (col = 0; col <= (N - 1); ++col) {
    i = row * (N + 1) + col

    i0 = i + 0
    i1 = i + 1
    i2 = i + (N + 1) + 0
    i3 = i + (N + 1) + 1

    elements.push([i3, i1, i0])
    elements.push([i0, i2, i3])
  }
}

// create constraints
for (row = 0; row <= N; ++row) {
  for (col = 0; col <= N; ++col) {
    i = row * (N + 1) + col

    i0 = i + 0
    i1 = i + 1
    i2 = i + (N + 1) + 0
    i3 = i + (N + 1) + 1

    // add constraint linked to the element in the next column, if it exist.
    if (col < N) {
      constraints.push(new Constraint(i0, i1))
    }

    // add constraint linked to the element in the next row, if it exists
    if (row < N) {
      constraints.push(new Constraint(i0, i2))
    }

    // add constraint linked the next diagonal element, if it exists.
    if (col < N && row < N) {
      constraints.push(new Constraint(i0, i3))
    }
  }
}

const drawCloth = regl({
  // no culling, because we'll be rendering both the backside and the frontside of the cloth.
  cull: {
    enable: false
  },
  context: {
    view: () => camera.view()
  },

  frag: `
  precision mediump float;

  varying vec2 vUv;
  varying vec3 vNormal;

  uniform sampler2D texture;

  void main () {
    vec3 tex = texture2D(texture, vUv*1.0).xyz;
    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.3));

    vec3 n = vNormal;

    // for the back faces we need to use the opposite normals.
    if(gl_FrontFacing == false) {
      n = -n;
    }

    vec3 ambient = 0.3 * tex;
    vec3 diffuse = 0.7 * tex * clamp( dot(n, lightDir ), 0.0, 1.0 );

    gl_FragColor = vec4(ambient + diffuse, 1.0);
  }`,

  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;

  varying vec2 vUv;
  varying vec3 vNormal;

  uniform mat4 projection, view;

  void main() {
    vUv = uv;
    vNormal = normal;
    gl_Position = projection * view * vec4(position, 1);
  }`,

  uniforms: {
    view: regl.context('view'),
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective([],
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000),
    texture: regl.prop('clothTexture')
  },

  attributes: {
    position: {
      buffer: positionBuffer,
      normalized: true
    },
    uv: regl.prop('uv'),
    normal: {
      buffer: normalBuffer,
      normalized: true
    }
  },
  elements: regl.prop('elements')
})

require('resl')({
  manifest: {
    clothTexture: {
      type: 'image',
      src: 'assets/cloth.png',
      parser: (data) => regl.texture({
        mag: 'nearest',
        mipmap: true,
        min: 'linear mipmap linear',
        data: data,
        wrap: 'repeat'
      })
    }
  },

  onDone: ({ clothTexture }) => {
    regl.frame(({tick}) => {
      const deltaTime = 0.017

      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      })

      //
      // Below we do the cloth simulation.
      //

      var vel = []
      var next = []
      var delta = deltaTime

      const g = [0.0, -4.0, 0.0] // gravity force vector.

      var windForce = [Math.sin(tick / 2.0), Math.cos(tick / 3.0), Math.sin(tick / 1.0)]
      vec3.normalize(windForce, windForce)
      vec3.scale(windForce, windForce, 20.6)

      for (i = 0; i < position.length; ++i) {
        //
        // we do verlet integration for every vertex.
        //

        // compute velocity.
        vec3.subtract(vel, position[i], oldPosition[i])
        vel = [vel[0], vel[1], vel[2]]
        next = [position[i][0], position[i][1], position[i][2]]

        // advance vertex with velocity.
        vec3.add(next, next, vel)

        // apply gravity force.
        vec3.scaleAndAdd(next, next, g, delta * delta)

        // apply wind force.
        vec3.scaleAndAdd(next, next, windForce, delta * delta)

        // keep track of current and old position.
        oldPosition[i] = [position[i][0], position[i][1], position[i][2]]
        position[i] = [next[0], next[1], next[2]]
      }

      var d = []
      var v0, v1
      //
      // Attempt to satisfy the constraints by running a couple of iterations.
      //
      for (i = 0; i < 15; ++i) {
        for (var j = 0; j < constraints.length; j++) {
          var c = constraints[j]

          v0 = position[c.i0]
          v1 = position[c.i1]

          vec3.subtract(d, v1, v0)

          var dLength = vec3.length(d)
          var diff = (dLength - c.restLength) / dLength

          // repulse/attract the end vertices of the constraint.
          vec3.scaleAndAdd(v0, v0, d, +0.5 * diff)
          vec3.scaleAndAdd(v1, v1, d, -0.5 * diff)
        }
      }

      // we make some vertices at the edge of the cloth unmovable.
      for (i = 0; i <= N; ++i) {
        position[i] = [oldPosition[i][0], oldPosition[i][1], oldPosition[i][2]]
      }

      // next, we recompute the normals
      for (i = 0; i < normal.length; i++) {
        normal[i] = [0.0, 0.0, 0.0]
      }

      //
      for (i = 0; i < elements.length; i++) {
        i0 = elements[i][0]
        i1 = elements[i][1]
        i2 = elements[i][2]

        var p0 = position[i0]
        var p1 = position[i1]
        var p2 = position[i2]

        v0 = [0.0, 0.0, 0.0]
        vec3.subtract(v0, p0, p1)

        v1 = [0.0, 0.0, 0.0]
        vec3.subtract(v1, p0, p2)

        // compute face normal.
        var n0 = [0.0, 0.0, 0.0]
        vec3.cross(n0, v0, v1)
        vec3.normalize(n0, n0)

        // add face normal to vertices of face.
        vec3.add(normal[i0], normal[i0], n0)
        vec3.add(normal[i1], normal[i1], n0)
        vec3.add(normal[i2], normal[i2], n0)
      }

      // the average of the total face normals approximates the vertex normals.
      for (var i = 0; i < normal.length; i++) {
        vec3.normalize(normal[i], normal[i])
      }

      /*
        Make sure that we stream the positions and normals to their buffers,
        since these are updated every frame.
        */
      positionBuffer.subdata(position)
      normalBuffer.subdata(normal)

      drawCloth({elements, uv, clothTexture})
      camera.tick()
    })
  }
})
