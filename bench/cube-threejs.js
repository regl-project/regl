var THREE = require('three')

module.exports = function (canvas, canvasWidth, canvasHeight) {
  var scene
  var camera
  var renderer
  var mesh

  function init () {
    scene = new THREE.Scene()

    renderer = new THREE.WebGLRenderer({canvas: canvas})
    renderer.setPixelRatio(1)
    renderer.setSize(canvasWidth, canvasHeight)

    camera = new THREE.PerspectiveCamera(45, canvasWidth / canvasHeight, 0.1, 100)
    camera.up = new THREE.Vector3(0, 1, 0)
  }

  function drawShape () {
    var geo = new THREE.CubeGeometry(1.0, 1.0, 1.0)

    var d = new Uint8Array([
      128, 128, 128, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      128, 128, 128, 255
    ])

    var texture = new THREE.DataTexture(d, 2, 2, THREE.RGBAFormat)

    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter

    texture.needsUpdate = true

    var mats = []
    var i
    for (i = 0; i < 6; i++) {
      mats.push(new THREE.MeshBasicMaterial({map: texture}))
    }
    var mat = new THREE.MeshFaceMaterial(mats)

    mesh = new THREE.Mesh(geo, mat)

    scene.add(mesh)
    var s = 7.0
    for (i = 0; i < 12; i++) {
      geo.faceVertexUvs[0][i][0].x *= s
      geo.faceVertexUvs[0][i][0].y *= s

      geo.faceVertexUvs[0][i][1].x *= s
      geo.faceVertexUvs[0][i][1].y *= s

      geo.faceVertexUvs[0][i][2].x *= s
      geo.faceVertexUvs[0][i][2].y *= s
    }
  }

  function setupScene () {
    init()
    drawShape()
  }

  function drawScene (args) {
    const t = 0.01 * args.tick

    camera.position.set(5 * Math.cos(t), 2.5 * Math.sin(t), 5 * Math.sin(t))
    camera.lookAt(new THREE.Vector3(0, 0, 0))

    renderer.render(scene, camera)
  }

  return {
    proc: drawScene,
    setup: setupScene
  }
}
