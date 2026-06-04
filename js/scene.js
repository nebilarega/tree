import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000000,
);
// Start camera close (zoomed-in) and pull back as the tree grows
camera.position.set(0, -6.8, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2;
controls.target.set(0, -7, 0);
controls.minDistance = 6;
controls.maxDistance = 80;

const sky = new Sky();
sky.scale.setScalar(450000);
scene.add(sky);

const sunLight = new THREE.DirectionalLight("#fff3e3", 4.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.bias = -0.001;
sunLight.shadow.normalBias = 0.05;
scene.add(sunLight);

const ambLight = new THREE.AmbientLight("#ffffff", 0.5);
scene.add(ambLight);

const sun = new THREE.Vector3();
const effectController = {
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.7,
  elevation: 90,
  azimuth: 180,
  exposure: 0.2,
  skyOffset: 0,
  sceneOffset: 0,
};

function updateSky() {
  const uniforms = sky.material.uniforms;
  uniforms["turbidity"].value = effectController.turbidity;
  uniforms["rayleigh"].value = effectController.rayleigh;
  uniforms["mieCoefficient"].value = effectController.mieCoefficient;
  uniforms["mieDirectionalG"].value = effectController.mieDirectionalG;

  const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
  const theta = THREE.MathUtils.degToRad(effectController.azimuth);
  sun.setFromSphericalCoords(1, phi, theta);
  uniforms["sunPosition"].value.copy(sun);
  renderer.toneMappingExposure = effectController.exposure;
  sunLight.position.copy(sun).multiplyScalar(100);
  sky.position.y = -effectController.skyOffset;
}

updateSky();

const rgbeLoader = new RGBELoader();
rgbeLoader.load("rainforest.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});

const groundGeo = new THREE.CircleGeometry(60, 64);
const groundMat = new THREE.MeshStandardMaterial({
  color: "#4ade80",
  roughness: 0.8,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -7.01;
ground.receiveShadow = true;
scene.add(ground);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export {
  scene,
  camera,
  renderer,
  controls,
  sky,
  sunLight,
  ambLight,
  ground,
  effectController,
  updateSky,
  onResize,
};
