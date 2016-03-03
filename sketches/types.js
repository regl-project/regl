How to handle buffers and textures:

* As a custom data type (but need a schema to check them)
* As a data flow node

How to handle sets of draw buffers?

```javascript
const {
  tuple,
  number,
  array,
  dict,
  buffer,
  typedarray
} = regl.types

const chunk_id = tuple(number, number, number)

const ChunkNode = regl.node({

  inputs: [
    stream([
      ChunkId,
      typedarray.uint8
    ])
  ],

  output: dict(chunk_id, buffer),

  onChange: function (chunks) {
    chunks.forEach({id, data} => {
      if (!data) {
        this.output.remove(id)
      } else {
        this.output.set()
      }
    })
  }
})
```
