import * as THREE from 'three';
import { scene, camera, controls, renderer, sky, onResize } from './scene.js';
import { rebuildTreeImmediate } from './tree.js';
import { fpsValEl, rebuildValEl, setupGrowthButtons } from './ui.js';

let targetGrowth = 0.0;
let currentGrowth = 0.0;
const growthStep = 0.015;
let lastFpsUpdate = 0;
let framesCount = 0;
let userInteracted = false;

controls.addEventListener('start', () => {
  userInteracted = true;
});

function animate(timestamp) {
  requestAnimationFrame(animate);
  framesCount++;

  if (timestamp > lastFpsUpdate + 500) {
    const fps = Math.round((framesCount * 1000) / (timestamp - lastFpsUpdate));
    fpsValEl.innerText = fps;
    lastFpsUpdate = timestamp;
    framesCount = 0;
  }

  if (currentGrowth !== targetGrowth) {
    currentGrowth =
      currentGrowth < targetGrowth
        ? Math.min(currentGrowth + growthStep, targetGrowth)
        : Math.max(currentGrowth - growthStep, targetGrowth);
    const duration = rebuildTreeImmediate(currentGrowth);
    rebuildValEl.innerText = duration.toFixed(2);
  }

  const camStart = new THREE.Vector3(0, -4, 6);
  const camEnd = new THREE.Vector3(0, 4, 22);
  if (!userInteracted) {
    camera.position.lerpVectors(camStart, camEnd, currentGrowth);
  }

  const targetStart = new THREE.Vector3(0, -6, 0);
  const targetEnd = new THREE.Vector3(0, 3, 0);
  controls.target.lerpVectors(targetStart, targetEnd, currentGrowth);

  if (sky.material.uniforms['time']) {
    sky.material.uniforms['time'].value = timestamp * 0.001;
  }

  if (sky.material.uniforms['cameraPos']) {
    sky.material.uniforms['cameraPos'].value.copy(camera.position);
  }

  controls.update();
  renderer.render(scene, camera);
}

function initialize() {
  setupGrowthButtons((value) => {
    targetGrowth = value;
  });

  onResize();
  rebuildTreeImmediate(0);
  requestAnimationFrame((timestamp) => {
    lastFpsUpdate = timestamp;
    animate(timestamp);
  });
  window.addEventListener('resize', onResize);
}

initialize();
