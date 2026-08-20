// Cloud layer fragment shader (hero: uChapter=0, uTransition=0)
precision highp float;

uniform float uTime;
uniform float uRatio;
uniform float uChapter;
uniform float uTransition;
uniform vec2 uSize;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uThinness;
uniform float uDistortion;
uniform float uBrightness;
uniform vec3 uColorLight;
uniform vec3 uColorDark;
uniform sampler2D tPerlin;
uniform sampler2D tNoise;
uniform sampler2D tMouse;

varying float vSeed;
varying float vRatio;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vec2 ratioedUv = vec2(5.0, vRatio) * (vUv + vSeed * 0.1);
  vec2 resizedUv = uSize * ratioedUv;

  vec2 sUv = gl_FragCoord.xy / uResolution;
  float mouse = clamp(
    texture2D(tMouse, sUv + 0.1 * (texture2D(tNoise, 0.4 * resizedUv).g - 0.5)).r,
    0.0,
    1.0
  );

  float time = uTime * 0.5 / uSize.x;
  float strength = uDistortion;
  vec2 dUv = vUv;
  dUv *= 1.0 + 0.03 * mouse * strength;
  dUv += 0.05 * mouse * strength;
  dUv.y += 0.3 * strength * (texture2D(tNoise, resizedUv * 0.2 + vec2(-0.004, -0.02) * time).r - 0.5);
  dUv.y -= 0.5 * strength * (texture2D(tNoise, resizedUv * 0.08 + vec2(0.005, 0.01) * time).r - 0.5);
  dUv.y *= 1.0 + 0.1 * strength * (texture2D(tPerlin, resizedUv * 0.5 - 0.01 * time).r - 0.5);

  float smoothness = smoothstep(
    0.4,
    0.7,
    texture2D(tNoise, resizedUv * 0.08 + vec2(-0.08, -0.04) * time).r
  );

  float clouds = smoothstep(0.9 - 0.1 * smoothness + uThinness, 0.7 + uThinness, dUv.y);
  clouds *= smoothstep(0.0, 0.2, dUv.y - 0.2 * smoothstep(0.4, 1.0, dUv.x));

  float alpha = clouds
    * smoothstep(1.0, 0.9, vUv.y)
    * smoothstep(0.0, 0.1, vUv.y)
    * smoothstep(0.0, 0.1, vUv.x)
    * smoothstep(1.0, 0.9, vUv.x);

  alpha += smoothstep(0.2, 0.3, vUv.y)
    * smoothstep(0.7, 0.6, vUv.y)
    * smoothstep(0.2, 0.3, vUv.x)
    * smoothstep(0.9, 0.8, vUv.x);
  alpha = min(1.0, alpha);

  float cloudDarkness = smoothstep(0.4, 1.0, dUv.y) + smoothstep(0.4, 0.0, dUv.y);
  vec3 color = mix(uColorDark, uColorLight, cloudDarkness) * uBrightness;

  float whiteText = smoothstep(2.2, 2.3, uChapter);
  color *= mix(vec3(1.0), vec3(0.8, 0.85, 0.87), whiteText);

  vec2 guillotineUv = vec2(uRatio, 1.0) * 0.4 * sUv;
  float guillotine = smoothstep(
    2.3,
    2.2,
    uChapter - 0.3 * sUv.y + 0.1 * (texture2D(tNoise, guillotineUv + 0.02 * texture2D(tNoise, 4.0 * guillotineUv).r).r - 0.5)
  );

  alpha *= guillotine;
  alpha *= smoothstep(1.0, 0.3, uTransition);
  alpha *= min(1.0, smoothstep(0.88, 0.96, vNormal.b) + smoothstep(0.05, 0.0, uTransition));

  gl_FragColor = vec4(color, alpha * uOpacity);
}
