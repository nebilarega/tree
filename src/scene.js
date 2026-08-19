import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = null; // Enable transparency to see CSS background
    this.scene.fog = new THREE.FogExp2("#f5f0fa", 0.015);

    this.camera = new THREE.PerspectiveCamera(
      45, // Narrower FOV for more cinematic look
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(-2, -4, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, -6, 0);
    this.controls.update();

    this.initLights();
    this.initGround();
  }

  initLights() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const shadowRes = isMobile ? 1024 : 2048;

    // Main Key Light (Warm, Golden Sun)
    this.sunLight = new THREE.DirectionalLight("#fff2d5", 3.8);
    this.sunLight.position.set(15, 25, 12);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = shadowRes;
    this.sunLight.shadow.mapSize.height = shadowRes;
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Hemisphere Light (Sky: Soft Lilac, Ground: Light Sage Green)
    const hemiLight = new THREE.HemisphereLight("#f5f0fa", "#d9f99d", 1.2);
    this.scene.add(hemiLight);

    // Fill Light (Soft Purple / Warm Rose)
    const fillLight = new THREE.DirectionalLight("#c084fc", 0.8);
    fillLight.position.set(-15, 15, -15);
    this.scene.add(fillLight);

    // Rim Light (Backlight for silhouette)
    const rimLight = new THREE.PointLight("#ffffff", 120);
    rimLight.position.set(0, 15, -15);
    this.scene.add(rimLight);

    this.ambLight = new THREE.AmbientLight("#ede9fe", 0.5);
    this.scene.add(this.ambLight);
  }

  initEnvironment(onLoaded) {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load("/rainforest.hdr", (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = texture;
      if (onLoaded) onLoaded();
    });
  }

  initGround() {
    // Ground plane removed to allow the dirt mound to float organically in space,
    // blending seamlessly into the background gradient just like the inspiration image.
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
