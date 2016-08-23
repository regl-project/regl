/*
  tags: advanced

  <p>Implicit surface raytracing demo. Many ideas and pieces of code taken from <a href="https://github.com/kevinroast/webglshaders/blob/master/distancefield1.html">here</a> and <a href="http://www.iquilezles.org/www/articles/distfunctions/distfunctions.htm">here</a>  </p>

 */

const regl = require('../regl')()

const camera = require('./util/camera')(regl, {
  center: [-12, 5, 1],
  phi: -0.2
})

const raytrace = regl({
  vert: `
    precision mediump float;
    attribute vec2 position;
    void main () {
      gl_Position = vec4(position, 0, 1);
    }`,
  frag: `
    precision mediump float;
    uniform float width, height, timestep;
    uniform vec3 eye, center;
    vec2 resolution = vec2(width, height);

    float torus(vec3 p, vec2 t)
    {
      vec2 q = vec2(length(p.xz)-t.x,p.y);
      return length(q)-t.y;
    }

    float sphere(vec3 p, float s)
    {
      return length(p)-s;
    }

    vec2 opU(vec2 d1, vec2 d2)
    {
      return (d1.x < d2.x) ? d1 : d2;
    }

    vec3 opRep(vec3 p, vec3 c)
    {
      return vec3(mod(p.yz, c.yz)-0.5*c.yz, p.x);
    }

    float plane(vec3 p, vec4 n)
    {
      return dot(p, n.xyz) + n.w;
    }

    vec2 distanceEstimate(vec3 pos)
    {
      float cellSize = 5.;
      float cellNumber = floor(pos.y/cellSize)+1.;
      float period = 50./cellNumber;
      float s = sin(timestep/period);
      float c = cos(timestep/period);
      mat3 r = mat3(c,  -s,  0.,
                    s,   c,  0.,
                    0.,  0., 1.);
      vec2 ball = vec2(sphere(opRep(pos-vec3(0, 0, s*2.0), vec3(cellSize)), 0.5), 45.);
      vec2 tor = vec2(torus(opRep(pos, vec3(cellSize))*r, vec2(1.0, 0.25)), 15.);
      vec2 floor = vec2(plane(pos, vec4(0, 1, 0, -1)), 0.);
      vec2 objects = opU(tor, ball);
      return opU(floor, objects);
    }

    vec3 getNormal(vec3 pos)
    {
      const vec2 delta = vec2(0.01, 0);

      vec3 n;
      n.x = distanceEstimate(pos + delta.xyy).x - distanceEstimate(pos - delta.xyy).x;
      n.y = distanceEstimate(pos + delta.yxy).x - distanceEstimate(pos - delta.yxy).x;
      n.z = distanceEstimate(pos + delta.yyx).x - distanceEstimate(pos - delta.yyx).x;

      return normalize(n);
    }

    float softshadow(in vec3 ro, in vec3 rd, in float mint, in float tmax)
    {
      float res = 1.0;
      float t = mint;
      for (int i=0; i<16; i++)
      {
        float h = distanceEstimate(ro + rd*t).x;
        res = min(res, 8.0*h/t);
        t += clamp(h, 0.02, 0.11);
        if( h<0.001 || t>tmax ) break;
      }
      return clamp(res, 0., 1.);
    }

    float calcAO(in vec3 pos, in vec3 nor)
    {
      float occ = 0.0;
      float sca = 1.0;
      for (int i=0; i<5; i++)
      {
        float hr = 0.01 + 0.12*float(i)/4.0;
        vec3 aopos =  nor * hr + pos;
        float dd = distanceEstimate(aopos).x;
        occ += -(dd-hr)*sca;
        sca *= 0.95;
      }
      return clamp(1.0 - 3.0*occ, 0., 1.);
    }

    vec3 sunLight  = normalize(vec3(-0.6, 0.7, 0.5));
    vec3 sunColour = vec3(1.0, .75, .6);
    vec3 Sky(in vec3 rayDir)
    {
      float sunAmount = max(dot(rayDir, sunLight), 0.0);
      float v = pow(1.0 - max(rayDir.y, 0.0), 6.);
      vec3  sky = mix(vec3(.1, .2, .3), vec3(.32, .32, .32), v);
      sky = sky + sunColour * sunAmount * sunAmount * .25;
      sky = sky + sunColour * min(pow(sunAmount, 800.0)*1.5, .3);

      return clamp(sky, 0., 1.);
    }

    const float horizonLength = 100.;
    const float surfacePrecision = 0.01;
    const int maxIterations = 128;
    vec2 castRay(vec3 rayOrigin, vec3 rayDir)
    {
      float t = 0.;
      for (int i=0; i<maxIterations; i++)
      {
        vec3 p = rayOrigin + rayDir * t;
        vec2 d = distanceEstimate(p);
        if (abs(d.x) < surfacePrecision)
        {
          return vec2(t, d.y);
        }
        t += d.x;
        if (t >= horizonLength) break;
      }
      return vec2(t, -1.);
    }

    vec3 getRay(vec3 dir, vec2 pos) {
      pos = pos - 0.5;
      pos.x *= resolution.x/resolution.y;

      dir = normalize(dir);
      vec3 right = normalize(cross(vec3(0., 1., 0.), dir));
      vec3 up = normalize(cross(dir, right));

      return dir + right*pos.x + up*pos.y;
    }

    vec3 render(in vec3 ro, in vec3 rd)
    {
      vec3 skyColor = Sky(rd);
      vec3 color = skyColor;
      vec2 res = castRay(ro, rd);
      float t = res.x;
      float material = res.y;
      if (t < horizonLength)
      {
        vec3 pos = ro + t*rd;
        vec3 normal = getNormal(pos);
        vec3 reflectionDir = reflect(rd, normal);

        // material
        color = 0.45 + 0.3*sin(vec3(0.05, 0.08, 0.10)) * material;

        if (material == 0.0)
        {
          float f = mod(floor(2.*pos.z) + floor(2.*pos.x), 2.);
          color = 0.4 + 0.1*f*vec3(1.);
        }

        // lighting
        float occ = calcAO(pos, normal);
        float amb = clamp(0.5+0.5*normal.y, 0., 1.);
        float dif = clamp(dot(normal, sunLight), 0., 1.);
        float bac = clamp(dot(normal, normalize(vec3(-sunLight.x, 0., -sunLight.z))), 0., 1.) * clamp(1.0-pos.y, 0., 1.);
        float dom = smoothstep(-0.1, 0.1, reflectionDir.y);
        float fre = pow(clamp(1.0+dot(normal, rd), 0., 1.), 2.);
        float spe = pow(clamp(dot(reflectionDir, sunLight), 0., 1.), 16.);

        dif *= softshadow(pos, sunLight, 0.02, 2.5);
        dom *= softshadow(pos, reflectionDir, 0.02, 2.5);

        vec3 lin = vec3(0.);
        lin += 1.20 * dif * vec3(1.00, 0.85, 0.55);
        lin += 1.20 * spe * vec3(1.00, 0.85, 0.55) * dif;
        lin += 0.20 * amb * vec3(0.50, 0.70, 1.00) * occ;
        lin += 0.30 * dom * vec3(0.50, 0.70, 1.00) * occ;
        lin += 0.30 * bac * vec3(0.25, 0.25, 0.25) * occ;
        lin += 0.40 * fre * vec3(1.00, 1.00, 1.00) * occ;
        color = color * lin;

        color = mix(color, skyColor, 1.0-exp(-0.001*t*t));
      }
      return vec3(clamp(color, 0., 1.));
    }

    void main () {
      vec2 p = gl_FragCoord.xy / resolution.xy;
      vec3 rayDir = normalize(getRay(eye-center, p));
      vec3 res = render(center, rayDir);
      gl_FragColor = vec4(res.rgb, 1.);
    }`,
  attributes: {
    position: [-4, -4, 4, -4, 0, 4]
  },
  uniforms: {
    height: regl.context('viewportHeight'),
    width: regl.context('viewportWidth'),
    timestep: regl.context('tick')
  },
  count: 3
})

regl.frame(() => {
  camera(() => {
    raytrace()
  })
})
