// Type definitions for regl 2.0.0
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
   * `Regl` represents the object/function returned from the `REGL` constructor. It exposes the
   * entire public interface of the `regl` library.
   */
  export interface Regl {
    /**
     * The context creation attributes passed to the WebGL context constructor.
     */
    readonly attributes: WebGLContextAttributes;
    /**
     * `regl` is designed in such a way that you should never have to directly access the underlying
     * WebGL context. However, if you really absolutely need to do this for some reason (for example
     * to interface with an external library), you can still get a reference to the WebGL context
     * via the property `_gl`.
     */
    readonly _gl: WebGLRenderingContext;
    /**
     * `regl` exposes info about the WebGL context limits and capabilities via the `limits` object.
     */
    readonly limits: REGL.Limits;
    /**
     * `regl` tracks several metrics for performance monitoring. These can be read using the `stats` object.
     */
    readonly stats: REGL.Stats;

    /**
     * Creates a new REGL command. The resulting command, when executed,
     * will set a WebGL state machine to a specified `state`.
     */
    <
      Uniforms extends {} = {},
      Attributes extends {} = {},
      Props extends {} = {},
      OwnContext extends {} = {},
      ParentContext extends REGL.DefaultContext = REGL.DefaultContext
    >(
      drawConfig: REGL.DrawConfig<Uniforms, Attributes, Props, OwnContext, ParentContext>,
    ): REGL.DrawCommand<ParentContext & OwnContext, Props>;

    /**
     * Clears selected buffers to specified values.
     * If an option is not present, then the corresponding buffer is not cleared.
     * Relevant WebGL API: `gl.clear`
     */
    clear(options: REGL.ClearOptions): void;

    /* Reading pixels */

    /**
     * Read entire screen.
     * NB: Reading into a Float32Array requires OES_texture_float.
     */
    read<T extends Uint8Array | Float32Array = Uint8Array>(): T;

    /**
     * Read entire screen into an existing TypedArray.
     * NB: Reading into a Float32Array requires OES_texture_float.
     */
    read<T extends Uint8Array | Float32Array>(data: T): T;

    /**
     * Read a selected region of screen or framebuffer.
     * NB: Reading into a Float32Array requires OES_texture_float.
     */
    read<T extends Uint8Array | Float32Array = Uint8Array>(options: REGL.ReadOptions<T>): T;

    /**
     * Dynamic variable binding
     *
     * `prop`, `context`, and `this` generate DynamicVariables, which can be used as values in a
     * REGL.DrawConfig object. A DynamicVariable is an abstraction that will render a value only
     * when the DrawCommand with which it's associated is invoked.
     */

    /* Retrieve the property `name` passed when the draw command is executed. */
    prop<Props extends {}, Key extends keyof Props = keyof Props>(name: Key): DynamicVariable<Props[Key]>;
    /* Retrieve the context property `name` when the draw command is executed. */
    context<Context extends REGL.DefaultContext, K extends keyof Context = keyof Context>(name: K): DynamicVariable<Context[K]>;
    /* Retrieve the property `name` of the object in whose context the draw command is executing. */
    this<This extends {}, Key extends keyof This = keyof This>(name: Key): DynamicVariable<This[Key]>;

    /* Drawing */

    /** Executes an empty draw command. */
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

    /* Creates a 2D Texture of dimensions 1 x 1. */
    texture(): REGL.Texture2D;
    /* Creates a 2D Texture of dimensions `radius` x `radius`. */
    texture(radius: number): REGL.Texture2D;
    /* Creates a 2D Texture of dimensions `width` x `height`. */
    texture(width: number, height: number): REGL.Texture2D;
    /* Creates a 2D Texture using the provided `data`. */
    texture(data: REGL.TextureImageData): REGL.Texture2D;
    /* Creates a 2D Texture using creation `options`. */
    texture(options: REGL.Texture2DOptions): REGL.Texture2D;

    /* Creates a cube-map texture with faces of dimensions 1 x 1. */
    cube(): REGL.TextureCube;
    /* Creates a cube-map texture with faces of dimensions `radius` x `radius`. */
    cube(radius: number): REGL.TextureCube;
    /* Creates a cube-map texture using the provided image data for the six faces. */
    cube(
      posXData: REGL.TextureImageData, negXData: REGL.TextureImageData,
      posYData: REGL.TextureImageData, negYData: REGL.TextureImageData,
      posZData: REGL.TextureImageData, negZData: REGL.TextureImageData
    ): REGL.TextureCube;
    /* Creates a cube-map texture using the provided creation options for the six faces. */
    cube(
      posXOptions: REGL.Texture2DOptions, negXOptions: REGL.Texture2DOptions,
      posYOptions: REGL.Texture2DOptions, negYOptions: REGL.Texture2DOptions,
      posZOptions: REGL.Texture2DOptions, negZOptions: REGL.Texture2DOptions,
    ): REGL.TextureCube;
    /* Creates a cube-map texture using creation `options`. */
    cube(options: REGL.TextureCubeOptions): REGL.TextureCube;

    /* Creates a Renderbuffer of dimensions 1 x 1. */
    renderbuffer(): REGL.Renderbuffer;
    /* Creates a Renderbuffer of dimensions `radius` x `radius`. */
    renderbuffer(radius: number): REGL.Renderbuffer;
    /* Creates a Renderbuffer of dimensions `width` x `height`. */
    renderbuffer(width: number, height: number): REGL.Renderbuffer;
    /* Creates a Renderbuffer using creation `options`. */
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

    /* Creates a vertex array object */
    vao(attributes: REGL.AttributeState[] | REGL.VertexArrayOptions) : REGL.VertexArrayObject;

    /* Events and listeners */

    /**
     * Registers a `callback` to be called on each animation frame.
     *
     * This method integrates with `requestAnimationFrame` and context loss
     * events. It also calls `gl.flush` and drains several internal buffers,
     * so you should try to do all your rendering to the drawing buffer within
     * the frame callback.
     */
    frame(callback: REGL.FrameCallback): REGL.Cancellable;

    /**
     * Registers a handler function to be called when the associated `regl` event is fired.
     */
    on(type: 'frame', callback: REGL.FrameCallback): REGL.Cancellable
    on(type: 'lost' | 'restore' | 'destroy', callback: () => void): REGL.Cancellable;

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

    /**
     * Updates the values of internal times and recalculates the size of viewports.
     */
    poll(): void;

    /**
     * Returns Total time elapsed since regl was initialized in seconds.
     */
    now(): number;

    /**
     * Destroys the gl context and releases all associated resources.
     */
    destroy(): void;

    /**
     * `regl` is designed in such a way that you should never have to directly access the underlying
     * WebGL context. However, if you really absolutely need to do this for some reason (for example
     * to interface with an external library), you can still get a reference to the WebGL context
     * via the property `REGL._gl`. Note, though, that if you have changed the WebGL state, you must
     * call `_refresh` to restore the `regl` state in order to prevent rendering errors.
     */
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

  interface DefaultContext {
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

  type UserContext<
    ParentContext extends REGL.DefaultContext,
    OwnContext extends {},
    Props extends {}
  > = {
    [Key in keyof OwnContext]: MaybeDynamic<OwnContext[Key], ParentContext, Props>;
  };

  interface Cancellable {
    cancel(): void;
  }

  /**
   * A handler function invoked when `regl` fires the "frame" event. It is passed the default Context.
   */
  type FrameCallback = (context: REGL.DefaultContext) => void;

  interface DynamicVariable<Return> {
    /**
     * This type is supposed to be opaque. Properties are listed only because TS casts _anything_ to `DynamicVariable`.
     * The type parameter `Return`, though unused in the body of the interface, is useful as a
     * marker to ensure the correct type is rendered when the associated `DrawCommand` is invoked.
     */
    readonly id: number;
    readonly type: number;
    readonly data: string;
  }

  type DynamicVariableFn<
    Return,
    Context extends REGL.DefaultContext = REGL.DefaultContext,
    Props extends {} = {}
  > =
    (context: Context, props: Props, batchId: number) => Return;

  type MaybeDynamic<Type, Context extends REGL.DefaultContext, Props extends {}> =
    Type |
    DynamicVariable<Type> |
    DynamicVariableFn<Type, Context, Props>;

  type MaybeNestedDynamic<Type, Context extends REGL.DefaultContext, Props extends {}> =
    { [K in keyof Type]: MaybeDynamic<Type[K], Context, Props> };

  interface ClearOptions {
    /**
     * RGBA values (range 0-1) to use when the color buffer is cleared. Initial value: [0, 0, 0, 0].
     * Relevant WebGL API: `gl.clearColor`
     */
    color?: REGL.Vec4;
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

  interface ReadOptions<T = Uint8Array> {
    /** An optional TypedArray which gets the result of reading the pixels. (Default: `null`, i.e. return a new TypedArray) */
    data?: T | null;
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

  /**
   * Commands can be nested using scoping. If a `DrawCommand` is passed a `CommandBodyFn`, then the
   * `DrawCommand` is evaluated and its state variables are saved as the defaults for all
   * `DrawCommand`s invoked within the `CommandBodyFn`.
   *
   * @param context       REGL context
   * @param props         additional parameters of a draw call
   * @param batchId       index of a command in a batch call
   */
  type CommandBodyFn<
    Context extends REGL.DefaultContext = REGL.DefaultContext,
    Props extends {} = {}
  > = (context: Context, props: Props, batchId: number) => void;

  /**
   * Draw commands are the fundamental abstraction in regl. A draw command wraps up all of the WebGL
   * state associated with a draw call (either drawArrays or drawElements) and packages it into a
   * single reusable function.
   */
  interface DrawCommand<
    Context extends REGL.DefaultContext = REGL.DefaultContext,
    Props extends {} = {}
  > {
    readonly stats: REGL.CommandStats;

    /** Run a command once. */
    (body?: REGL.CommandBodyFn<Context, Props>): void;
    /** Run a command `count` times. */
    (count: number, body?: REGL.CommandBodyFn<Context, Props>): void;
    /** Run a command with props. */
    (props: Partial<Props>, body?: REGL.CommandBodyFn<Context, Props>): void;
    /** Run a command batch. */
    (props: Array<Partial<Props>>, body?: REGL.CommandBodyFn<Context, Props>): void;
  }

  interface DrawConfig<
    Uniforms extends {} = {},
    Attributes extends {} = {},
    Props extends {} = {},
    OwnContext extends {} = {},
    ParentContext extends REGL.DefaultContext = REGL.DefaultContext
  > {

    /* Shaders */

    /** Source code of vertex shader */
    vert?: MaybeDynamic<string, ParentContext & OwnContext, Props>;
    /** Source code of fragment shader */
    frag?: MaybeDynamic<string, ParentContext & OwnContext, Props>;

    /**
     * Object mapping user-defined keys to user-defined values to be accessed via `DynamicVariable`s
     * or `DynamicVariableFn`s elsewhere in the `DrawConfig` or in scoped `DrawCommand`s.
     * Context variables in `regl` are computed before any other parameters and can also be passed
     * from a scoped command to any sub-commands.
     * Both `DynamicVariable`s and `DynamicVariableFn`s can be used as values in the context object,
     * making it possible to define new context properties derived from existing context properties
     * or from `props`.
     */
    context?: REGL.UserContext<ParentContext, OwnContext, Props>,

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
    uniforms?: REGL.MaybeDynamicUniforms<Uniforms, ParentContext & OwnContext, Props>,

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
    attributes?: REGL.MaybeDynamicAttributes<Attributes, ParentContext & OwnContext, Props>,

    /**
     * Configuration of vertex array object
     */
    vao?: REGL.MaybeDynamic<REGL.VertexArrayObject | AttributeState[], ParentContext & OwnContext, Props>,

    /* Drawing */

    /**
     * Sets the primitive type. (Default: 'triangles', or inferred from `elements`)
     */
    primitive?: MaybeDynamic<REGL.PrimitiveType, ParentContext & OwnContext, Props>;
    /**
     * Number of vertices to draw. (Default: 0, or inferred from `elements`)
     */
    count?: MaybeDynamic<number, ParentContext & OwnContext, Props>;
    /**
     * Offset of primitives to draw. (Default: 0, or inferred from `elements`)
     */
    offset?: MaybeDynamic<number, ParentContext & OwnContext, Props>;
    /**
     * Number of instances to draw. (Default: 0)
     *
     * Only applicable if the `ANGLE_instanced_arrays` extension is present.
     */
    instances?: MaybeDynamic<number, ParentContext & OwnContext, Props>;
    /**
     * Element array buffer. (Default: `null`)
     *
     * Elements must be either an instance of REGL.Elements or else the arguments to REGL.Elements.
     * If `elements` is specified while `primitive`, `count` and `offset` are not,
     * then these values may be inferred from the state of the element array buffer.
     */
    elements?: MaybeDynamic<
      REGL.Elements | ElementsData | ElementsOptions | null,
      ParentContext & OwnContext,
      Props
    >;

    /* Render target */

    /**
     * A framebuffer to be used as a target for drawing. (Default: `null`)
     * Passing null sets the framebuffer to the drawing buffer.
     * Updating the render target will modify the viewport.
     *
     * Related WebGL APIs
     *
     * - [gl.bindFramebuffer](https://www.khronos.org/opengles/sdk/docs/man/xhtml/glBindFramebuffer.xml)
     */
    framebuffer?: MaybeDynamic<REGL.Framebuffer | null, ParentContext & OwnContext, Props>;

    /* Profiling */

    /**
     * If set, turns on profiling for this command. (Default: `false`)
     * Profiling stats can be accessed via the `stats` property of the `DrawCommand`.
     */
    profile?: MaybeDynamic<boolean, ParentContext & OwnContext, Props>;

    /* Depth buffer */

    /**
     * Related WebGL APIs
     *
     * - gl.depthFunc
     * - gl.depthMask
     * - gl.depthRange
     */
    depth?: MaybeDynamic<REGL.DepthTestOptions, ParentContext & OwnContext, Props>;

    /* Blending */

    /**
     * Related WebGL APIs
     *
     * - gl.blendEquationSeparate
     * - gl.blendFuncSeparate
     * - gl.blendColor
     */
    blend?: MaybeDynamic<REGL.BlendingOptions, ParentContext & OwnContext, Props>;

    /* Stencil */

    /**
     * Related WebGL APIs
     *
     * - gl.stencilFunc
     * - gl.stencilMask
     * - gl.stencilOpSeparate
     */
    stencil?: MaybeDynamic<REGL.StencilOptions, ParentContext & OwnContext, Props>;

    /* Polygon offset */

    /**
     * Related WebGL APIs
     *
     * - gl.polygonOffset
     */
    polygonOffset?: MaybeDynamic<REGL.PolygonOffsetOptions, ParentContext & OwnContext, Props>;

    /* Culling */

    cull?: MaybeDynamic<REGL.CullingOptions, ParentContext & OwnContext, Props>;

    /* Front face */

    /* Sets gl.frontFace. Default: 'ccw' */
    frontFace?: MaybeDynamic<REGL.FaceWindingType, ParentContext & OwnContext, Props>;

    /* Dithering */

    /* Toggles `gl.DITHER`. Default: false */
    dither?: MaybeDynamic<boolean, ParentContext & OwnContext, Props>;

    /* Line width */

    /* Sets `gl.lineWidth`. Default: 1 */
    lineWidth?: MaybeDynamic<number, ParentContext & OwnContext, Props>;

    /* Color mask */

    /* Sets `gl.colorMask`. Default: [true, true, true, true] */
    colorMask?: MaybeDynamic<REGL.BVec4, ParentContext & OwnContext, Props>;

    /* Sample coverage */

    sample?: MaybeDynamic<REGL.SamplingOptions, ParentContext & OwnContext, Props>;

    /* Scissor */

    scissor?: MaybeNestedDynamic<REGL.ScissorOptions, ParentContext & OwnContext, Props>;

    /* Viewport */

    /**
     * Sets `gl.viewport`. Default: {}
     * Updating `viewport` will modify the context variables `viewportWidth` and `viewportHeight`.
     */
    viewport?: MaybeDynamic<REGL.BoundingBox, ParentContext & OwnContext, Props>;
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
    boolean |
    number |
    boolean[] |
    number[] |
    Float32Array |
    Int32Array;

  interface Uniforms {
    [name: string]: Uniform;
  }

  type MaybeDynamicUniforms<
    Uniforms extends REGL.Uniforms,
    Context extends REGL.DefaultContext,
    Props extends {}
  > = {
    [Key in keyof Uniforms]: MaybeDynamic<Uniforms[Key], Context, Props>|MaybeDynamic<Uniforms[Key], Context, Props>[];
  }

  type AttributeState =
    ConstantAttribute |
    AttributeConfig |
    REGL.Buffer |
    REGL.BufferData;

  type Attribute =
    number |
    AttributeState;

  interface Attributes {
    [name: string]: Attribute;
  }

  type MaybeDynamicAttributes<
    Attributes extends REGL.Attributes,
    Context extends REGL.DefaultContext,
    Props extends {}
  > = {
    [Key in keyof Attributes]: MaybeDynamic<Attributes[Key], Context, Props>;
  }

  interface ConstantAttribute {
    constant: number | number[];
  }

  interface AttributeConfig {
    /** A REGLBuffer wrapping the buffer object. (Default: null) */
    buffer?: REGL.Buffer|undefined|null|false;
    /** The offset of the vertexAttribPointer in bytes. (Default: 0) */
    offset?: number|undefined;
    /** The stride of the vertexAttribPointer in bytes. (Default: 0) */
    stride?: number|undefined;
    /** Whether the pointer is normalized. (Default: false) */
    normalized?: boolean;
    /** The size of the vertex attribute. (Default: Inferred from shader) */
    size?: number|undefined;
    /** Sets gl.vertexAttribDivisorANGLE. Only supported if the ANGLE_instanced_arrays extension is available. (Default: 0) */
    divisor?: number|undefined;
    /** Data type for attribute */
    type?: 'uint8'|'uint16'|'uint32'|'float'|'int8'|'int16'|'int32';
  }

  interface DepthTestOptions {
    /* Toggles `gl.enable(gl.DEPTH_TEST)`. Default: true */
    enable?: boolean;
    /* Sets `gl.depthMask`. Default: true */
    mask?: boolean;
    /* Sets `gl.depthRange`. Default: [0, 1] */
    range?: [number, number];
    /* Sets `gl.depthFunc`. Default: 'less' */
    func?: REGL.ComparisonOperatorType;
  }

  type ComparisonOperatorType =
    /* `gl.NEVER` */
    "never" |
    /* `gl.ALWAYS` */
    "always" |
    /* `gl.LESS` */
    "less" | "<" |
    /* `gl.LEQUAL` */
    "lequal" | "<=" |
    /* `gl.GREATER` */
    "greater" | ">" |
    /* `gl.GEQUAL` */
    "gequal" | ">=" |
    /* `gl.EQUAL` */
    "equal" | "=" |
    /* `gl.NOTEQUAL` */
    "notequal" | "!=";

  interface BlendingOptions {
    /* Toggles `gl.enable(gl.BLEND)`. Default: false */
    enable?: boolean;
    /**
     * `equation` can be either a string or an object with the fields {rgb, alpha}.
     * The former corresponds to `gl.blendEquation` and the latter to `gl.blendEquationSeparate`.
     * Default: 'add'
     */
    equation?: REGL.BlendingEquation | REGL.BlendingEquationSeparate;
    /**
     * `func` can be an object with the fields {src, dst} or {srcRGB, srcAlpha, dstRGB, dstAlpha},
     * with the former corresponding to gl.blendFunc and the latter to gl.blendFuncSeparate.
     * Default: { src: 'src alpha', dst: 'one minus src alpha' }
     */
    func?: REGL.BlendingFunctionCombined | REGL.BlendingFunctionSeparate;
    /* Sets `gl.blendColor` */
    color?: REGL.Vec4;
  }

  interface BlendingEquationSeparate {
    rgb: REGL.BlendingEquation;
    alpha: REGL.BlendingEquation;
  }

  type BlendingEquation =
    /* `gl.FUNC_ADD` */
    "add" |
    /* `gl.FUNC_SUBTRACT` */
    "subtract" |
    /* `gl.FUNC_REVERSE_SUBTRACT` */
    "reverse subtract" |
    /* `gl.MIN_EXT`, requires `EXT_blend_minmax` */
    "min" |
    /* `gl.MAX_EXT`, requires `EXT_blend_minmax` */
    "max";

  interface BlendingFunctionCombined {
    src: REGL.BlendingFunction;
    dst: REGL.BlendingFunction;
  }

  interface BlendingFunctionSeparate {
    srcRGB: REGL.BlendingFunction;
    srcAlpha: REGL.BlendingFunction;
    dstRGB: REGL.BlendingFunction;
    dstAlpha: REGL.BlendingFunction;
  }

  type BlendingFunction =
    /* `gl.ZERO` */
    "zero" | 0 |
    /* `gl.ONE` */
    "one" | 1 |
    /* `gl.SRC_COLOR` */
    "src color" |
    /* `gl.ONE_MINUS_SRC_COLOR` */
    "one minus src color" |
    /* `gl.SRC_ALPHA` */
    "src alpha" |
    /* `gl.ONE_MINUS_SRC_ALPHA` */
    "one minus src alpha" |
    /* `gl.DST_COLOR` */
    "dst color" |
    /* `gl.ONE_MINUS_DST_COLOR` */
    "one minus dst color" |
    /* `gl.DST_ALPHA` */
    "dst alpha" |
    /* `gl.ONE_MINUS_DST_ALPHA` */
    "one minus dst alpha" |
    /* `gl.CONSTANT_COLOR` */
    "constant color" |
    /* `gl.ONE_MINUS_CONSTANT_COLOR` */
    "one minus constant color" |
    /* `gl.CONSTANT_ALPHA` */
    "constant alpha" |
    /* `gl.ONE_MINUS_CONSTANT_ALPHA` */
    "one minus constant alpha" |
    /* `gl.SRC_ALPHA_SATURATE` */
    "src alpha saturate";

  interface StencilOptions {
    /* Toggles `gl.enable(gl.STENCIL_TEST)`. Default: false */
    enable?: boolean;
    /* Sets `gl.stencilMask`. Default: -1 */
    mask?: number;
    /* Sets `gl.stencilFunc`. Default: { cmp: 'always', ref: 0, mask: -1 } */
    func?: REGL.StencilFunction;
    /**
     * Sets `gl.stencilOpSeparate` for front face.
     * Default: { fail: 'keep', zfail: 'keep', zpass: 'keep' }
     */
    opFront?: REGL.StencilOperation;
    /**
     * Sets `gl.stencilOpSeparate` for back face.
     * Default: { fail: 'keep', zfail: 'keep', zpass: 'keep' }
     */
    opBack?: REGL.StencilOperation;
    /* Sets opFront and opBack simultaneously (`gl.stencilOp`). */
    op?: REGL.StencilOperation;
  }

  interface StencilFunction {
    /* comparison function */
    cmp: REGL.ComparisonOperatorType;
    /* reference value */
    ref: number;
    /* comparison mask */
    mask: number;
  }

  interface StencilOperation {
    /* The stencil operation applied when the stencil test fails. */
    fail: REGL.StencilOperationType;
    /* The stencil operation applied when the stencil test passes and the depth test fails. */
    zfail: REGL.StencilOperationType;
    /* The stencil operation applied when when both stencil and depth tests pass. */
    zpass: REGL.StencilOperationType;
  }

  type StencilOperationType =
    /* `gl.ZERO` */
    "zero" |
    /* `gl.KEEP` */
    "keep" |
    /* `gl.REPLACE` */
    "replace" |
    /* `gl.INVERT` */
    "invert" |
    /* `gl.INCR` */
    "increment" |
    /* `gl.DECR` */
    "decrement" |
    /* `gl.INCR_WRAP` */
    "increment wrap" |
    /* `gl.DECR_WRAP` */
    "decrement wrap";

  interface PolygonOffsetOptions {
    /* Toggles `gl.enable(gl.POLYGON_OFFSET_FILL)`. Default: false */
    enable?: boolean;
    /* Sets `gl.polygonOffset`. Default: { factor: 0, units: 0 } */
    offset?: REGL.PolygonOffset;
  }

  interface PolygonOffset {
    factor: number;
    units: number;
  }

  interface CullingOptions {
    /* Toggles `gl.enable(gl.CULL_FACE)`. Default: false */
    enable?: boolean;
    /* Sets `gl.cullFace`. Default: 'back' */
    face?: REGL.FaceOrientationType;
  }

  type FaceOrientationType =
    /* `gl.FRONT` */
    "front" |
    /* `gl.BACK` */
    "back";

  type FaceWindingType =
    /* `gl.CW` */
    "cw" |
    /* `gl.CCW` */
    "ccw";

  interface SamplingOptions {
    /** Toggles `gl.enable(gl.SAMPLE_COVERAGE)`. Default: false */
    enable?: boolean;
    /** Toggles `gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE)`. Default: false */
    alpha?: boolean;
    /** Sets `gl.sampleCoverage`. Default: { value: 1, invert: false } */
    coverage?: REGL.SampleCoverage;
  }

  interface SampleCoverage {
    value: number;
    invert: boolean;
  }

  interface ScissorOptions {
    /* Toggles gl.enable(gl.SCISSOR). Default: false */
    enable?: boolean;
    /* Sets `gl.SCISSOR`. Default: {} */
    box?: REGL.BoundingBox;
  }

  interface BoundingBox {
    /* left coordinate of the box; Default: 0 */
    x?: number;
    /* top coordiante of the box; Default: 0 */
    y?: number;
    /* width of the box; Default: framebuffer width - `x` */
    width?: number;
    /* height of the box; Default: framebuffer height - `y` */
    height?: number;
  }

  /*
   * Resources
   */

  /**
   * A *resource* is a handle to a GPU resident object, like a texture, FBO or buffer.
   */
  interface Resource {
    /**
     * relevant WebGL APIs:
     * - `gl.deleteBuffer`
     * - `gl.deleteTexture`
     * - `gl.deleteRenderbuffer`
     * - `gl.deleteFramebuffer`
     */
    destroy(): void;
  }

  interface VertexArrayObject extends REGL.Resource {
    (attributes:REGL.AttributeState[] | REGL.VertexArrayOptions) : REGL.VertexArrayObject;
  }

  interface Buffer extends REGL.Resource {
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
    (data: REGL.BufferData): REGL.Buffer;
    (options: REGL.BufferOptions): REGL.Buffer;

    /**
     * Update a portion of the buffer, optionally starting at byte offset `offset`.
     * Relevant WebGL API: `gl.bufferSubData`
     */
    subdata(data: REGL.BufferData, offset?: number): REGL.Buffer;
    subdata(options: REGL.BufferOptions, offset?: number): REGL.Buffer;
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

  interface Elements extends REGL.Resource {
    /**
     * Wraps a WebGL element array buffer object.
     */

    /**
     * Reinitializes the element buffer with the new content.
     * Relevant WebGL API: `gl.bufferData`
     */
    (data: REGL.ElementsData): REGL.Elements;
    (options: REGL.ElementsOptions): REGL.Elements;

    /**
     * Update a portion of the element buffer, optionally starting at byte offset `offset`.
     * Relevant WebGL API: `gl.bufferSubData`
     */
    subdata(data: REGL.ElementsData, offset?: number): REGL.Elements;
    subdata(options: REGL.ElementsOptions, offset?: number): REGL.Elements;
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

  interface VertexArrayOptions {
    attributes: AttributeState[];
    elements?: REGL.Elements | REGL.ElementsOptions | REGL.ElementsData | null;
    count?:number;
    offset?:number;
    primitive?:PrimitiveType;
    instances?:number;
  }

  interface Texture extends Resource {
    readonly stats: {
        /** Size of the texture in bytes. */
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

  type TextureFormatType =
    /* `gl.ALPHA`; channels: 1; types: 'uint8', 'half float', 'float' */
    "alpha" |
    /* `gl.LUMINANCE`; channels: 1; types: 'uint8', 'half float', 'float' */
    "luminance" |
    /* `gl.LUMINANCE_ALPHA`; channels: 2; types: 'uint8', 'half float', 'float' */
    "luminance alpha" |
    /* `gl.RGB`; channels: 3; types: 'uint8', 'half float', 'float' */
    "rgb" |
    /* `gl.RGBA`; channels: 4; types: 'uint8', 'half float', 'float' */
    "rgba" |
    /* `gl.RGBA4`; channels: 4; types: 'rgba4' */
    "rgba4" |
    /* `gl.RGB5_A1`; channels: 4; types: 'rgba5 a1' */
    "rgb5 a1" |
    /* `gl.RGB565`; channels: 3; types: 'rgb565' */
    "rgb565" |
    /* `ext.SRGB`; channels: 3; types: 'uint8', 'half float', 'float' */
    "srgb" |
    /* `ext.RGBA`; channels: 4; types: 'uint8', 'half float', 'float' */
    "srgba" |
    /* `gl.DEPTH_COMPONENT`; channels: 1; types: 'uint16', 'uint32' */
    "depth" |
    /* `gl.DEPTH_STENCIL`; channels: 2; 'depth stencil' */
    "depth stencil" |
    /* `ext.COMPRESSED_RGB_S3TC_DXT1_EXT`; channels: 3; types: 'uint8' */
    "rgb s3tc dxt1" |
    /* `ext.COMPRESSED_RGBA_S3TC_DXT1_EXT`; channels: 4; types: 'uint8' */
    "rgba s3tc dxt1" |
    /* `ext.COMPRESSED_RGBA_S3TC_DXT3_EXT`; channels: 4; types: 'uint8' */
    "rgba s3tc dxt3" |
    /* `ext.COMPRESSED_RGBA_S3TC_DXT5_EXT`; channels: 4; types: 'uint8' */
    "rgba s3tc dxt5" |
    /* `ext.COMPRESSED_RGB_ATC_WEBGL`; channels: 3; types: 'uint8' */
    "rgb atc" |
    /* `ext.COMPRESSED_RGBA_ATC_EXPLICIT_ALPHA_WEBGL`; channels: 4; types: 'uint8' */
    "rgba atc explicit alpha" |
    /* `ext.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL`; channels: 4; types: 'uint8' */
    "rgba atc interpolated alpha" |
    /* `ext.COMPRESSED_RGB_PVRTC_4BPPV1_IMG`; channels: 3; types: 'uint8' */
    "rgb pvrtc 4bppv1" |
    /* `ext.COMPRESSED_RGB_PVRTC_2BPPV1_IMG`; channels: 3; types: 'uint8' */
    "rgb pvrtc 2bppv1" |
    /* `ext.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG`; channels: 4; types: 'uint8' */
    "rgba pvrtc 4bppv1" |
    /* `ext.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG`; channels: 4; types: 'uint8' */
    "rgba pvrtc 2bppv1" |
    /* `ext.COMPRESSED_RGB_ETC1_WEBGL`; channels: 3; types: 'uint8' */
    "rgb etc1";

  type TextureDataType =
    /* `gl.UNSIGNED_BYTE` */
    "uint8" |
    /* `gl.UNSIGNED_SHORT` */
    "uint16" |
    /* `gl.UNSIGNED_INT` */
    "uint32" |
    /* `gl.FLOAT` */
    "float" | "float32" |
    /* `ext.HALF_FLOAT_OES` */
    "half float" | "float16";

  /* Related WebGL API: `gl.MAG_FILTER` */
  type TextureMagFilterType =
    /* `gl.NEAREST` */
    "nearest" |
    /* `gl.LINEAR` */
    "linear";

  /* Related WebGL API: `gl.MIN_FILTER` */
  type TextureMinFilterType =
    /* `gl.NEAREST` */
    "nearest" |
    /* `gl.LINEAR` */
    "linear" |
    /* `gl.LINEAR_MIPMAP_LINEAR` */
    "linear mipmap linear" | "mipmap" |
    /* `gl.NEAREST_MIPMAP_LINEAR` */
    "nearest mipmap linear" |
    /* `gl.LINEAR_MIPMAP_NEAREST` */
    "linear mipmap nearest" |
    /* `gl.NEAREST_MIPMAP_NEAREST` */
    "nearest mipmap nearest";

  type TextureWrapModeType =
    /* `gl.REPEAT` */
    "repeat" |
    /* `gl.CLAMP_TO_EDGE` */
    "clamp" |
    /* `gl.MIRRORED_REPEAT` */
    "mirror";

  interface Texture2D extends Texture {
    /* Reinitializes the texture in place with dimensions 1 x 1. */
    (): REGL.Texture2D;
    /* Reinitializes the texture in place with dimensions `radius` x `radius`. */
    (radius: number): REGL.Texture2D;
    /* Reinitializes the texture in place with dimensions `width` x `height`. */
    (width: number, height: number): REGL.Texture2D;
    /* Reinitializes the texture in place using the provided `data`. */
    (data: REGL.TextureImageData): REGL.Texture2D;
    /* Reinitializes the texture in place using creation `options`. */
    (options: REGL.Texture2DOptions): REGL.Texture2D;

    /**
     * Replaces the part of texture with new data.
     *
     * @param data      image data object, similar to arguments for the texture constructor
     * @param x         horizontal offset of the image within the texture (Default: `0`)
     * @param y         vertical offset of the image within the texture (Default: `0`)
     * @param level     mipmap level of the texture to modify (Default: `0`)
     */
    /* Replaces the area at offset `x` (default: 0), `y` (default: 0), with `data`. */
    subimage(data: REGL.TextureImageData, x?: number, y?: number, level?: number): REGL.Texture2D;
    /* Replaces a subset of the image using creation `options`. */
    subimage(options: Texture2DOptions, x?: number, y?: number, level?: number): REGL.Texture2D;

    /** Resizes the texture to `radius` x `radius`. */
    resize(radius: number): REGL.Texture2D;
    /** Resizes the texture to dimensions `width` x `height`. */
    resize(width: number, height: number): REGL.Texture2D;
  }

  interface Texture2DOptions {
    /* Sets `width`, `height` and, optionally, `channels`. */
    shape?: [number, number] | [number, number, REGL.TextureChannelsType];
    /* Sets both width and height to the same value. */
    radius?: number;
    /* Width of texture. Default: 0 */
    width?: number;
    /* Height of texture. Default: 0 */
    height?: number;
    /**
     * Sets the number of color channels for the texture format.
     * It can be used as an alternative to `format`.
     * Default: null
     */
    channels?: REGL.TextureChannelsType | null;
    /**
     * The following properties, `data` and `copy` are mutually exclusive.
     */
    /* Image data for the texture. Default: null */
    data?: REGL.TextureImageData | null;
    /* Create texture by copying the pixels in the current frame buffer. Default: false */
    copy?: boolean;

    /* Sets magnification filter. Default: 'nearest' */
    mag?: REGL.TextureMagFilterType;
    /* Sets minification filter. Default: 'nearest' */
    min?: REGL.TextureMinFilterType;
    /* Sets wrap mode for both axes, either to the same value, or independently, `[wrapS, wrapT]` */
    wrap?: REGL.TextureWrapModeType | [REGL.TextureWrapModeType, REGL.TextureWrapModeType];
    /* Sets wrap mode on S axis. Default: 'clamp' */
    wrapS?: REGL.TextureWrapModeType;
    /* Sets wrap mode on T axis. Default: 'clamp' */
    wrapT?: REGL.TextureWrapModeType;
    /* Sets number of anisotropic samples; requires `EXT_texture_filter_anisotropic`. Default: 0 */
    aniso?: number;
    /* Determines the format of the texture and possibly also the type. Default: 'rgba' */
    format?: REGL.TextureFormatType;
    /**
     * Texture type.
     * In many cases type can be inferred from the format and other information in the texture.
     * However, in some situations it may still be necessary to set it manually.
     * Default: 'uint8'
     */
    type?: REGL.TextureDataType;

    /**
     * If boolean, then it sets whether or not we should regenerate the mipmaps.
     *
     * If a string, it allows you to specify a hint to the mipmap generator.
     * If a hint is specified, then also the mipmaps will be regenerated.
     *
     * Finally, mipmap can also be an array of arrays. In this case, every subarray will be one of
     * the mipmaps, and you can thus use this option to manually specify the mipmaps of the image.
     *
     * Default: false
     */
    mipmap?: boolean | REGL.TextureMipmapHintType | number[][];
    /* Flips textures vertically when uploading. Default: false */
    flipY?: boolean;
    /* Sets unpack alignment per row. Default: 1 */
    alignment?: REGL.TextureUnpackAlignmentType;
    /* Premultiply alpha when unpacking. Default: false */
    premultiplyAlpha?: boolean;
    /* Sets the WebGL color space flag for pixel unpacking. Default: 'none' */
    colorSpace?: REGL.TextureColorSpaceType;
  }

  type TextureImageData =
    number[] |
    number[][] |
    number[][][] |
    ArrayBufferView |
    REGL.NDArrayLike |
    HTMLImageElement |
    HTMLVideoElement |
    HTMLCanvasElement |
    CanvasRenderingContext2D;

  /**
   * An N-dimensional array, as per `scijs/ndarray`.
   */
  interface NDArrayLike {
    shape: number[];
    stride: number[];
    offset: number;
    data: number[] | ArrayBufferView;
  }

  type TextureMipmapHintType =
    /* `gl.DONT_CARE` */
    "don't care" | "dont care" |
    /* `gl.NICEST` */
    "nice" |
    /* `gl.FASTEST` */
    "fast";

  type TextureColorSpaceType =
    /* `gl.NONE` */
    "none" |
    /* gl.BROWSER_DEFAULT_WEBGL` */
    "browser";

  type TextureChannelsType = 1 | 2 | 3 | 4;

  /* Related WebGL API: `gl.pixelStorei` */
  type TextureUnpackAlignmentType =
    /* byte-alignment */
    1 |
    /* rows aligned to even-numbered bytes */
    2 |
    /* word-alignment */
    4 |
    /* rows start on double-word boundaries */
    8;

  interface TextureCube extends Texture {
    /* Reinitializes the texture in place with faces of dimensions 1 x 1. */
    (): REGL.TextureCube;
    /* Reinitializes the texture in place with faces of dimensions `radius` x `radius`. */
    (radius: number): REGL.TextureCube;
    /* Reinitializes the texture in place using the provided image data for the six faces. */
    (
      posXData: REGL.TextureImageData, negXData: REGL.TextureImageData,
      posYData: REGL.TextureImageData, negYData: REGL.TextureImageData,
      posZData: REGL.TextureImageData, negZData: REGL.TextureImageData
    ): REGL.TextureCube;
    /* Reinitializes the texture in place using the provided creation options for the six faces. */
    (
      posXOptions: REGL.Texture2DOptions, negXOptions: REGL.Texture2DOptions,
      posYOptions: REGL.Texture2DOptions, negYOptions: REGL.Texture2DOptions,
      posZOptions: REGL.Texture2DOptions, negZOptions: REGL.Texture2DOptions,
    ): REGL.TextureCube;
    /* Reinitializes the texture in place using creation `options`. */
    (options: REGL.TextureCubeOptions): REGL.TextureCube;

    /**
     * Replaces the part of texture with new data.
     *
     * @param face      index of the face to modify
     * @param data      2D image data object to use for the replacement
     * @param x         horizontal offset of the image within the face (Default: `0`)
     * @param y         vertical offset of the image within the face (Default: `0`)
     * @param level     mipmap level of the texture to modify (Default: `0`)
     */
    subimage(
      face: REGL.TextureCubeFaceIndex,
      data: TextureImageData,
      x?: number,
      y?: number,
      level?: number,
    ): REGL.TextureCube;

    /** Resizes the cube-map texture, setting the dimensions of each face to `radius` x `radius`. */
    resize(radius: number): REGL.TextureCube;
  }

  type TextureCubeFaceIndex =
    /* positive X face */
    0 |
    /* negative X face */
    1 |
    /* positive Y face */
    2 |
    /* negative Y face */
    3 |
    /* positive Z face */
    4 |
    /* negative Z face */
    5;

  interface TextureCubeOptions extends Texture2DOptions {
    /* Uses the provided texture data for the six faces. */
    faces?: [
      TextureImageData, TextureImageData,
      TextureImageData, TextureImageData,
      TextureImageData, TextureImageData
    ];
  }

  interface Renderbuffer extends REGL.Resource {
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

    /* Reinitializes the Renderbuffer in place using dimensions: 1 x 1. */
    (): REGL.Renderbuffer;
    /* Reinitializes the Renderbuffer in place using dimensions: `radius` x `radius`. */
    (radius: number): REGL.Renderbuffer;
    /* Reinitializes the Renderbuffer in place using dimensions: `width` x `height`. */
    (width: number, height: number): REGL.Renderbuffer;
    /* Reinitializes the Renderbuffer in place using creation `options`. */
    (options: REGL.RenderbufferOptions): REGL.Renderbuffer;

    /* Resizes the Renderbuffer. */
    resize(radius: number): REGL.Renderbuffer;
    resize(width: number, height: number): REGL.Renderbuffer;
  }

  interface RenderbufferOptions {
    /* NB: `shape`, `radius`, and `width`/`height` are alternative (and mutually exclusive) means for setting the size of the renderbuffer. */
    /* Sets the dimensions [width, height] for the renderbuffer. */
    shape?: [number, number];
    /* Sets the dimensions `radius` x `radius` for the renderbuffer. */
    radius?: number;
    /* Sets the width of the renderbuffer. Default: `gl.drawingBufferWidth` */
    width?: number;
    /* Sets the height of the renderbuffer. Default: `gl.drawingBufferHeight` */
    height?: number;
    /** Sets the internal format of the render buffer. Default 'rgba4' */
    format?: REGL.RenderbufferFormat;
  }

  type RenderbufferFormat =
    REGL.RenderbufferColorFormat |
    /* `gl.DEPTH_COMPONENT16` */
    "depth" |
    /* `gl.STENCIL_INDEX8` */
    "stencil" |
    /* `gl.DEPTH_STENCIL` */
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

  type Framebuffer = REGL.Framebuffer2D | REGL.FramebufferCube;

  interface Framebuffer2D extends REGL.Resource {
    /* Reinitializes the Framebuffer in place using dimensions: 1 x 1. */
    (): REGL.Framebuffer2D;
    /* Reinitializes the Framebuffer in place using dimensions: `radius` x `radius`. */
    (radius: number): REGL.Framebuffer2D;
    /* Reinitializes the Framebuffer in place using dimensions: `width` x `height`. */
    (width: number, height: number): REGL.Framebuffer2D;
    /* Reinitializes the Framebuffer in place using creation `options`. */
    (options: REGL.FramebufferOptions): REGL.Framebuffer2D;

    /* Framebuffer binding */

    /* Binds a framebuffer directly. This is a short cut for creating a command which sets the framebuffer. */
    use<
      Context extends REGL.DefaultContext = REGL.DefaultContext,
      Props extends {} = {}
    >(body: REGL.CommandBodyFn<Context, Props>): void;

    /* Resizes the Framebuffer and all its attachments. */
    resize(radius: number): REGL.Framebuffer2D;
    resize(width: number, height: number): REGL.Framebuffer2D;
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

  interface FramebufferCube extends REGL.Resource {
    /* Reinitializes the FramebufferCube in place using face dimensions 1 x 1. */
    (): REGL.FramebufferCube;
    /* Reinitializes the FramebufferCube in place using face dimensions `radius` x `radius`. */
    (radius: number): REGL.FramebufferCube;
    /* Reinitializes the FramebufferCube in place using creation `options`. */
    (options: FramebufferCubeOptions): REGL.FramebufferCube;

    /* Resizes the FramebufferCube and all its attachments. */
    resize(radius: number): REGL.FramebufferCube;
         
    /* Faces of the FramebufferCube */
    faces: [
      REGL.Framebuffer,
      REGL.Framebuffer,
      REGL.Framebuffer,
      REGL.Framebuffer,
      REGL.Framebuffer
    ]
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
    /** Number of vertex array objects */
    vaoCount: number;

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
    /**
     * The cumulative CPU time spent executing the command in milliseconds.
     * `cpuTime` uses `performance.now` if available. Otherwise it falls back to `Date.now`.
     */
    cpuTime: number;
    /**
     * The cumulative GPU time spent executing the command in milliseconds.
     * (requires the `EXT_disjoint_timer_query` extension).
     * GPU timer queries update asynchronously. If you are not using `regl.frame()` to tick your
     * application, then you should periodically call `regl.poll()` each frame to update the timer
     * statistics.
     */
    gpuTime: number;
  }

  /**
   * The following types are defined for the convenience of clients of this library. They represent
   * the most likely forms in which values being passed to shaders (via uniforms and attributes) are
   * defined: flat JS arrays for vectors and either flat or two-dimensional JS arrays for matrices.
   */

  type Vec2 = [number, number];
  type Vec3 = [number, number, number];
  type Vec4 = [number, number, number, number];

  type BVec2 = [boolean, boolean];
  type BVec3 = [boolean, boolean, boolean];
  type BVec4 = [boolean, boolean, boolean, boolean];

  type Mat2 = [
    number, number,
    number, number
  ] | [
    REGL.Vec2,
    REGL.Vec2
  ];

  type Mat3 = [
    number, number, number,
    number, number, number,
    number, number, number
  ] | [
    REGL.Vec3,
    REGL.Vec3,
    REGL.Vec3
  ];

  type Mat4 = [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
  ] | [
    REGL.Vec4,
    REGL.Vec4,
    REGL.Vec4,
    REGL.Vec4
  ];
}
