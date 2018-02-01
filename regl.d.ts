// Type definitions for regl 1.3.1
// Project: regl
// Definitions by: Stepan Stolyarov <stepan.stolyarov@gmail.com>, David Schneider <github.com/davschne>

/*~ Note that ES6 modules cannot directly export callable functions.
 *~ This file should be imported using the CommonJS-style:
 *~
 *~ ```typescript
 *~ import REGL = require('regl');
 *~ ```
 *~
 *~ Refer to the documentation to understand common
 *~ workarounds for this limitation of ES6 modules.
 */

/*~ This module is a UMD module that exposes a global function `createREGL`. */
export as namespace createREGL;

export = REGL;

/**
 * Creates a full screen canvas element and a WebGL rendering context.
 */
declare function REGL(): REGL.Regl;

/**
 * Creates a WebGL rendering context using an element selected by `selector`.
 * This may be:
 * 1) an existing HTMLCanvasElement
 * 2) an element that contains a canvas
 * 3) an element in which you'd like `regl` to create a canvas
 *
 * @param selector an argument to `document.querySelector`
 */
declare function REGL(selector: string): REGL.Regl;

/**
 * Creates a canvas element and a WebGL rendering context in a given container element.
 *
 * @param container an HTML element
 */
declare function REGL(container: HTMLElement): REGL.Regl;

/**
 * Creates a WebGL rendering context using a `<canvas>` element.
 *
 * @param canvas HTML canvas element
 */
declare function REGL(canvas: HTMLCanvasElement): REGL.Regl;

/**
 * Wraps an existing WebGL rendering context.
 *
 * @param gl WebGL rendering context
 */
declare function REGL(gl: WebGLRenderingContext): REGL.Regl;

/**
 * Creates a WebGL according to specified `options`
 */
declare function REGL(options: REGL.InitializationOptions): REGL.Regl;

declare namespace REGL {
  /**
   * Documentation for interface `Regl`.
   */
  export interface Regl {
    readonly attributes: WebGLContextAttributes;
    readonly _gl: WebGLRenderingContext;
    readonly limits: REGL.Limits;
    readonly stats: REGL.Stats;

    /**
     * Creates a new REGL command. The resulting command, when executed,
     * will set a WebGL state machine to a specified `state`.
     */
    (state: REGL.State): REGL.Command;

    /**
     * Clears selected buffers to specified values.
     * If an option is not present, then the corresponding buffer is not cleared.
     * Relevant WebGL API: `gl.clear`
     */
    clear(options: REGL.ClearOptions): void;

    /* Reading pixels */

    /**
     * Read entire screen.
     */
    read(): Uint8Array | Float32Array;

    /**
     * Read entire screen into an existing `ArrayBufferView`.
     */
    read<T extends Uint8Array | Float32Array>(data: T): T;

    /**
     * Read a selected region of screen or framebuffer.
     */
    read<T extends Uint8Array | Float32Array>(options: REGL.ReadOptions<T>): T;

    /* Dynamic variable binding */

    prop(name: string): REGL.DynamicPropVariable;
    context(name: string): REGL.DynamicContextVariable;
    this(name: string): REGL.DynamicStateVariable;

    /* Drawing */

    /** Executes an empty draw command */
    draw(): void;

    /* Resource creation */

    /** Creates an empty buffer of length `length`. */
    buffer(length: number): REGL.Buffer;
    /** Creates a buffer with the provided `data`. */
    buffer(data: REGL.BufferData): REGL.Buffer;
    /** Creates a buffer using creation `options`. */
    buffer(options: REGL.BufferOptions): REGL.Buffer;

    /* Creates an Elements object with the provided `data`. */
    elements(data: REGL.ElementsData): REGL.Elements;
    /* Creates an Elements object using creation `options`. */
    elements(options: REGL.ElementsOptions): REGL.Elements;

    /**
     * Creates an empty texture with given dimensions.
     *
     * @param width     width of a texture, in pixels (Default: `1`)
     * @param height    height of a texture, in pixels (Default: equal to `width`)
     */
    texture(width?: number, height?: number): REGL.Texture2D;
    texture(data: REGL.TextureImageData): REGL.Texture2D;
    texture(options: REGL.Texture2DOptions): REGL.Texture2D;

    cube(radius?: number): REGL.TextureCube;
    cube(
      posX: REGL.TextureImageData, negX: REGL.TextureImageData,
      posY: REGL.TextureImageData, negY: REGL.TextureImageData,
      posZ: REGL.TextureImageData, negZ: REGL.TextureImageData
    ): REGL.TextureCube;
    cube(options: REGL.TextureCubeOptions): REGL.TextureCube;

    renderbuffer(options: REGL.RenderbufferOptions): REGL.Renderbuffer;

    /* Creates a Framebuffer of dimensions 1 x 1. */
    framebuffer(): REGL.Framebuffer2D;
    /* Creates a Framebuffer of dimensions `radius` x `radius`. */
    framebuffer(radius: number): REGL.Framebuffer2D;
    /* Creates a Framebuffer of dimensions `width` x `height`. */
    framebuffer(width: number, height: number): REGL.Framebuffer2D;
    /* Creates a Framebuffer using creation `options`. */
    framebuffer(options: REGL.FramebufferOptions): REGL.Framebuffer2D;

    /* Creates a FramebufferCube whose faces have dimensions 1 x 1. */
    framebufferCube(): REGL.FramebufferCube;
    /* Creates a FramebufferCube whose faces have dimensions `radius` x `radius`. */
    framebufferCube(radius: number): REGL.FramebufferCube;
    /* Creates a FramebufferCube using creation `options`. */
    framebufferCube(options: REGL.FramebufferCubeOptions): REGL.FramebufferCube;

    /* Events and listeners */

    /**
     * Registers a `callback` to be called on each animation frame.
     *
     * This method integrates with `requestAnimationFrame` and context loss
     * events. It also calls `gl.flush` and drains several internal buffers,
     * so you should try to do all your rendering to the drawing buffer within
     * the frame callback.
     */
    frame(callback: () => void): REGL.Cancel;

    on(type: "frame", handler: () => void): REGL.Cancel;
    on(type: "lost", handler: () => void): REGL.Cancel;
    on(type: "restore", handler: () => void): REGL.Cancel;
    on(type: "destroy", handler: () => void): REGL.Cancel;

    /* Extensions */

    /**
     * Test if an extension is present. Argument is case insensitive.
     *
     * For more information on WebGL extensions, see the WebGL extension registry.
     *
     * Relevant WebGL APIs
     *
     * - [WebGL Extension Registry](https://www.khronos.org/registry/webgl/extensions/)
     * - gl.getExtension
     * - gl.getSupportedExtensions
     *
     * @param name case-insensitive name of WebGL extension
     */
    hasExtension(name: string): boolean;

    /* Poll viewport and timers */

    /**
     * Updates the values of internal times and recalculates the size of viewports.
     */
    poll(): void;

    /* Current time */

    /**
     * Returns Total time elapsed since regl was initialized in seconds.
     */
    now(): number;

    /* Destruction */

    /**
     * Destroys the gl context and releases all associated resources.
     */
    destroy(): void;

    /* Refresh */

    _refresh(): void;
  }

  interface InitializationOptions {
    /** A reference to a WebGL rendering context. (Default created from canvas) */
    gl?: WebGLRenderingContext;
    /** An HTML canvas element or a selector string to find this element. (Default created and appended to container)*/
    canvas?: string | HTMLCanvasElement;
    /** A container element into which regl inserts a canvas or a selector string to find this element. (Default document.body) */
    container?: string | HTMLElement;
    /** The context creation attributes passed to the WebGL context constructor. */
    attributes?: WebGLContextAttributes;
    /** A multiplier which is used to scale the canvas size relative to the container. (Default window.devicePixelRatio) */
    pixelRatio?: number;
    /** A list of extensions that must be supported by WebGL context. Default [] */
    extensions?: string | string[];
    /** A list of extensions which are loaded opportunistically. Default [] */
    optionalExtensions?: string | string[];
    /** If set, turns on profiling for all commands by default. (Default false) */
    profile?: boolean;
    /** An optional callback which accepts a pair of arguments, (err, regl) that is called after the application loads. If not specified, context creation errors throw */
    onDone?: (err: Error | null, regl?: Regl) => void;
  }

  interface Context {
    /** The number of frames rendered */
    readonly tick: number;
    /** Total time elapsed since regl was initialized in seconds */
    readonly time: number;
    /** Width of the current viewport in pixels */
    readonly viewportWidth: number;
    /** Height of the current viewport in pixels */
    readonly viewportHeight: number;
    /** Width of the WebGL context drawing buffer */
    readonly drawingBufferWidth: number;
    /** Height of the WebGL context drawing buffer */
    readonly drawingBufferHeight: number;
    /** The pixel ratio of the drawing buffer */
    readonly pixelRatio: number;
  }

  interface Cancel {
    cancel(): void;
  }

  interface DynamicVariable {
    /** This type is supposed to be opaque. Properties are listed only because TS casts _anything_ to `DynamicVariable`. */
    readonly id: number;
    readonly type: number;
    readonly data: string;
  }

  interface DynamicPropVariable extends REGL.DynamicVariable {
    readonly type: 1;
  }

  interface DynamicContextVariable extends REGL.DynamicVariable {
    readonly type: 2;
  }

  interface DynamicStateVariable extends REGL.DynamicVariable {
    readonly type: 3;
  }

  type DynamicVariableFn = (context: REGL.Context, props: REGL.Props, batchId: number) => PropType;

  interface ClearOptions {
    /**
     * RGBA values (range 0-1) to use when the color buffer is cleared. Initial value: [0, 0, 0, 0].
     * Relevant WebGL API: `gl.clearColor`
     */
    color?: [number, number, number, number];
    /**
     * Depth value (range 0-1) to use when the depth buffer is cleared. Initial value: 1.
     * Relevant WebGL API: `gl.clearDepth`
     */
    depth?: number;
    /**
     * The index used when the stencil buffer is cleared. Initial value: 0.
     * Relevant WebGL API: `gl.clearStencil`
     */
    stencil?: number;
    /**
     * Sets the target framebuffer to clear (if unspecified, uses the current framebuffer object).
     * Relevant WebGL API: `gl.bindFrameBuffer`
     */
    framebuffer?: REGL.Framebuffer | null;
  }

  interface ReadOptions<T> {
    /** An optional ArrayBufferView which gets the result of reading the pixels. (Default: `null`) */
    data?: T;
    /** The x-offset of the upper-left corner of the rectangle in pixels. (Default: `0`) */
    x?: number;
    /** The y-offset of the upper-left corner of the rectangle in pixels. (Default: `0`) */
    y?: number;
    /** The width of the rectangle in pixels. (Default: current framebuffer width) */
    width?: number;
    /** The height of the rectangle in pixels (Default: current framebuffer height) */
    height?: number;
    /** Sets the framebuffer to read pixels from. (Default: currently bound framebuffer) */
    framebuffer?: REGL.Framebuffer;
  }

  interface CommandBodyFn {
    /**
     * @param context       REGL context
     * @param props         additional parameters of a draw call
     * @param batchId       index of a command in a batch call
     */
    (context: REGL.Context, props: REGL.Props, batchId: number): void;
  }

  /**
   * A *command* is a complete representation of the WebGL state required
   * to perform some draw call.
   */
  interface Command {
    readonly stats: REGL.CommandStats;

    /** Run a command once. */
    (body?: REGL.CommandBodyFn): void;
    /** Run a command `count` times. */
    (count: number, body?: REGL.CommandBodyFn): void;
    /** Run a command batch. */
    (props: REGL.Props | REGL.Props[], body?: REGL.CommandBodyFn): void;
  }

  interface State {

    /* Shaders */

    /** Source code of vertex shader */
    vert?: string;
    /** Source code of fragment shader */
    frag?: string;

    /**
     * Object mapping names of uniform variables to their values.
     * To specify uniforms in GLSL structs use the fully qualified path with dot notation.
     *  example: `'nested.value': 5.3`
     * To specify uniforms in GLSL arrays use the fully qualified path with bracket notation.
     *  example: `'colors[0]': [0, 1, 0, 1]`
     *
     * Related WebGL APIs
     *
     * - gl.getUniformLocation
     * - gl.uniform
     */
    uniforms?: {
      [name: string]: REGL.Uniform;
    };

    /**
     * Object mapping names of attribute variables to their values.
     *
     * Related WebGL APIs
     *
     * - gl.vertexAttribPointer
     * - gl.vertexAttrib
     * - gl.getAttribLocation
     * - gl.vertexAttibDivisor
     * - gl.enableVertexAttribArray, gl.disableVertexAttribArray
     */
    attributes?: {
      [name: string]: REGL.Attribute;
    }

    /* Drawing */

    /**
     * Sets the primitive type. (Default: 'triangles', or inferred from `elements`)
     */
    primitive?: REGL.PrimitiveType;
    /**
     * Number of vertices to draw. (Default: 0, or inferred from `elements`)
     */
    count?: number;
    /**
     * Offset of primitives to draw. (Default: 0, or inferred from `elements`)
     */
    offset?: number;
    /**
     * Number of instances to draw. (Default: 0)
     *
     * Only applicable if the `ANGLE_instanced_arrays` extension is present.
     */
    instances?: number;
    /**
     * Element array buffer. (Default: `null`)
     *
     * Elements must be either an instance of REGL.Elements or else the arguments to REGL.Elements.
     * If `elements` is specified while `primitive`, `count` and `offset` are not,
     * then these values may be inferred from the state of the element array buffer.
     */
    elements?: REGL.Elements; // TODO number[],
    /* Render target */

    /**
     * A framebuffer to be used as a target for drawing.
     *
     * Related WebGL APIs
     *
     * - [gl.bindFramebuffer](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBindFramebuffer.xml)
     */
    framebuffer?: REGL.Framebuffer | null;

    /* Profiling */
    /** If set, turns on profiling for this command. (Default: `false`) */
    profile?: boolean;

    /* Depth buffer */

    /**
     * Related WebGL APIs
     *
     * - gl.depthFunc
     * - gl.depthMask
     * - gl.depthRange
     */
    depth?: REGL.DepthTestOptions;

    /* Blending */

    /**
     * Related WebGL APIs
     *
     * - gl.blendEquationSeparate
     * - gl.blendFuncSeparate
     * - gl.blendColor
     */
    blend?: REGL.BlendingOptions;

    /* Stencil */

    /**
     * Related WebGL APIs
     *
     * - gl.stencilFunc
     * - gl.stencilMask
     * - gl.stencilOpSeparate
     */
    stencil?: REGL.StencilOptions;

    /* Polygon offset */

    /**
     * Related WebGL APIs
     *
     * - gl.polygonOffset
     */
    polygonOffset?: REGL.PolygonOffsetOptions;

    /* Culling */

    cull?: REGL.CullingOptions;

    /* Front face */

    frontFace?: REGL.FaceWindingType;

    /* Dithering */

    dither?: boolean;

    /* Line width */

    lineWidth?: number;

    /* Color mask */

    /**
     * - [gl.colorMask](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glColorMask.xml)
     */
    colorMask?: [boolean, boolean, boolean, boolean];

    /* Sample coverage */

    /**
     * - [gl.sampleCoverage](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glSampleCoverage.xml)
     */
    sample?: REGL.SamplingOptions;

    /* Scissor */

    /**
     * - [gl.scissor](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glScissor.xml)
     */
    scissor?: REGL.ScissorOptions;

    /* Viewport */

    /**
     * - [gl.viewport](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glViewport.xml)
     */
    viewport?: REGL.ViewportOptions;
  }

  type PrimitiveType =
    /** gl.POINTS */
    "points" |
    /** gl.LINES */
    "lines" |
    /** gl.LINE_STRIP */
    "line strip" |
    /** gl.LINE_LOOP */
    "line loop" |
    /** gl.TRIANGLES */
    "triangles" |
    /** gl.TRIANGLE_STRIP */
    "triangle strip" |
    /** gl.TRIANGLE_FAN */
    "triangle fan";

  type Uniform =
    DynamicVariable |
    DynamicVariableFn |
    boolean |
    number |
    boolean[] |
    number[] |
    Float32Array |
    Int32Array;

  type Attribute =
    DynamicVariable |
    DynamicVariableFn |
    ConstantAttribute |
    AttributeConfig |
    REGL.Buffer |
    REGL.BufferData;

  interface ConstantAttribute {
    constant: number | number[];
  }

  interface AttributeConfig {
    /** A REGLBuffer wrapping the buffer object. (Default: null) */
    buffer?: REGL.Buffer;
    /** The offset of the vertexAttribPointer in bytes. (Default: 0) */
    offset?: number;
    /** The stride of the vertexAttribPointer in bytes. (Default: 0) */
    stride?: number;
    /** Whether the pointer is normalized. (Default: false) */
    normalized?: boolean;
    /** The size of the vertex attribute. (Default: Inferred from shader) */
    size?: number;
    /** Sets gl.vertexAttribDivisorANGLE. Only supported if the ANGLE_instanced_arrays extension is available. (Default: 0) */
    divisor?: number;
  }

  interface DepthTestOptions {
    enable?: boolean;
    mask?: boolean;
    func?: REGL.ComparisonOperatorType;
    range?: [number, number];
  }

  interface BlendingOptions {
    enable?: boolean;
    func?: {
      srcRGB: BlendingFunctionType;
      srcAlpha: BlendingFunctionType;
      dstRGB: BlendingFunctionType;
      dstAlpha: BlendingFunctionType;
    };
    equation?: {
      rgb?: REGL.BlendingEquationType;
      alpha?: string;
    };
    color?: [number, number, number, number];
  }

  interface StencilOptions {
    enable?: boolean;
    mask?: number;
    func?: REGL.StencilFunction;
    opFront?: REGL.StencilOperation;
    opBack?: REGL.StencilOperation;
    op?: REGL.StencilOperation;
  }

  interface StencilFunction {
    cmp: REGL.ComparisonOperatorType;
    ref: number;
    mask: number;
  }

  interface StencilOperation {
    fail: REGL.StencilOperationType;
    zfail: REGL.StencilOperationType;
    zpass: REGL.StencilOperationType;
  }

  interface PolygonOffsetOptions {
    enable?: boolean;
    offset: {
      factor: number;
      units: number;
    }
  }

  interface CullingOptions {
    enable?: boolean;
    face?: REGL.FaceOrientationType;
  }

  interface SamplingOptions {
    /** Toggles `gl.enable(gl.SAMPLE_COVERAGE)` */
    enable?: boolean;
    /** Toggles `gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE)` */
    alpha?: boolean;
    /** Sets `gl.sampleCoverage` */
    coverage?: {
      value: number;
      invert: boolean;
    }
  }

  interface ScissorOptions {
    enable: boolean;
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  }

  interface ViewportOptions {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  /*
    * Resources
    */

  /**
   * A *resource* is a handle to a GPU resident object, like a texture, FBO or buffer.
   */
  interface Resource {
    /** relevant WebGL API: `gl.deleteBuffer` */
    destroy(): void;
  }

  interface Buffer extends Resource {
    /**
     * Wraps a WebGL array buffer object.
     */
    readonly stats: {
      /** The size of the buffer in bytes. */
      size: number;
    }

    /**
     * Reinitializes the buffer with the new content.
     * Relevant WebGL API: `gl.bufferData`
     */
    (data: REGL.BufferData): void;
    (options: REGL.BufferOptions): void;

    /**
     * Update a portion of the buffer, optionally starting at byte offset `offset`.
     * Relevant WebGL API: `gl.bufferSubData`
     */
    subdata(data: REGL.BufferData, offset?: number): void;
    subdata(options: REGL.BufferOptions, offset?: number): void;
  }

  interface BufferOptions {
    /** The data for the vertex buffer. Default: null */
    data?: REGL.BufferData | null;
    /** If `data` is `null` or not present reserves space for the buffer. Default: 0 */
    length?: number;
    /** Sets array buffer usage hint. Default: 'static' */
    usage?: REGL.BufferUsageHint;
    /** Data type for vertex buffer. Default: 'uint8' */
    type?: REGL.BufferDataType;
  }

  type BufferData =
    number[] |
    number[][] |
    Uint8Array |
    Int8Array |
    Uint16Array |
    Int16Array |
    Uint32Array |
    Int32Array |
    Float32Array;

  type BufferUsageHint =
    /** gl.DRAW_STATIC */
    "static" |
    /** gl.DYNAMIC_DRAW */
    "dynamic" |
    /** gl.STREAM_DRAW */
    "stream";

  type BufferDataType =
    /** gl.UNSIGNED_BYTE */
    "uint8" |
    /** gl.BYTE */
    "int8" |
    /** gl.UNSIGNED_SHORT */
    "uint16" |
    /** gl.SHORT */
    "int16" |
    /** gl.UNSIGNED_INT */
    "uint32" |
    /** gl.INT */
    "int32" |
    /** gl.FLOAT */
    "float32" | "float";

  interface Elements extends Resource {
    /**
     * Wraps a WebGL element array buffer object.
     */

    /**
     * Reinitializes the element buffer with the new content.
     * Relevant WebGL API: `gl.bufferData`
     */
    (data: ElementsData): void;
    (options: ElementsOptions): void;

    /**
     * Update a portion of the element buffer, optionally starting at byte offset `offset`.
     * Relevant WebGL API: `gl.bufferSubData`
     */
    subdata(data: ElementsData, offset?: number): void;
    subdata(options: ElementsOptions, offset?: number): void;
  }

  interface ElementsOptions {
    /** The data of the element buffer. (Default: null) */
    data?: REGL.ElementsData | null;
    /** Usage hint (see gl.bufferData). (Default: 'static') */
    usage?: REGL.BufferUsageHint;
    /** Length of the element buffer in bytes. (Default: 0, or inferred from `data`) */
    length?: number;
    /** Default primitive type for element buffer. (Default: 0, or inferred from `data`) */
    primitive?: REGL.PrimitiveType;
    /** Data type for element buffer. (Default: 'uint8') */
    type?: REGL.ElementsDataType;
    /** Vertex count for element buffer. (Default: 0, or inferred from `data`) */
    count?: number;
  }

  type ElementsData =
    number[] |
    number[][] |
    Uint8Array |
    Uint16Array |
    Uint32Array;

  type ElementsDataType =
    "uint8" |
    "uint16" |
    "uint32";

  interface Texture2DOptions {
    /** Sets `width`, `height` and, optionally, `channels`. */
    shape?: [number, number] | [number, number, REGL.TextureChannelsType];
    /** Sets equal `width` and `height`. */
    radius?: number;
    width?: number;
    height?: number;

    data?: REGL.TextureImageData;

    mag?: REGL.TextureMagFilterType;
    min?: REGL.TextureMinFilterType;
    wrapS?: REGL.TextureWrapModeType;
    wrapT?: REGL.TextureWrapModeType;
    aniso?: number;
    type?: REGL.TextureDataType;

    mipmap?: REGL.TextureMipmapHintType;
    flipY?: boolean;
    alignment?: number;
    premultiplyAlpha?: boolean;
    colorSpace?: REGL.TextureColorSpaceType;
    unpackAlignment?: REGL.TextureUnpackAlignmentType;
    channels?: REGL.TextureChannelsType;
  }

  interface Texture extends Resource {
    readonly stats: {
        /** Size of the texture, in bytes. */
        size: number;
    }

    /** Width of texture. */
    readonly width: number;
    /** Height of texture. */
    readonly height: number;
    /** Texture format. */
    readonly format: REGL.TextureFormatType;
    /** Texture data type. */
    readonly type: REGL.TextureDataType;
    /** Texture magnification filter. */
    readonly mag: REGL.TextureMagFilterType;
    /** Texture minification filter. */
    readonly min: REGL.TextureMinFilterType;
    /** Texture wrap mode on S axis. */
    readonly wrapS: REGL.TextureWrapModeType;
    /** Texture wrap mode on T axis. */
    readonly wrapT: REGL.TextureWrapModeType;
  }

  interface Texture2D extends Texture {
    /** Reinitializes the texture. */
    (data: Texture2DOptions): void;

    /**
     * Replaces the part of texture with new data.
     *
     * @param data      image data object, similar to arguments for the texture constructor
     * @param x         horizontal offset of the image within the texture (Default: `0`)
     * @param y         vertical offset of the image within the texture (Default: `0`)
     * @param level     mipmap level of the texture to modify (Default: `0`)
     */
    subimage(data: Texture2DOptions, x?: number, y?: number, level?: number): void;

    /** Resizes a texture. */
    resize(width?: number, height?: number): void;
  }

  interface TextureCubeOptions {
    radius?: number;
    faces?: [
        TextureImageData, TextureImageData,
        TextureImageData, TextureImageData,
        TextureImageData, TextureImageData
    ];
  }

  interface TextureCube extends Texture {
    resize(): void;
    resize(radius: number): void;

    subimage(face: REGL.TextureCubeFaceIndexType, data: TextureImageData, x?: number, y?: number, level?: number);
  }

  interface Renderbuffer extends Resource {
    readonly stats: {
        /** Size of the renderbuffer in bytes. */
        size: number;
    }

    /** Width of the renderbuffer */
    readonly width: number;
    /** Height of the renderbuffer */
    readonly height: number;
    /** Format of the renderbuffer. */
    readonly format: number;

    (options: REGL.RenderbufferOptions): void;

    // resize(): void; // TODO Check implementation if this signature is valid
    // resize(radius: number): void; // TODO Check implementation if this signature is valid
    resize(width: number, height: number): void;
  }

  interface RenderbufferOptions {
    /** Sets the internal format of the render buffer (Default `'rgba4'`) */
    format?: REGL.RenderbufferFormat;
    /** Sets the width of the render buffer in pixels. (Default `1`) */
    width?: number;
    /** Sets the height of the render buffer in pixels. (Default `1`) */
    height?: number;
    /** Alias for `[width, height]`. (Default `[1, 1]`) */
    shape?: [number, number];
    /** Simultaneously sets width and height. (Default `1`) */
    radius?: number;
  }

  type RenderbufferFormat =
    RenderbufferColorFormat |
    "depth" |
    "stencil" |
    "depth stencil";

  type RenderbufferColorFormat =
    /* `gl.RGBA4` */
    "rgba4" |
    /* `gl.RGB565` */
    "rgb565" |
    /* `gl.RGB5_A1` */
    "rgb5 a1" |
    /* `gl.RGB16F`, requires EXT_color_buffer_half_float */
    "rgb16f" |
    /* `gl.RGBA16F`, requires EXT_color_buffer_half_float */
    "rgba16f" |
    /* `gl.RGBA32F`, requires WEBGL_color_buffer_float */
    "rgba32f" |
    /* `gl.SRGB8_ALPHA8`, requires EXT_sRGB */
    "srgba";

  type Framebuffer = Framebuffer2D | FramebufferCube;

  interface Framebuffer2D extends Resource {
    /* Reinitializes the Framebuffer in place using dimensions: 1 x 1. */
    (): void;
    /* Reinitializes the Framebuffer in place using dimensions: `radius` x `radius`. */
    (radius: number): void;
    /* Reinitializes the Framebuffer in place using dimensions: `width` x `height`. */
    (width: number, height: number): void;
    /* Reinitializes the Framebuffer in place using creation `options`. */
    (options: FramebufferOptions): void;

    /* Framebuffer binding */

    /* Binds a framebuffer directly. This is a short cut for creating a command which sets the framebuffer. */
    use(body: CommandBodyFn): void;

    /* Resizes the Framebuffer and all its attachments. */
    resize(radius: number): void;
    resize(width: number, height: number): void;
  }

  interface FramebufferOptions {
    /* NB: `shape`, `radius`, and `width`/`height` are alternative (and mutually exclusive) means for setting the size of the framebuffer. */
    /* Sets the dimensions [width, height] for the framebuffer. */
    shape?: [number, number];
    /* Sets the dimensions `radius` x `radius` for the framebuffer. */
    radius?: number;
    /* Sets the width of the framebuffer. Default: `gl.drawingBufferWidth` */
    width?: number;
    /* Sets the height of the framebuffer. Default: `gl.drawingBufferHeight` */
    height?: number;

    /* NB: If neither `color` nor `colors` is specified, color attachments are created automatically. */
    /* A texture or renderbuffer for the color attachment. */
    color?: REGL.Framebuffer2DAttachment;
    /* An array of textures or renderbuffers for the color attachments. */
    colors?: REGL.Framebuffer2DAttachment[];
    /* Sets the format of the color buffer. Ignored if `color` is specified. Default: 'rgba' */
    colorFormat?: REGL.FramebufferTextureColorFormat | REGL.RenderbufferColorFormat;
    /* Sets the type of the color buffer if it is a texture. Default: 'uint8' */
    colorType?: REGL.FramebufferColorDataType;
    /* Sets the number of color buffers. Values > 1 require WEBGL_draw_buffers. Default: 1 */
    colorCount?: number;
    /* If boolean, toggles the depth attachment. If a renderbuffer or texture, sets the depth attachment. Default: true */
    depth?: boolean | REGL.Framebuffer2DAttachment;
    /* If boolean, toggles the stencil attachments. If a renderbuffer or texture, sets the stencil attachment.  Default: true */
    stencil?: boolean | REGL.Framebuffer2DAttachment;
    /* If boolean, toggles both the depth and stencil attachments. If a renderbuffer or texture, sets the combined depth/stencil attachment. Default: true */
    depthStencil?: boolean | REGL.Framebuffer2DAttachment;
    /* Toggles whether depth/stencil attachments should be in texture. Requires WEBGL_depth_texture. Default: false */
    depthTexture?: boolean;
  }

  type Framebuffer2DAttachment = REGL.Texture2D | REGL.Renderbuffer;

  interface FramebufferCube extends Resource {
    /* Reinitializes the FramebufferCube in place using face dimensions 1 x 1. */
    (): void;
    /* Reinitializes the FramebufferCube in place using face dimensions `radius` x `radius`. */
    (radius: number): void;
    /* Reinitializes the FramebufferCube in place using creation `options`. */
    (options: FramebufferCubeOptions): void;

    /* Resizes the FramebufferCube and all its attachments. */
    resize(radius: number): void;
  }

  interface FramebufferCubeOptions {
    /* NB: `shape`, `radius`, and `width`/`height` are alternative (and mutually exclusive) means for setting the size of the cube. */
    /* Sets the dimensions [width, height] for each face of the cube. Width must equal height. */
    shape?: [number, number];
    /* Sets the dimensions `radius` x `radius` for each face of the cube. */
    radius?: number;
    /* Sets the width dimension for each face of the cube. Must equal `height`. */
    width?: number;
    /* Sets the height dimension for each face of the cube. Must equal `width`. */
    height?: number;

    /* A TextureCube for the color attachment. */
    color?: REGL.TextureCube;
    /* An array of TextureCubes for the color attachments. */
    colors?: REGL.TextureCube[];
    /* Sets the format of the color buffer. */
    colorFormat?: REGL.FramebufferTextureColorFormat;
    /* Sets the type of the color buffer. */
    colorType?: REGL.FramebufferColorDataType;
    /* Sets the number of color buffers. Values > 1 require WEBGL_draw_buffers. Default: 1 */
    colorCount?: number;
    /* If boolean, toggles the depth attachment. If texture, sets the depth attachment. Default: true */
    depth?: boolean | REGL.TextureCube;
    /* If boolean, toggles the stencil attachment. If texture, sets the stencil attachment. Default: true */
    stencil?: boolean | REGL.TextureCube;
    /* If boolean, toggles both the depth and stencil attachments. If texture, sets the combined depth/stencil attachment. Default: true */
    depthStencil?: boolean | REGL.TextureCube;
  }

  /* `gl.RGBA` */
  type FramebufferTextureColorFormat = "rgba";

  type FramebufferColorDataType =
    /* `gl.UNSIGNED_BYTE` */
    "uint8" |
    /* `ext.HALF_FLOAT_OES` (16-bit float), requires OES_texture_half_float */
    "half float" |
    /* `gl.FLOAT` (32-bit float), requires OES_texture_float */
    "float";

  interface Limits {
    /** An array of bits depths for the red, green, blue and alpha channels */
    colorBits: [number, number, number, number];
    /** Bit depth of drawing buffer */
    depthBits: number;
    /** Bit depth of stencil buffer */
    stencilBits: number;
    /** gl.SUBPIXEL_BITS */
    subpixelBits: number;
    /** A list of all supported extensions */
    extensions: string[];
    /** Maximum number of anisotropic filtering samples */
    maxAnisotropic: number;
    /** Maximum number of draw buffers */
    maxDrawbuffers: number;
    /** Maximum number of color attachments */
    maxColorAttachments: number;
    /** gl.ALIASED_POINT_SIZE_RANGE */
    pointSizeDims: Float32Array;
    /** gl.ALIASED_LINE_WIDTH_RANGE */
    lineWidthDims: Float32Array;
    /** gl.MAX_VIEWPORT_DIMS */
    maxViewportDims: Int32Array;
    /** gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS */
    maxCombinedTextureUnits: number;
    /** gl.MAX_CUBE_MAP_TEXTURE_SIZE */
    maxCubeMapSize: number;
    /** gl.MAX_RENDERBUFFER_SIZE */
    maxRenderbufferSize: number;
    /** gl.MAX_TEXTURE_IMAGE_UNITS */
    maxTextureUnits: number;
    /** gl.MAX_TEXTURE_SIZE */
    maxTextureSize: number;
    /** gl.MAX_VERTEX_ATTRIBS */
    maxAttributes: number;
    /** gl.MAX_VERTEX_UNIFORM_VECTORS */
    maxVertexUniforms: number;
    /** gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS */
    maxVertexTextureUnits: number;
    /** gl.MAX_VARYING_VECTORS */
    maxVaryingVectors: number;
    /** gl.MAX_FRAGMENT_UNIFORM_VECTORS */
    maxFragmentUniforms: number;
    /** gl.SHADING_LANGUAGE_VERSION */
    glsl: string;
    /** gl.RENDERER */
    renderer: string;
    /** gl.VENDOR */
    vendor: string;
    /** gl.VERSION */
    version: string;
    /** A list of all supported texture formats */
    textureFormats: TextureFormatType[];
  }

  interface Stats {
    /** The number of array buffers currently allocated */
    bufferCount: number;
    /** The number of element buffers currently allocated */
    elementsCount: number;
    /** The number of framebuffers currently allocated */
    framebufferCount: number;
    /** The number of shaders currently allocated */
    shaderCount: number;
    /** The number of textures currently allocated */
    textureCount: number;
    /** The number of cube maps currently allocated */
    cubeCount: number;
    /** The number of renderbuffers currently allocated */
    renderbufferCount: number;
    /** The maximum number of texture units used */
    maxTextureUnits: number;

    // The following functions are only available if regl is initialized with option `profile: true`

    /** The total amount of memory allocated for textures and cube maps */
    getTotalTextureSize?: () => number;
    /** The total amount of memory allocated for array buffers and element buffers */
    getTotalBufferSize?: () => number;
    /** The total amount of memory allocated for renderbuffers */
    getTotalRenderbufferSize?: () => number;
    /** The maximum number of uniforms in any shader */
    getMaxUniformsCount?: () => number;
    /** The maximum number of attributes in any shader */
    getMaxAttributesCount?: () => number;
  }

  interface CommandStats {
    /** The number of times the command has been called. */
    count: number;
    /** The cumulative CPU time spent executing the command in milliseconds. */
    cpuTime: number;
    /**
     * The cumulative GPU time spent executing the command in milliseconds
     * (requires the `EXT_disjoint_timer_query` extension).
     */
    gpuTime: number;
  }

  type ComparisonOperatorType =
    "never" |
    "always" |
    "less" | "<" |
    "lequal" | "<=" |
    "greater" | ">" |
    "gequal" | ">=" |
    "equal" | "=" |
    "notequal" | "!=";

  type BlendingEquationType =
    "add" |
    "subtract" |
    "reverse subtract" |
    "min" |
    "max";

  type BlendingFunctionType =
    "zero" | 0 |
    "one" | 1 |
    "src color" |
    "one minus src color" |
    "src alpha" |
    "one minus src alpha" |
    "dst color" |
    "one minus dst color" |
    "dst alpha" |
    "one minus dst alpha" |
    "constant color" |
    "one minus constant color" |
    "constant alpha" |
    "one minus constant alpha" |
    "src alpha saturate";

  type StencilOperationType =
    "zero" |
    "keep" |
    "replace" |
    "invert" |
    "increment" |
    "decrement" |
    "increment wrap" |
    "decrement wrap";

  type FaceOrientationType =
    "front" |
    "back";

  type FaceWindingType =
    "cw" |
    "ccw";

  // TODO Cover all possible things that could be used to create/update a texture
  // Possible candidates: HTMLImageElement, HTMLVideoElement, NDArray,
  // various typed arrays and (unflattened) JS arrays.
  type TextureImageData =
    number[] |
    number[][] |
    ArrayBufferView |
    HTMLImageElement |
    HTMLCanvasElement |
    CanvasRenderingContext2D |
    HTMLVideoElement |
    REGL.NDArray;

  type TextureFormatType =
    "alpha" |
    "luminance" |
    "luminance alpha" |
    "rgb" |
    "rgba" |
    "rgba4" |
    "rgb5 a1" |
    "rgb565" |
    "srgb" |
    "srgba" |
    "depth" |
    "depth stencil" |
    "rgb s3tc dxt1" |
    "rgba s3tc dxt1" |
    "rgba s3tc dxt3" |
    "rgba s3tc dxt5" |
    "rgb atc" |
    "rgba atc explicit alpha" |
    "rgba atc interpolated alpha" |
    "rgb pvrtc 4bppv1" |
    "rgb pvrtc 2bppv1" |
    "rgba pvrtc 4bppv1" |
    "rgba pvrtc 2bppv1" |
    "rgb etc1";

  type TextureDataType =
    "uint8" |
    "uint16" |
    "uint32" |
    "float" |
    "half float";

  type TextureMagFilterType =
    "nearest" |
    "linear";

  type TextureMinFilterType =
    "nearest" |
    "linear" |
    "linear mipmap linear" | "mipmap" |
    "nearest mipmap linear" |
    "linear mipmap nearest" |
    "nearest mipmap nearest";

  type TextureMipmapHintType =
    "don't care" | "dont care" |
    "nice" |
    "fast";

  type TextureColorSpaceType =
    "none" | "browser";

  type TextureWrapModeType =
    "repeat" |
    "clamp" |
    "mirror";

  type TextureChannelsType = 1 | 2 | 3 | 4;

  type TextureUnpackAlignmentType = 1 | 2 | 4 | 8;

  type TextureCubeFaceIndexType = 0 | 1 | 2 | 3 | 4 | 5;

  type Props = {
    [name: string]: PropType;
  }

  type PropType =
    boolean |
    number |
    REGL.DynamicVariable |
    REGL.DynamicVariableFn |
    REGL.PropArray |
    REGL.Props;

  // TypeScript doesn't allow directly specify recursive structures like
  // type PropType = ... | PropType[];
  // https://github.com/Microsoft/TypeScript/issues/3988
  interface PropArray extends Array<PropType> { }

  /**
   * An N-dimensional array, as per `ndarray` module.
   *
   * More detailed typing does not belong here, so we assume
   * anything with `shape`, `stride`, `offset` and `data` is ok.
   *
   * TODO Reuse typings from `ndarray` module
   */
  interface NDArray {
    shape: any;
    stride: any;
    offset: any;
    data: any;
  }
}
