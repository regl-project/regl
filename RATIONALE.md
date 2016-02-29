# New abstractions for WebGL

The high level goal of stack.gl is to deconstruct a 3D engine into reusable, interchangeable, composable modules.  More precisely, we mean that a module is,

* *Reusable* if it can be extracted from its original environment and used again
* *Interchangeable* if it can be replaced with a module having an equivalent interface
* *Composable* if it is composed itself of simpler, smaller modules

stack.gl is a loosely coupled collection of modules that communicate using standard interfaces.  At a high level, there are three basic parts of stack.gl,

* *Shader libraries*, and in particular [glslify](https://github.com/stackgl/glslify) which brings CommonJS modules to GLSL
* *Math and geometry tools*, which process arrays and indexed face sets
* *WebGL wrappers*, which abstract some of the boilerplate in WebGL

In the ecosystem, the shader and math parts have been far more successful than the core WebGL wrappers.  In part, this is at least because they are better defined problems with simpler interfaces.  Creating truly reusable WebGL abstractions beyond basic low level wrappers has so far proved elusive.  The goal of this document is to explore why this problem has been so much more difficult and to begin imagining what a solution might look like.

### Problems with WebGL

The simplest and most painful way to use WebGL is to just call the API directly. Unfortunately, WebGL is not very user friendly.  Initialization, resource binding, setting state flags, and so on are all extremely verbose.  At a higher level, the WebGL presents more serious problems from the perspective of code reuse.  It is essentially an enormous global state machine, which is controlled by registers and interrupts.  If a subroutine changes the state of this machine leaving it in an invalid or unexpected state, it may cause difficult to find errors in later rendering commands, often resulting in a mysterious blank screen. WebGL provides few error reporting and tracking mechanism to help programmers troubleshoot these problems.  Moreover, because of these complex non-local interactions it is difficult to reuse WebGL subroutines across different systems.

### Conservative wrapping

Wrapper libraries can reduce boilerplate by grouping common operations and setting sane defaults.  Libraries such as [stack.gl](http://stack.gl)'s `gl-shader, gl-buffer`, etc. or [twgl](http://twgljs.org/) provide shortcuts, while keeping the WebGL interface as a whole intact.  Killing duplicate code makes getting started with WebGL easier, but it is not enough to solve the hard problems of code reuse, coordination and resource management.

### Immediate mode

Immediate mode rendering is a minimal extension of direct wrapping which abstracts rendering of multiple draw calls using the composition of subroutines. State changes are tracked by pushing/popping to a stack, allowing for the procedural nesting. I think there is a strong case to be made that immediate mode rendering is an intuitive way to reason about computer graphics. Immediate concepts are present in "turtle graphics" systems like [Logo](https://en.wikipedia.org/wiki/Turtle_graphics) which are used to teach children basic programming skills. Historically, it is also how OpenGL 1.x worked. A more modern example is the [processing language](https://processing.org) or the DOM's [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API), both of which are popular with artists and creative/non-technical developers.

However, the convenience of immediate mode rendering comes at a cost. Modern GPUs are distributed systems, and the bus connecting them to the CPU has limited bandwidth and high latency. In order to take full advantage of their processing power it is necessary to cache data locally on the GPU and minimize this communication bottleneck. This is hard to do in the simple immediate mode rendering paradigm, since it encourages the CPU to retransmit all data each frame.

### Retained mode

Low latency rendering requires storing data on the GPU.  

#### CRUD pattern

* *Creation*
* *Rendering*
* *Update*
* *Deletion*


* Hard to manage state transitions, can waste time rebinding
* Hard to share resources
* Multipass coordination is difficult

#### Scene graphs

Motivation is to make rendering more declarative

Examples:

* THREE.js
* scenevr


* Easier for rendering engine to make holistic optimizations
* Coordination across objects (especially for multipass rendering, like picking, shadow mapping, reflections etc.) is easier to do


Negative:

* More concepts to learn up front.  Higher barrier to entry
* Need to synchronize scene graph state with rest of app.  Frequent use of weird hacks like 'dirty' flags, etc.
* Extending the system from the outside is harder.  Depending on a large system tends to make your code more fragile, breaking changes are more common


### Data flow perspective

Immediate mode revisited

High level idea:

`render: scene properties -> [draw calls]`

Simple, declarative, easy to reason about.  Unfortunately, also very slow if implemented naively.  So we need to turn this into




## Rendering as change detection
Thinking in terms of data flow reframes the problem of rendering as detecting changes in the properties of the `render()` function.

Unfortunately, some of these properties might be really big binary typed arrays. Even scanning this data is expensive, so we need to think carefully about how to detect such changes.

Here are some ways to solve this problem.  In each possible solution there is some psuedocode sketch showing how such a test might be implemented.

### Only update one time
We could also just sweep the problem under the rug by not allowing for dynamic vertex buffers or texture data, or only changing them at configuration time.

Example implementation:

```JavaScript
function shouldUpdate(nextProps) {
  if(this.hasUpdated) {
    return false
  }
  this.hasUpdated = true
  return true
}
```

Systems that don't need dynamic vertex/texture data can reasonably do this (for example shadertoy doesn't need to upload vertex buffers other than once when the page first loads.)

### Notification flag
Have a special method to notify the system of changes.

Example implementation:

```JavaScript
//Somewhere this method is exposed
function notifyUpdateNeeded() {
  this.needsUpdate = true
}

// ...

function shouldUpdate(nextProps) {
  var needsUpdate = this.needsUpdate
  this.needsUpdate = false
  return needsUpdate
}
```

### `dirty` flag
Maintain a copy of the data in the wrapper, which the user directly mutates.  Whenever data changes, user needs to set a flag notifying the system to flush changes to the GPU.

```JavaScript
function shouldUpdate(nextProps) {
  return nextProps.dirty
}
```

### Poll a user callback
The user provides a callback which can be polled by render() method to check if something changed and needs to be updated.  This method is similar to the `dirty` flag technique.

```javascript
function shouldUpdate(nextProps) {
  return nextProps.dirty()
}
```

### Naive structural comparison
Diff the structures by scanning them byte-by-byte.  For typed arrays this is way too slow.  Vertex buffers are just too big to be scanning them every frame, so this is pretty much a no-go.

```javascript
function shouldUpdate(nextProps) {
  if(deepEqual(nextProps, this.savedProps)) {
    return false
  }
  this.savedProps = nextProps
  return true
}
```

### Copy-on-write
Make a copy of the vertex buffer whenever we modify it.  As a result we can check equality of two data structures by just checking that their references are equal.

All updates to typedarrays become O(n) operations and we can no longer reuse buffers, which sucks.  Requires programmer discipline on the user's side.  Would be hard to use for attributes which are computed from user inputs.  For example, we might take an array of triangles as input and flatten them out into a typed array for WebGL.

```javascript
function shouldUpdate(nextProps) {
  if(nextProps === this.savedProps) {
    return false
  }
  this.savedProps = nextProps
  return true
}
```

react and virtual-dom use a variation of this approach, more-or-less

### Functional data structures
The performance of copy-on-write can be improved using functionally persistent data structures.  This lets us get faster incremental updates in some cases via structural sharing.  Obviously this is incompatible with typed arrays, so we'd still pay the cost of converting the functional data structure back to a typed array before we upload it.  There may be ways to offset this though, like using recursive structural diffing to do partial updates.  Still it seems like it would be pretty expensive and cause a bit too much garbage collection to be really viable in an interactive applications (but who knows).

immutable.js is a library designed to work with react that solves this problem

### Version counter
Every time we write to the object we increment a version flag.  Then we can use references + version counters to do structural comparisons.  While this would work, keeping track of that version counter without automatic instrumentation requires a lot of programmer discipline.  Might as well use a dirty flag, unless you want to force all users to run some insane whole-program transform.

```javascript
function shouldUpdate(nextProps, nextVersion) {
  if(nextProps === this.savedProps &&
     nextVersion === this.savedVersion) {
    return false
  }
  this.savedProps = nextProps
  this.savedVersion = nextVersion
  return true
}
```

### Hashing
Instead of a version counter we could just compute a hash of the input and compare that against some stored value.  If all pointers are replaced with hashes, we can directly diff two objects by recursively comparing their pointers.  Large arrays can be diffed incrementally using techniques like Rabin finger printing.

```javascript
function shouldUpdate(nextProps) {
  var h = hash(nextProps)
  if(h === this.savedHash) {
    return false
  }
  this.savedHash = h
  return true
}
```

rsync, bittorrent and IPFS use this approach.

### Events
Similar to an `update()` method, only with an extra layer of indirection.  If the events are serializable, this might be kind of cool for stuff like workers or distributed rendering. Probably overkill for rendering.

### Whole program instrumentation
If we had a smart enough source code transform, we could do dataflow analysis of the entire program and figure out exactly when the arguments to our `render()` method change and update only when necessary.  In practice this is probably too hard to do in JavaScript, but maybe in a pure functional language it would be possible.

Microsoft Excel is designed around this paradigm

### Use special per-component logic
Here the component would implement its own weird special-case logic to test if its inputs have changed and need to update.

### Hybrid methods
Maybe combining some of the above methods is effective?

# Requirements

* Must be able to reuse GPU resident resources, with minimal reinitialization
* No garbage collection
* Dataflow programming model
* Code generation


# Syntax sketches

```javascript
function someNode(someInput, someOtherInput) {
  //Construct sub nodes

  //return output nodes


  var x = connect(nodeClass)(input0, input1, ....)
}
```
