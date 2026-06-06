import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a0a0a");
    this.scene.fog = new THREE.FogExp2("#0a0a0a", 0.02);

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
    this.renderer.toneMappingExposure = 1.0;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, -6, 0);
    this.controls.update();

    this.initLights();
    this.initEnvironment();
    this.initGround();
  }

  initLights() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const shadowRes = isMobile ? 1024 : 2048;

    // Main Key Light (Soft, Moon-like)
    this.sunLight = new THREE.DirectionalLight("#e0f2fe", 2.5);
    this.sunLight.position.set(10, 20, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = shadowRes;
    this.sunLight.shadow.mapSize.height = shadowRes;
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 30;
    this.sunLight.shadow.camera.bottom = -30;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Fill Light
    const fillLight = new THREE.DirectionalLight("#4ade80", 0.4);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);

    // Rim Light (Backlight for silhouette)
    const rimLight = new THREE.PointLight("#ffffff", 100);
    rimLight.position.set(0, 15, -15);
    this.scene.add(rimLight);

    this.ambLight = new THREE.AmbientLight("#111111", 0.2);
    this.scene.add(this.ambLight);
  }

  initEnvironment() {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load("/rainforest.hdr", (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = texture;
      // We don't set background to texture to keep the clean studio look
    });
  }

  initGround() {
    const groundGeo = new THREE.CircleGeometry(100, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: "#0f1712", // Very dark deep forest green
      roughness: 0.9,
      metalness: 0.1,
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
