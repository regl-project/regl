const glslify = require('glslify')
const createFullscreenCanvas = require('big-canvas')
const getContext = require('gl-context')
const regl = require('regl')

// Data types
const {
  number,
  mat4,
  tuple,
  shape,
  typedarray,
  union,
  stream,
  event,
  buffer,
  draw,
  dict,
  array
} = regl.types
const camera = shape({
  model: mat4,
  view: mat4,
  projection: mat4
})
const chunkId = tuple(number, number, number)
const updateEvent = event('update', {
  id: chunkId,
  count: number,
  data: typedarray.uint8
})
const removeEvent = event('remove', {
  id: chunkId
})
const chunkEvent = union(updateEvent, removeEvent)
const chunkStream = stream(chunkEvent)
const chunkMesh = shape({
  count: number,
  buffer: buffer
})
const chunkSet = dict(chunkId, chunkMesh)

// Manages buffer meshes for chunks
const ChunkBufferComponent = regl.component({
  in: [ chunkStream ],
  out: chunkSet,

  update: function (chunkStream) {
    chunkStream
      .on(updateEvent, ({id, count, data}) =>
        this.out.set(id, {
          count: count,
          data: {
            data,
            usage: 'static'
          }
        }))
      .on(removeEvent, ({id}) =>
        this.out.remove(id))
    return {}
  }
})

// Renders a list of chunks
const ChunkRenderComponent = regl.component({
  in: [ camera, array(chunkId), chunkSet ],
  out: [ array(draw) ],

  update: function (camera, chunks, meshes) {
    return chunks.map((id) => {
      const {count, buffer} = meshes.get(id)
      return {
        fragShader: glslify('./chunk-frag.glsl'),
        vertShader: glslify('./chunk-vert.glsl'),
        attributes: {
          attrib0: {
            buffer,
            type: 'uint8',
            stride: 8
          },
          attrib1: {
            buffer,
            type: 'uint8',
            stride: 8,
            offset: 4
          }
        },
        uniforms: {
          camera
        },
        count
      }
    })
  }
})

// Create context
const canvas = createFullscreenCanvas()
const gl = regl(getContext(canvas))
