import * as THREE from 'three';

function createBlackTexture() {
  const data = new Uint8Array([0, 0, 0, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Ping-pong mouse trail texture used by the cloud shader (tMouse).
 * Pass mouse in NDC (-1..1).
 */
export function createMouseTrail(renderer, detailTexture, size = 256) {
  const targetOptions = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  };

  const ping = new THREE.WebGLRenderTarget(size, size, targetOptions);
  const pong = new THREE.WebGLRenderTarget(size, size, targetOptions);
  const emptyTexture = createBlackTexture();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tLast: { value: emptyTexture },
      uMouse: { value: new THREE.Vector2() },
      uMouseVelocity: { value: new THREE.Vector2() },
      tNoise: { value: detailTexture },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform vec2 uMouseVelocity;
      uniform sampler2D tNoise;
      uniform sampler2D tLast;
      varying vec2 vUv;
      const float propagationFactor = 0.15;
      const float remananceFactor = 0.99;
      const float velocityFactor = 0.005;
      void main() {
        vec2 mouseUv = (uMouse * 0.5) + 0.5;
        vec2 velocityOffset = uMouseVelocity * velocityFactor;
        float distFromMouse = length(vUv - mouseUv);
        float circle = smoothstep(0.05, 0.0, distFromMouse);
        float smoothcircle = smoothstep(0.1, 0.0, distFromMouse);
        float smoothercircle = smoothstep(0.15, 0.0, distFromMouse);
        float noise = texture2D(tNoise, vUv * 0.5 + uTime * 0.01).r * 2.0 - 1.0;
        vec4 remanance = vec4(0.0);
        remanance += texture2D(tLast, vUv + vec2(noise * propagationFactor, 0.0) - velocityOffset) * 0.25;
        remanance += texture2D(tLast, vUv + vec2(-noise * propagationFactor, 0.0) - velocityOffset) * 0.25;
        remanance += texture2D(tLast, vUv + vec2(0.0, noise * propagationFactor) - velocityOffset) * 0.25;
        remanance += texture2D(tLast, vUv + vec2(0.0, -noise * propagationFactor) - velocityOffset) * 0.25;
        remanance.b *= 0.99;
        vec4 color = vec4(circle, 0.4 * smoothcircle, 0.07 * smoothercircle, 1.0);
        color += remanance * remananceFactor;
        gl_FragColor = color;
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let frame = 0;

  return {
    texture: ping.texture,
    update(time, mouseNdc, velocity) {
      material.uniforms.uTime.value = time;
      material.uniforms.uMouse.value.copy(mouseNdc);
      material.uniforms.uMouseVelocity.value.copy(velocity);

      const read = frame % 2 === 0 ? ping : pong;
      const write = frame % 2 === 0 ? pong : ping;
      material.uniforms.tLast.value = read.texture;

      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(write);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevTarget);

      this.texture = write.texture;
      frame += 1;
    },
    dispose() {
      ping.dispose();
      pong.dispose();
      material.dispose();
    },
  };
}
