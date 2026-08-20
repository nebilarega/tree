// Cloud layer vertex shader
precision highp float;

uniform float uChapter;

varying vec2 vUv;
varying float vSeed;
varying float vRatio;
varying vec3 vNormal;

void main() {
  vUv = uv;

  vec3 transformed = position;
  transformed.y += uChapter * 0.01;

  vec4 mvPosition = vec4(transformed, 1.0);

#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vSeed = instanceMatrix[3][0] + instanceMatrix[3][1] + instanceMatrix[3][2];
  vRatio = instanceMatrix[1][1] / instanceMatrix[0][0];
  mat3 im = mat3(instanceMatrix);
  vec3 instNormal = vec3(
    normal.x / im[0][0],
    normal.y / im[1][1],
    normal.z / im[2][2]
  );
  vNormal = normalize(normalMatrix * instNormal);
#else
  vNormal = normalize(normalMatrix * normal);
  vSeed = 0.0;
  vRatio = 1.0;
#endif

  gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
}
