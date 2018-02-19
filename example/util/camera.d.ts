import REGL = require('../../regl')
export = createCamera

interface Props {
  center?: number[];
  theta?: number;
  phi?: number;
  distance?: number;
  up?: REGL.Vec3;
  minDistance?: number;
  maxDistance?: number;
}

interface Context extends REGL.DefaultContext {
  view: REGL.Mat4;
  projection: REGL.Mat4;
  center: Float32Array;
  theta: number;
  phi: number;
  distance: number;
  eye: Float32Array;
  up: Float32Array;
}

declare function createCamera(regl: REGL.Regl, props: Props): REGL.DrawCommand<Context, Props>;
