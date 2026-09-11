import * as THREE from "three";

const LEAF_COLORS = [
  0x4a8505,
  0x70a904,
  0x387002,
  0x9ac20a,
  0x55823b,
  0x8fae4d,
  0xb7c98a,
  0xd4e157,
  0xc5d86a,
];

function createFloatingLeafShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -1);
  shape.quadraticCurveTo(0.9, -0.6, 0.55, 0.3);
  shape.quadraticCurveTo(0.35, 0.9, 0, 1.3);
  shape.quadraticCurveTo(-0.35, 0.9, -0.55, 0.3);
  shape.quadraticCurveTo(-0.9, -0.6, 0, -1);
  return shape;
}

function attachLeafWaveShader(material, waveUniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waveUniforms.uTime;
    shader.uniforms.uPhase = waveUniforms.uPhase;
    shader.uniforms.uFreq = waveUniforms.uFreq;
    shader.uniforms.uAmp = waveUniforms.uAmp;

    shader.vertexShader =
      `uniform float uTime;
uniform float uPhase;
uniform float uFreq;
uniform float uAmp;
` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
        #include <begin_vertex>
        float bendFactor = (position.y + 1.0) / 2.3;
        float wave = sin(position.y * uFreq + uTime + uPhase);
        transformed.z += wave * uAmp * bendFactor;
        transformed.x += wave * uAmp * 0.3 * bendFactor;
        `,
    );
  };

  material.userData.wave = waveUniforms;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Floating leaves that stay locked in camera view-space.
 * Same apparent size from hero → final scroll (like the cloud layer).
 * Kept as scene children (not camera children) because the camera is not
 * always in the scene graph.
 */
export class FloatingLeavesSystem {
  constructor(scene, camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = "FloatingLeaves";
    // Above cloud planes (-1 / 1), below/with tree (2). Opaque tree still
    // occludes via depthTest so leaves read as sky atmosphere behind the canopy.
    this.group.renderOrder = 2;
    scene.add(this.group);

    this._local = new THREE.Vector3();
    this._world = new THREE.Vector3();

    this.isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) || window.innerWidth < 768;

    const leafGeometry = new THREE.ShapeGeometry(createFloatingLeafShape(), 6);
    const leafCount = this.isMobile ? 90 : 140;
    this.leaves = [];
    this.scrollT = 0;
    this.targetScrollT = 0;

    // Wider frame coverage + deeper placement → small distant background field.
    const bounds = {
      x: [-22, 22],
      y: [-13, 13],
      z: [-58, -36],
    };
    this.bounds = bounds;

    for (let i = 0; i < leafCount; i++) {
      const depth = randomInRange(bounds.z[0], bounds.z[1]);
      const depthT = (depth - bounds.z[0]) / (bounds.z[1] - bounds.z[0]);
      // Smaller screen size so they read as far-away particles.
      const scale = 0.12 + depthT * 0.2;
      const opacity = 0.22 + depthT * 0.36;

      const color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });

      const waveUniforms = {
        uTime: { value: 0 },
        uPhase: { value: Math.random() * Math.PI * 2 },
        uFreq: { value: 1.6 + Math.random() * 1.8 },
        uAmp: { value: 0.03 + Math.random() * 0.04 },
      };

      attachLeafWaveShader(material, waveUniforms);

      const mesh = new THREE.Mesh(leafGeometry, material);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.scale.setScalar(scale);

      const baseX = randomInRange(bounds.x[0], bounds.x[1]);
      const baseY = randomInRange(bounds.y[0], bounds.y[1]);
      const baseZ = depth;

      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );

      this.group.add(mesh);

      this.leaves.push({
        mesh,
        wave: waveUniforms,
        floatSpeed: 0.18 + Math.random() * 0.28,
        floatAmp: 0.35 + Math.random() * 0.55,
        swaySpeed: 0.22 + Math.random() * 0.32,
        swayAmp: 0.3 + Math.random() * 0.5,
        wobbleSpeed: 1.0 + Math.random() * 1.3,
        wobbleAmp: 0.03 + Math.random() * 0.05,
        wobbleSpeedZ: 0.7 + Math.random() * 1.0,
        wobbleAmpZ: 0.06 + Math.random() * 0.1,
        flutterSpeed: 1.5 + Math.random() * 1.8,
        flutterAmp: 0.05 + Math.random() * 0.08,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        phase: Math.random() * Math.PI * 2,
        phase2: Math.random() * Math.PI * 2,
        phase3: Math.random() * Math.PI * 2,
        baseX,
        baseY,
        baseZ,
      });
    }
  }

  setScrollProgress(scrollY) {
    const max = document.body.scrollHeight - window.innerHeight;
    this.targetScrollT = max > 0 ? scrollY / max : 0;
  }

  _respawn(leaf) {
    leaf.baseX = randomInRange(this.bounds.x[0], this.bounds.x[1]);
    leaf.baseY = this.bounds.y[1] - Math.random() * 1.5;
    leaf.baseZ = randomInRange(this.bounds.z[0], this.bounds.z[1]);
  }

  update(time) {
    this.scrollT += (this.targetScrollT - this.scrollT) * 0.06;
    const scrollSway = 1 + this.scrollT * 0.35;

    this.camera.updateMatrixWorld();

    for (const leaf of this.leaves) {
      const mesh = leaf.mesh;
      leaf.wave.uTime.value = time;

      const primaryY =
        Math.sin(time * leaf.floatSpeed + leaf.phase) * leaf.floatAmp;
      const wobbleY =
        Math.sin(time * leaf.wobbleSpeed + leaf.phase2) * leaf.wobbleAmp;

      const localY = leaf.baseY + primaryY + wobbleY;

      const primaryX =
        Math.sin(time * leaf.swaySpeed + leaf.phase) *
        leaf.swayAmp *
        scrollSway;
      const wobbleX =
        Math.sin(time * leaf.wobbleSpeed * 1.3 + leaf.phase3) *
        leaf.wobbleAmp *
        0.8;

      const localX = leaf.baseX + primaryX + wobbleX;
      const localZ =
        leaf.baseZ +
        Math.sin(time * leaf.wobbleSpeedZ + leaf.phase2) * leaf.wobbleAmpZ;

      // Camera-local → world so size stays constant as the camera dollies.
      this._local.set(localX, localY, localZ);
      this._world.copy(this._local).applyMatrix4(this.camera.matrixWorld);
      mesh.position.copy(this._world);

      mesh.rotation.z += leaf.rotSpeed * 0.004 * scrollSway;
      mesh.rotation.z +=
        Math.sin(time * leaf.flutterSpeed + leaf.phase3) *
        leaf.flutterAmp *
        0.01;

      mesh.rotation.x =
        Math.sin(time * leaf.swaySpeed * 0.7 + leaf.phase) * 0.2 * scrollSway +
        Math.sin(time * leaf.flutterSpeed * 0.8 + leaf.phase2) * leaf.flutterAmp;

      mesh.rotation.y +=
        leaf.rotSpeed * 0.003 +
        Math.sin(time * leaf.wobbleSpeed * 0.6 + leaf.phase3) * 0.001;

      if (localY < this.bounds.y[0] - 2) {
        this._respawn(leaf);
      }
    }
  }
}
