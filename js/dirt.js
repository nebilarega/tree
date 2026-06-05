import * as THREE from "three";

export class DirtSystem {
  constructor(scene) {
    this.scene = scene;
    this.config = {
      particleAmount: 5,
      baseSize: 0.12,
      sizeVariety: 0.6,
      rollingSpeed: 2.0,
      moundRadius: 2.2,
      moundHeight: 0.8,
      roughnessNoise: 0.12,
    };

    this.dirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x5d4037,
      roughness: 0.7,
      flatShading: true,
      envMapIntensity: 1.2,
    });

    this.particles = [];
    this.rockGeometries = [
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
    ];

    this.initMound();
  }

  calculateSurfaceHeight(radius, x, z) {
    if (radius >= this.config.moundRadius) return 0;

    const baseHeight =
      Math.cos((radius / this.config.moundRadius) * (Math.PI / 2)) *
      this.config.moundHeight;

    const noise =
      Math.sin(x * 2.5) * Math.cos(z * 2.5) * this.config.roughnessNoise +
      Math.sin(z * 5.0) * (this.config.roughnessNoise * 0.33);

    return Math.max(0, baseHeight + noise);
  }

  initMound() {
    const geo = new THREE.SphereGeometry(this.config.moundRadius, 48, 48);
    geo.scale(1, this.config.moundHeight / this.config.moundRadius, 1);

    const posAttr = geo.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      if (vertex.y < -0.1) {
        vertex.y = -0.1;
      } else {
        const radius = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
        vertex.y = this.calculateSurfaceHeight(radius, vertex.x, vertex.z);
      }
      posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geo.computeVertexNormals();

    this.mound = new THREE.Mesh(geo, this.dirtMaterial);
    this.mound.position.y = -7.10;
    this.mound.castShadow = true;
    this.mound.receiveShadow = true;
    this.scene.add(this.mound);
  }

  spawn(growthFactor = 0) {
    const growthSizeScale = 0.4 + growthFactor * 0.8;
    const growthSpeedScale = 0.5 + growthFactor * 0.5;

    const geo =
      this.rockGeometries[Math.floor(Math.random() * this.rockGeometries.length)];
    const pMesh = new THREE.Mesh(geo, this.dirtMaterial);
    pMesh.castShadow = true;
    this.scene.add(pMesh);

    const randomAngle = Math.random() * Math.PI * 2;
    const randomStartRadius =
      0.02 + Math.random() * (this.config.moundRadius * 0.1);
    
    const randomizedSpeed =
      this.config.rollingSpeed * growthSpeedScale * (0.85 + Math.random() * 0.3);
    
    const maxDistance = this.config.moundRadius + 0.2 + Math.random() * 0.5;

    const halfVariety = this.config.sizeVariety / 2;
    const scaleModifier =
      1 - halfVariety + Math.random() * this.config.sizeVariety;
    const finalScale = this.config.baseSize * growthSizeScale * scaleModifier;

    pMesh.scale.set(finalScale, finalScale, finalScale);

    this.particles.push({
      mesh: pMesh,
      angle: randomAngle,
      currentRadius: randomStartRadius,
      maxDistance: maxDistance,
      speed: randomizedSpeed,
      createdAt: performance.now(),
      delay: Math.random() * 200,
      rotSpeedX: (Math.random() - 0.5) * 6,
      rotSpeedZ: (Math.random() - 0.5) * 6,
    });
  }

  update(dt) {
    const now = performance.now();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (now - p.createdAt < p.delay) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;

      p.currentRadius += p.speed * dt;

      const currentX = Math.cos(p.angle) * p.currentRadius;
      const currentZ = Math.sin(p.angle) * p.currentRadius;

      const currentY =
        this.calculateSurfaceHeight(p.currentRadius, currentX, currentZ) +
        0.5 * p.mesh.scale.y;

      p.mesh.position.set(currentX, -7.10 + currentY, currentZ);

      p.mesh.rotation.x += p.rotSpeedX * dt;
      p.mesh.rotation.z += p.rotSpeedZ * dt;

      if (p.currentRadius >= p.maxDistance) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}
