/*
  <p>Implicit surface raytracing demo. Many ideas and pieces of code taken from https://github.com/kevinroast/webglshaders/blob/master/distancefield1.html</p>

 */

const regl = require('../regl')()

regl({
  vert: `
    precision mediump float;
    attribute vec2 position;
    void main () {
      gl_Position = vec4(position, 0, 1);
    }`,

  frag: `
    precision mediump float;
    const vec3 LightDir1 = vec3(.7,1,-1.0);
    const vec3 LightColour1 = vec3(1.2,1.05,1);
    const vec3 LightDir2 = vec3(0,0,1);
    const vec3 LightColour2 = vec3(.38,.4,.6);
    const float LightSpecular = 64.0;
    const float LightSpecularHardness = 256.0;
    const vec3 Diffuse = vec3(0.85);

    uniform float width, height;
    vec2 resolution = vec2(width, height);

    float torus(vec3 p, vec2 t)
    {
      vec2 q = vec2(length(p.xz)-t.x,p.y);
      return length(q)-t.y;
    }

    float opRep( vec3 p, vec3 c )
    {
      vec3 q = mod(p,c)-0.5*c;
      vec2 t = vec2(0.75,0.3);
      return min(torus(q, t), torus(q.yxz,t));
    }

    float distanceEstimate(vec3 pos)
    {
      vec3 c = vec3(5);
      return opRep(pos, c);
    }

    vec3 getNormal(vec3 pos)
    {
       const vec2 delta = vec2(0.01, 0);

       vec3 n;
       n.x = distanceEstimate( pos + delta.xyy ) - distanceEstimate( pos - delta.xyy );
       n.y = distanceEstimate( pos + delta.yxy ) - distanceEstimate( pos - delta.yxy );
       n.z = distanceEstimate( pos + delta.yyx ) - distanceEstimate( pos - delta.yyx );

       return normalize(n);
    }

    vec4 Shading(vec3 pos, vec3 rayDir, vec3 norm)
    {
      vec3 light1 = LightColour1 * max(0.0, dot(norm, normalize(LightDir1)));
      vec3 light2 = LightColour2 * max(0.0, dot(norm, normalize(LightDir2)));

      vec3 view = normalize(-rayDir);
      vec3 heading = normalize(view + LightDir1);
      float specular = pow(max(0.0, dot(heading, norm)), LightSpecularHardness);

      return vec4(Diffuse * (light1 + light2) + (specular * LightSpecular * LightColour1), 1.0);
    }

    vec3 sunLight  = normalize( vec3(0.35, 0.2, .3) );
    vec3 sunColour = vec3(1.0, .75, .6);
    vec3 Sky(in vec3 rayDir)
    {
      float sunAmount = max(dot(rayDir, sunLight), 0.0);
      float v = pow(1.0 - max(rayDir.y,0.0),6.);
      vec3  sky = mix(vec3(.1, .2, .3), vec3(.32, .32, .32), v);
      sky = sky + sunColour * sunAmount * sunAmount * .25;
      sky = sky + sunColour * min(pow(sunAmount, 800.0)*1.5, .3);

      return clamp(sky, 0.0, 1.0);
    }

    vec4 March(vec3 rayOrigin, vec3 rayDir)
    {
       float t = 0.0;
       float d = 1.0;
       for (int i=0; i<128; i++)
       {
          vec3 p = rayOrigin + rayDir * t;
          d = distanceEstimate(p);
          if (abs(d) < 0.01)
          {
             return vec4(p, 1.0);
          }
          t += d;
          if (t >= 100.0) break;
       }
       return vec4(0.0);
    }

    vec3 getRay(vec3 dir, vec2 pos) {
       pos = pos - 0.5;
       pos.x *= resolution.x/resolution.y;

       dir = normalize(dir);
       vec3 right = normalize(cross(vec3(0.,1.,0.),dir));
       vec3 up = normalize(cross(dir,right));

       return dir + right*pos.x + up*pos.y;
    }

    void main () {
      vec3 camLook = vec3(0,0,0);
      vec3 camPos = vec3(5,10.0,6.0);
      vec2 p = gl_FragCoord.xy / resolution.xy;
      vec3 rayDir = normalize(getRay(camLook-camPos, p));
      vec4 res = March(camPos, rayDir);
      if (res.a == 1.0) res.xyz = clamp(Shading(res.xyz, rayDir, getNormal(res.xyz)).xyz, 0.0, 1.0);
      else res.xyz = Sky(res.xyz);

      gl_FragColor = vec4(res.rgb, 1.0);
    }`,

  attributes: {
    position: [
      [1,1],
      [1, -1],
      [-1, -1],
      [-1,1],
    ]
  },

  uniforms: {
    height: regl.context('viewportHeight'),
    width: regl.context('viewportWidth')
  },

  elements: [[0,1,2], [0,3,2]]
})()
