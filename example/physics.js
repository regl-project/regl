/*
  tags: advanced, physics

  <p>
  In this example, it is shown how you can integrate ammo.js into
  regl, and use it to create a simple physics simulation. By clicking,
  you are able to shoot balls at the wall.
  </p>
*/

const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')({ canvas: canvas })
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
var mp = require('mouse-position')(canvas)
var mb = require('mouse-pressed')(canvas)

window.addEventListener('resize', fit(canvas), false)

var ammo = require('./util/ammo.js')

// need to make sure that all classes start with a big letter, to avoid standardJs errors.
const BtVector3 = ammo.btVector3
const BtCollisionDispatcher = ammo.btCollisionDispatcher
const BtDefaultCollisionConfiguration = ammo.btDefaultCollisionConfiguration
const BtDbvtBroadphase = ammo.btDbvtBroadphase
const BtSequentialImpulseConstraintSolver = ammo.btSequentialImpulseConstraintSolver
const BtDiscreteDynamicsWorld = ammo.btDiscreteDynamicsWorld
const BtStaticPlaneShape = ammo.btStaticPlaneShape
const BtDefaultMotionState = ammo.btDefaultMotionState
const BtTransform = ammo.btTransform
const BtQuaternion = ammo.btQuaternion
const BtRigidBody = ammo.btRigidBody
const BtRigidBodyConstructionInfo = ammo.btRigidBodyConstructionInfo
const BtBoxShape = ammo.btBoxShape
const BtSphereShape = ammo.btSphereShape

var viewMatrix = new Float32Array(16)
var projectionMatrix = new Float32Array(16)

// keeps track of all global state.
const globalScope = regl({
  uniforms: {
    lightDir: [0.92, 0.3, 0.2],
    projection: ({ viewportWidth, viewportHeight }) => {
      return mat4.perspective(projectionMatrix, Math.PI / 4, viewportWidth / viewportHeight, 0.01, 1000.0)
    },
    view: ({ tick }) => {
      var s = 0.8
      return mat4.lookAt(viewMatrix,
        [50 * s, 9.5, 30 * s],
        [0, 2.5, 0],
        [0, 1, 0])
    }
  }
})

// render object with phong shading.
const drawNormal = regl({
  frag: `
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 color;
  uniform vec3 lightDir;

  void main () {
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir);
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    gl_FragColor = vec4((ambient + diffuse), 1.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  varying vec3 vPosition;
  varying vec3 vNormal;

  uniform mat4 projection, view, model;

  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);

    vPosition = worldSpacePosition.xyz;
    vNormal = (model * vec4(normal, 0)).xyz;

    gl_Position = projection * view * worldSpacePosition;
  }`
})

function Mesh (elements, position, normal) {
  this.elements = elements
  this.position = position
  this.normal = normal
}

Mesh.prototype.draw = regl({
  uniforms: {
    model: (_, props, batchId) => {
      return props.model
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
  }
})

// setup physics world.
var collisionConfiguration = new BtDefaultCollisionConfiguration()
var dispatcher = new BtCollisionDispatcher(collisionConfiguration)
var broadphase = new BtDbvtBroadphase()
var solver = new BtSequentialImpulseConstraintSolver()
var physicsWorld = new BtDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration)
physicsWorld.setGravity(new BtVector3(0, -6.0, 0))

function createPlane ({ color }) {
  /*
    First we create the plane mesh.
    */

  const planeElements = []
  var planePosition = []
  var planeNormal = []

  var A = 1000.0 // plane size.

  planePosition.push([-0.5 * A, 0.0, -0.5 * A])
  planePosition.push([+0.5 * A, 0.0, -0.5 * A])
  planePosition.push([-0.5 * A, 0.0, +0.5 * A])
  planePosition.push([+0.5 * A, 0.0, +0.5 * A])

  planeNormal.push([0.0, 1.0, 0.0])
  planeNormal.push([0.0, 1.0, 0.0])
  planeNormal.push([0.0, 1.0, 0.0])
  planeNormal.push([0.0, 1.0, 0.0])

  planeElements.push([3, 1, 0])
  planeElements.push([0, 2, 3])

  var planeMesh = new Mesh(planeElements, planePosition, planeNormal)

  /*
    Then we create the rigid body.
   */

  var shape = new BtStaticPlaneShape(new BtVector3(0, 1, 0), 0)
  shape.setMargin(0.05)
  var motionState = new BtDefaultMotionState(new BtTransform(new BtQuaternion(0, 0, 0, 1), new BtVector3(0, 0, 0)))
  var ci = new BtRigidBodyConstructionInfo(0, motionState, shape, new BtVector3(0, 0, 0))
  var rigidBody = new BtRigidBody(ci)
  physicsWorld.addRigidBody(rigidBody)

  return { rigidBody: rigidBody, drawCall: planeMesh, color: color }
}

function createBox ({ color, position, size }) {
  /*
    First we create the box mesh
    */
  var s = size

  var boxPosition = [
    // side faces
    [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
    [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
    [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
    [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
    [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5], // top face
    [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5] // bottom face
  ]

  for (var i = 0; i < boxPosition.length; i++) {
    var p = boxPosition[i]
    p[0] *= s[0]
    p[1] *= s[1]
    p[2] *= s[2]
  }

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

  var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)

  /*
    Then we create the box rigid body.
   */

  var mass = 1.0
  var shape = new BtBoxShape(new BtVector3(s[0] * 0.5, s[1] * 0.5, s[2] * 0.5))
  shape.setMargin(0.05)

  var motionState = new BtDefaultMotionState(new BtTransform(new BtQuaternion(0, 0, 0, 1), new BtVector3(position[0], position[1], position[2])))

  var localInertia = new BtVector3(0, 0, 0)
  shape.calculateLocalInertia(mass, localInertia)

  var ci = new BtRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
  var rigidBody = new BtRigidBody(ci)
  physicsWorld.addRigidBody(rigidBody)

  return { rigidBody: rigidBody, drawCall: boxMesh, color: color }
}

function shootSphere () {
  /*
    First, we need a ray from the camera.
    Because we need a shooting position, and a shooting direction.
  */
  var vp = mat4.multiply([], projectionMatrix, viewMatrix)
  var invVp = mat4.invert([], vp)

  // get a single point on the camera ray.
  var rayPoint = vec3.transformMat4([], [2.0 * mp[0] / canvas.width - 1.0, -2.0 * mp[1] / canvas.height + 1.0, 0.0], invVp)

  // get the position of the camera.
  var rayOrigin = vec3.transformMat4([], [0, 0, 0], mat4.invert([], viewMatrix))

  var rayDir = vec3.normalize([], vec3.subtract([], rayPoint, rayOrigin))

  // we release the ball a bit in front of the camera.
  vec3.scaleAndAdd(rayOrigin, rayOrigin, rayDir, 4.4)

  /*
    Next, create the sphere mesh
    */
  var mesh = require('primitive-sphere')(1.0, {
    segments: 16
  })
  var sphereMesh = new Mesh(mesh.cells, mesh.positions, mesh.normals)

  /*
    Then, create the rigid body.
  */
  var mass = 1.0
  var shape = new BtSphereShape(1)
  shape.setMargin(0.05)
  var motionState = new BtDefaultMotionState(new BtTransform(new BtQuaternion(0, 0, 0, 1), new BtVector3(rayOrigin[0], rayOrigin[1], rayOrigin[2])))

  var localInertia = new BtVector3(0, 0, 0)
  shape.calculateLocalInertia(mass, localInertia)

  var ci = new BtRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
  var rigidBody = new BtRigidBody(ci)
  physicsWorld.addRigidBody(rigidBody)

  /*
    Now send the rigid body flying!
  */
  var POWER = 80.0
  rigidBody.applyImpulse(new BtVector3(POWER * rayDir[0], POWER * rayDir[1], POWER * rayDir[2]), new BtVector3(rayOrigin[0], rayOrigin[1], rayOrigin[2]))

  return { rigidBody: rigidBody, drawCall: sphereMesh, color: [1.0, 1.0, 1.0] }
}

var transformTemp = new BtTransform()
// extracts the model matrix from a rigid body.
function getModelMatrix (rb) {
  var ms = rb.getMotionState()

  if (ms) {
    ms.getWorldTransform(transformTemp)
    var p = transformTemp.getOrigin()
    var q = transformTemp.getRotation()

    return mat4.fromRotationTranslation(
      [], [q.x(), q.y(), q.z(), q.w()], [p.x(), p.y(), p.z()])
  }
}

var objs = [] // contains all the physics objects.
objs.push(createPlane({ color: [0.8, 0.8, 0.8] }))

// create wall.
var WALL_HEIGHT = 12
var WALL_WIDTH = 30
for (var i = 0; i < WALL_HEIGHT; i++) {
  for (var j = 0; j < WALL_WIDTH; j++) {
    var x = i * i + 2.1
    var z = j * j + 2.5
    var c = [
      ((Math.abs(3 * x + 5 * z + 100) % 10) / 10) * 0.64,
      ((Math.abs(64 * x + x * z + 23) % 13) / 13) * 0.67,
      ((Math.abs(143 * x * z + x * z * z + 19) % 11) / 11) * 0.65
    ]

    objs.push(createBox({ color: c, position: [0.0, 0.5 + i * 1.0, -5.0 + 2.0 * (j - WALL_WIDTH / 2)], size: [1.0, 1.0, 2.0] }))
  }
}

mb.on('down', function () {
  objs.push(shootSphere())
})

regl.frame(({ tick }) => {
  regl.clear({
    color: [0, 0, 0, 255],
    depth: 1
  })

  // step simulation
  physicsWorld.stepSimulation(1.0 / 60.0, 10)

  // render physics world.
  globalScope(() => {
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i]
      drawNormal(() => {
        o.drawCall.draw({ model: getModelMatrix(o.rigidBody), color: o.color })
      })
    }
  })
})
