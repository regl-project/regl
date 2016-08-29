
/*
  tags: advanced

  <p>
  In this demo, it is shown how to implement 3D object picking.
  If you click on an object, an outline is drawn around it.
  </p>
*/

const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')({canvas: canvas})
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
window.addEventListener('resize', fit(canvas), false)
const normals = require('angle-normals')

const camera = require('./util/camera')(regl, {
  center: [0, 2.5, 0]
})


const planeElements = []
var planePosition = []
var planeNormal = []

var A = 100.0

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

//
// Create box geometry.
//

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

// keeps track of all global state.
const globalScope = regl({
  uniforms: {
    lightDir: [0.39, 0.87, 0.29]
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
    vNormal = normal;

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

var ammo = require('./util/ammo.js')

// create physics world.
var collisionConfiguration = new ammo.btDefaultCollisionConfiguration()
var dispatcher = new ammo.btCollisionDispatcher(collisionConfiguration)
var broadphase = new ammo.btDbvtBroadphase()
var solver = new ammo.btSequentialImpulseConstraintSolver()
var physicsWorld = new ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration)
physicsWorld.setGravity(new ammo.btVector3(0, -6, 0))

var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)
var planeMesh = new Mesh(planeElements, planePosition, planeNormal)

function createPlane ({color}) {
  var shape = new ammo.btStaticPlaneShape(new ammo.btVector3(0, 1, 0), 0)
  shape.setMargin(0.05)
  var motionState = new ammo.btDefaultMotionState(new ammo.btTransform(new ammo.btQuaternion(0, 0, 0, 1), new ammo.btVector3(0, 0, 0)))
  var ci = new ammo.btRigidBodyConstructionInfo(0, motionState, shape, new ammo.btVector3(0, 0, 0))
  var rigidBody = new ammo.btRigidBody(ci)
  physicsWorld.addRigidBody(rigidBody)

  return {rigidBody: rigidBody, drawCall: planeMesh, color: color}
}

function createBox ({color, position}) {
  var sx = 1.0
  var sy = 1.0
  var sz = 1.0
  var mass = 1.0

  var shape = new ammo.btBoxShape(new ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5))
  shape.setMargin(0.05)

  var motionState = new ammo.btDefaultMotionState(new ammo.btTransform(new ammo.btQuaternion(0, 0, 0, 1), new ammo.btVector3(position[0], position[1], position[2])))

  var localInertia = new ammo.btVector3(0, 0, 0)
  shape.calculateLocalInertia(mass, localInertia)

  var ci = new ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia)
  var rigidBody = new ammo.btRigidBody(ci)
  physicsWorld.addRigidBody(rigidBody)

  return {rigidBody: rigidBody, drawCall: boxMesh, color: color}
}

var transformAux1 = new ammo.btTransform()

function getModelMatrix (rb) {
  var ms = rb.getMotionState()

  if (ms) {
    ms.getWorldTransform(transformAux1)
    var p = transformAux1.getOrigin()
    var q = transformAux1.getRotation()

    return mat4.fromRotationTranslation(
      [], [q.x(), q.y(), q.z(), q.w()], [p.x(), p.y(), p.z()])
  } else {
    console.log('NOO THIS IS WRONG')
  }
}

var objs = []
objs.push(createPlane({color: [0.5, 0.5, 0.5]}))
objs.push(createBox({color: [0.9, 0.5, 0.5], position: [0.0, 4.0, 0.0]}))

regl.frame(({tick}) => {
  regl.clear({
    color: [0, 0, 0, 255],
    depth: 1
  })

  physicsWorld.stepSimulation(1.0 / 60.0, 10)

  camera(() => {
    globalScope(() => {
      for (var i = 0; i < objs.length; i++) {
        var o = objs[i]
        drawNormal(() => {
          o.drawCall.draw({model: getModelMatrix(o.rigidBody), color: o.color})
        })
      }
    })
  })
})
