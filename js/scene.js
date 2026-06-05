import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000000,
    );
    this.camera.position.set(0, -4, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.target.set(0, -6, 0);
    this.controls.minDistance = 6;
    this.controls.maxDistance = 80;
    this.controls.update();

    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.scene.add(this.sky);

    this.sunLight = new THREE.DirectionalLight("#fff3e3", 4.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 4096;
    this.sunLight.shadow.mapSize.height = 4096;
    this.sunLight.shadow.camera.left = -25;
    this.sunLight.shadow.camera.right = 25;
    this.sunLight.shadow.camera.top = 25;
    this.sunLight.shadow.camera.bottom = -25;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.bias = -0.001;
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight);

    this.ambLight = new THREE.AmbientLight("#ffffff", 0.5);
    this.scene.add(this.ambLight);

    this.sun = new THREE.Vector3();
    this.effectController = {
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

    this.initEnvironment();
    this.initGround();
    this.updateSky();
  }

  updateSky() {
    const uniforms = this.sky.material.uniforms;
    uniforms["turbidity"].value = this.effectController.turbidity;
    uniforms["rayleigh"].value = this.effectController.rayleigh;
    uniforms["mieCoefficient"].value = this.effectController.mieCoefficient;
    uniforms["mieDirectionalG"].value = this.effectController.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - this.effectController.elevation);
    const theta = THREE.MathUtils.degToRad(this.effectController.azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    uniforms["sunPosition"].value.copy(this.sun);
    this.renderer.toneMappingExposure = this.effectController.exposure;
    this.sunLight.position.copy(this.sun).multiplyScalar(100);
    this.sky.position.y = -this.effectController.skyOffset;
  }

  initEnvironment() {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load("rainforest.hdr", (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = texture;
    });
  }

  initGround() {
    const groundGeo = new THREE.CircleGeometry(60, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: "#2d8a4e", // Darker green (was #4ade80)
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -7.01;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
