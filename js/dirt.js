import * as THREE from "three";
import { scene } from "./scene.js";

const config = {
  particleAmount: 5,
  baseSize: 0.12,
  sizeVariety: 0.6,
  rollingSpeed: 2.0, // Midpoint between 1.5 and 2.5
  moundRadius: 2.2,
  moundHeight: 0.8,
  roughnessNoise: 0.12,
};

const dirtMaterial = new THREE.MeshStandardMaterial({
  color: 0x5d4037, // Warmer, lighter brown
  roughness: 0.7,  // Slightly reduced roughness to catch highlights
  flatShading: true,
  envMapIntensity: 1.2, // Allow it to pick up the rainforest environment
});

let dirtMound;
const particles = [];
const rockGeometries = [
  new THREE.DodecahedronGeometry(1, 0),
  new THREE.IcosahedronGeometry(1, 0),
];

function calculateSurfaceHeight(radius, x, z) {
  if (radius >= config.moundRadius) return 0;

  const baseHeight =
    Math.cos((radius / config.moundRadius) * (Math.PI / 2)) *
    config.moundHeight;

  const noise =
    Math.sin(x * 2.5) * Math.cos(z * 2.5) * config.roughnessNoise +
    Math.sin(z * 5.0) * (config.roughnessNoise * 0.33);

  return Math.max(0, baseHeight + noise);
}

export function initDirt() {
  const geo = new THREE.SphereGeometry(config.moundRadius, 48, 48);
  geo.scale(1, config.moundHeight / config.moundRadius, 1);

  const posAttr = geo.attributes.position;
  const vertex = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);
    if (vertex.y < -0.1) {
      vertex.y = -0.1;
    } else {
      const radius = Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z);
      vertex.y = calculateSurfaceHeight(radius, vertex.x, vertex.z);
    }
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geo.computeVertexNormals();

  dirtMound = new THREE.Mesh(geo, dirtMaterial);
  dirtMound.position.y = -7.10; // Base of the tree
  dirtMound.castShadow = true;
  dirtMound.receiveShadow = true;
  scene.add(dirtMound);
}

export function spawnDirt(growthFactor = 0) {
  // Scale base properties by growth (0.0 to 1.0)
  // Size: starts at 40% of base, reaches 120% at full growth
  const growthSizeScale = 0.4 + growthFactor * 0.8;
  // Speed: starts at 50% of base, reaches 100% at full growth
  const growthSpeedScale = 0.5 + growthFactor * 0.5;

  const geo =
    rockGeometries[Math.floor(Math.random() * rockGeometries.length)];
  const pMesh = new THREE.Mesh(geo, dirtMaterial);
  pMesh.castShadow = true;
  scene.add(pMesh);

  const randomAngle = Math.random() * Math.PI * 2;
  const randomStartRadius =
    0.02 + Math.random() * (config.moundRadius * 0.1);
  
  const randomizedSpeed =
    config.rollingSpeed * growthSpeedScale * (0.85 + Math.random() * 0.3);
  
  const maxDistance = config.moundRadius + 0.2 + Math.random() * 0.5;

  const halfVariety = config.sizeVariety / 2;
  const scaleModifier =
    1 - halfVariety + Math.random() * config.sizeVariety;
  const finalScale = config.baseSize * growthSizeScale * scaleModifier;

  pMesh.scale.set(finalScale, finalScale, finalScale);

  particles.push({
    mesh: pMesh,
    angle: randomAngle,
    currentRadius: randomStartRadius,
    maxDistance: maxDistance,
    speed: randomizedSpeed,
    createdAt: performance.now(),
    delay: Math.random() * 200, // Reduced delay for more immediate feedback
    rotSpeedX: (Math.random() - 0.5) * 6, // Increased from 4
    rotSpeedZ: (Math.random() - 0.5) * 6, // Increased from 4
  });
}

export function updateDirt(dt) {
  const now = performance.now();

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    if (now - p.createdAt < p.delay) {
      p.mesh.visible = false;
      continue;
    }
    p.mesh.visible = true;

    p.currentRadius += p.speed * dt;

    const currentX = Math.cos(p.angle) * p.currentRadius;
    const currentZ = Math.sin(p.angle) * p.currentRadius;

    const currentY =
      calculateSurfaceHeight(p.currentRadius, currentX, currentZ) +
      0.5 * p.mesh.scale.y;

    p.mesh.position.set(currentX, -7.10 + currentY, currentZ);

    p.mesh.rotation.x += p.rotSpeedX * dt;
    p.mesh.rotation.z += p.rotSpeedZ * dt;

    if (p.currentRadius >= p.maxDistance) {
      scene.remove(p.mesh);
      // We don't dispose the geometry here because it's shared from rockGeometries
      particles.splice(i, 1);
    }
  }
}
