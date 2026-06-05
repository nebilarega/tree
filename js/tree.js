import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

const leafPalettes = [
  new THREE.Color("#245c32"),
  new THREE.Color("#3b8c4c"),
  new THREE.Color("#5ea351"),
  new THREE.Color("#4a7c59"),
  new THREE.Color("#a89744"),
];

export class Tree {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.barkTexture = this._createProceduralBarkTexture();
    this.trunkMaterial = new THREE.MeshStandardMaterial({
      map: this.barkTexture,
      bumpMap: this.barkTexture,
      bumpScale: 0.05,
      roughness: 0.6,
      metalness: 0.0,
      envMapIntensity: 1.6,
    });

    this.leafMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      metalness: 0.0,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
      envMapIntensity: 1.35,
    });
    this._initWindShader();

    this.baseCylinderGeo = new THREE.CylinderGeometry(0.55, 1, 1, 5, 1, false);
    this.baseCylinderGeo.translate(0, 0.5, 0);

    this.leafClumpGeometry = this._createLeafClumpGeometry();

    // Cache Fruit Geometries and Materials for performance
    this.fruitGeo = new THREE.SphereGeometry(0.35, 12, 12);
    this.fruitMat = new THREE.MeshStandardMaterial({ 
      color: "#ff0000", 
      roughness: 0.1,
      metalness: 0.2,
      emissive: "#880000", 
      envMapIntensity: 2.5 
    });

    this.haloGeo = new THREE.SphereGeometry(0.48, 16, 16);
    this.haloMatTemplate = new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0.0 } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying vec3 vNormal;
        vec3 brightnessToColor(float b){
            b *= 0.25;
            return (vec3(b, b*b, b*b*b*b)/0.25)*0.6;
        }
        void main() {
          vec3 n = normalize(vNormal);
          float fresnel = pow(1.0 - abs(dot(n, vec3(0.0, 0.0, 1.0))), 3.0);
          vec3 col = brightnessToColor(fresnel * 2.0 + 1.2);
          gl_FragColor = vec4(col, fresnel * opacity);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });

    this.leafTransforms = [];
    this.leafColors = [];
    this.fruitTransforms = []; 
    this.branchGeometries = [];
    this.instancedTwigTransforms = [];

    // Shared scratch variables
    this._vertex = new THREE.Vector3();
    this._radialDir = new THREE.Vector3();
    this._centerPoint = new THREE.Vector3();
    this._upRef = new THREE.Vector3(0, 1, 0);
    this._scratchVec1 = new THREE.Vector3();
    this._scratchVec2 = new THREE.Vector3();
    this._scratchQuat = new THREE.Quaternion();
    this._scratchScale = new THREE.Vector3();
  }

  _initWindShader() {
    this.leafMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      this.leafMaterial.userData.shader = shader;

      shader.vertexShader = `
        uniform float time;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        float localWind = sin(time * 2.0 + position.y * 5.0 + position.x * 2.0) * 0.03;
        float globalWind = sin(time * 0.8) * 0.02;
        
        float swayScale = clamp(length(position) * 1.5, 0.0, 1.0);
        
        transformed.x += (localWind + globalWind) * swayScale;
        transformed.z += (localWind * 0.5 + globalWind) * swayScale;
        transformed.y += sin(time * 3.0 + position.z * 4.0) * 0.01 * swayScale;
        `
      );
    };
  }

  _createProceduralBarkTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#59402a";
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const w = 4 + Math.random() * 12;
      const h = 40 + Math.random() * 120;
      ctx.fillStyle = Math.random() > 0.5 ? "#2c1c11" : "#463020";
      ctx.fillRect(x, y, w, h);
      if (x + w > 512) ctx.fillRect(x - 512, y, w, h);
      if (y + h > 512) ctx.fillRect(x, y - 512, w, h);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4);
    return texture;
  }

  _createLeafClumpGeometry() {
    const baseLeafShape = new THREE.Shape();
    baseLeafShape.moveTo(0, 0);
    baseLeafShape.quadraticCurveTo(0.15, 0.15, 0.12, 0.4);
    baseLeafShape.quadraticCurveTo(0.05, 0.7, 0, 0.85);
    baseLeafShape.quadraticCurveTo(-0.05, 0.7, -0.12, 0.4);
    baseLeafShape.quadraticCurveTo(-0.15, 0.15, 0, 0);

    const singleLeafGeo = new THREE.ShapeGeometry(baseLeafShape);
    const posAttr = singleLeafGeo.attributes.position;
    const uvs = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      uvs[i * 2] = (posAttr.getX(i) + 0.15) / 0.3;
      uvs[i * 2 + 1] = posAttr.getY(i) / 0.85;
    }
    singleLeafGeo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    const leafGeometries = [];
    const numLeavesInClump = 6;
    for (let i = 0; i < numLeavesInClump; i++) {
      const leafCopy = singleLeafGeo.clone();
      const angle = (i / numLeavesInClump) * Math.PI * 2;
      const dummy = new THREE.Object3D();

      dummy.position.set(
        Math.cos(angle) * 0.25,
        (Math.random() - 0.5) * 0.05,
        Math.sin(angle) * 0.25,
      );
      dummy.rotation.set(
        0.2 + Math.random() * 0.2,
        angle,
        0.3 * (Math.random() - 0.5),
      );

      const leafScale = 0.5 + Math.random() * 0.3;
      dummy.scale.set(leafScale * 1.3, leafScale, leafScale);
      dummy.updateMatrix();
      leafCopy.applyMatrix4(dummy.matrix);
      leafGeometries.push(leafCopy);
    }

    const mergedGeometry = BufferGeometryUtils.mergeGeometries(leafGeometries);
    singleLeafGeo.dispose();
    leafGeometries.forEach((geo) => geo.dispose());

    return mergedGeometry;
  }

  rebuild(growthValue) {
    const startTime = performance.now();

    this.group.traverse((child) => {
      if (child.isMesh || child.isInstancedMesh) {
        if (
          child.geometry &&
          child.geometry !== this.baseCylinderGeo &&
          child.geometry !== this.leafClumpGeometry &&
          child.geometry !== this.fruitGeo &&
          child.geometry !== this.haloGeo
        ) {
          child.geometry.dispose();
        }
      }
    });
    this.group.clear();

    this.leafTransforms = [];
    this.leafColors = [];
    this.fruitTransforms = []; 
    this.branchGeometries = [];
    this.instancedTwigTransforms = [];

    const calculatedInternalGrowth = growthValue * 0.62;
    const baseTrunkStart = new THREE.Vector3(0, -7, 0);
    const baseTrunkDir = new THREE.Vector3(0, 1, 0).normalize();
    const baseTrunkMaxLen = 9.5;
    const currentTrunkLen =
      baseTrunkMaxLen * Math.min(1.0, calculatedInternalGrowth * 1.5);
    const currentTrunkRadius = 0.85 * Math.log1p(calculatedInternalGrowth * 1.5);

    this._generateLSystem(
      baseTrunkStart,
      baseTrunkDir,
      currentTrunkLen,
      currentTrunkRadius,
      0,
      5,
      calculatedInternalGrowth,
      null,
      growthValue,
      "0"
    );

    if (this.branchGeometries.length > 0) {
      const mergedBranchGeometry =
        BufferGeometryUtils.mergeGeometries(this.branchGeometries);
      const unifiedBranchMesh = new THREE.Mesh(
        mergedBranchGeometry,
        this.trunkMaterial,
      );
      unifiedBranchMesh.castShadow = true;
      unifiedBranchMesh.receiveShadow = true;
      this.group.add(unifiedBranchMesh);
      this.branchGeometries.forEach((geo) => geo.dispose());
    }

    if (this.instancedTwigTransforms.length > 0) {
      const twigInstancedMesh = new THREE.InstancedMesh(
        this.baseCylinderGeo,
        this.trunkMaterial,
        this.instancedTwigTransforms.length,
      );
      twigInstancedMesh.castShadow = true;
      twigInstancedMesh.receiveShadow = true;
      for (let i = 0; i < this.instancedTwigTransforms.length; i++) {
        twigInstancedMesh.setMatrixAt(i, this.instancedTwigTransforms[i]);
      }
      twigInstancedMesh.instanceMatrix.needsUpdate = true;
      this.group.add(twigInstancedMesh);
    }

    if (this.leafTransforms.length > 0) {
      const leafInstancedMesh = new THREE.InstancedMesh(
        this.leafClumpGeometry,
        this.leafMaterial,
        this.leafTransforms.length,
      );
      leafInstancedMesh.castShadow = true;
      leafInstancedMesh.receiveShadow = true;
      for (let i = 0; i < this.leafTransforms.length; i++) {
        leafInstancedMesh.setMatrixAt(i, this.leafTransforms[i]);
        leafInstancedMesh.setColorAt(i, this.leafColors[i]);
      }
      leafInstancedMesh.instanceMatrix.needsUpdate = true;
      if (leafInstancedMesh.instanceColor)
        leafInstancedMesh.instanceColor.needsUpdate = true;
      this.group.add(leafInstancedMesh);
    }

    if (growthValue > 0.9 && this.fruitTransforms.length > 0) {
      const fruitScale = THREE.MathUtils.clamp((growthValue - 0.9) / 0.1, 0, 1);
      this._renderFruits(fruitScale);
    }

    return performance.now() - startTime;
  }

  _renderFruits(individualScale = 1.0) {
    const socialConfigs = [
      { name: 'LinkedIn', color: '#0077b5' },
      { name: 'GitHub', color: '#111111' },
      { name: 'Portfolio', color: '#ff6666' }
    ];

    const poolSize = this.fruitTransforms.length;
    if (poolSize === 0) return;

    const sortedPool = [...this.fruitTransforms].sort((a, b) => a.path.localeCompare(b.path));

    const socialIndices = [
      Math.floor(poolSize * 0.40),
      Math.floor(poolSize * 0.50),
      Math.floor(poolSize * 0.60)
    ];

    const numTotalApples = 25; 
    const indicesToRender = [];
    
    socialIndices.forEach(idx => indicesToRender.push({ index: idx, isSocial: true }));
    const fillerCount = numTotalApples - socialIndices.length;
    for (let i = 0; i < fillerCount; i++) {
      const idx = Math.floor((i / fillerCount) * (poolSize - 1));
      if (!socialIndices.includes(idx)) {
          indicesToRender.push({ index: idx, isSocial: false });
      }
    }

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const twigScale = new THREE.Vector3();

    indicesToRender.forEach((item, i) => {
      const fruitData = sortedPool[item.index];
      if (!fruitData) return;

      const transform = fruitData.matrix;
      transform.decompose(position, quaternion, twigScale);

      let socialConfig = null;
      if (item.isSocial) {
          const sIdx = socialIndices.indexOf(item.index);
          socialConfig = socialConfigs[sIdx];
      }

      const apple = new THREE.Mesh(this.fruitGeo, this.fruitMat);
      apple.position.copy(position);
      apple.quaternion.copy(quaternion);
      apple.scale.setScalar(individualScale);
      
      apple.userData = { 
        type: 'fruit', 
        path: fruitData.path,
        social: socialConfig ? socialConfig.name : null
      };
      apple.castShadow = true;
      
      // Halo
      const haloMat = this.haloMatTemplate.clone();
      const halo = new THREE.Mesh(this.haloGeo, haloMat);
      halo.name = 'halo';
      apple.add(halo);

      this.group.add(apple);
    });
  }

  updateWind(time) {
    if (this.leafMaterial.userData.shader) {
      this.leafMaterial.userData.shader.uniforms.time.value = time;
    }
  }

  _createBranchGeometry(curve, startRadius, endRadius, parentRadius, segments, radialSegments, isTrunk = false) {
    const geometry = new THREE.TubeGeometry(curve, segments, startRadius, radialSegments, false);
    const positionAttribute = geometry.attributes.position;
    const targetBaseRadius = startRadius + (parentRadius - startRadius) * 0.45;

    for (let i = 0; i <= segments; i++) {
      const progression = i / segments;
      const standardRadius = THREE.MathUtils.lerp(startRadius, endRadius, progression);
      const flareDropoff = Math.exp(-progression * 6.0);
      let actualRadius = THREE.MathUtils.lerp(standardRadius, targetBaseRadius, flareDropoff);

      if (isTrunk && progression > 0.9) {
        const pinchFactor = THREE.MathUtils.mapLinear(progression, 0.9, 1.0, 1.0, 0.3);
        actualRadius *= pinchFactor;
      }

      curve.getPointAt(progression, this._centerPoint);
      for (let j = 0; j <= radialSegments; j++) {
        const vertexIndex = i * (radialSegments + 1) + j;
        if (vertexIndex < positionAttribute.count) {
          this._vertex.fromBufferAttribute(positionAttribute, vertexIndex);
          this._radialDir.copy(this._vertex).sub(this._centerPoint).normalize();
          this._vertex.copy(this._centerPoint).addScaledVector(this._radialDir, actualRadius);
          positionAttribute.setXYZ(vertexIndex, this._vertex.x, this._vertex.y, this._vertex.z);
        }
      }
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  _generateLSystem(startPos, direction, length, radius, currentDepth, maxDepth, growthFactor, parentRadius = null, originalGrowth = 0, path = "0") {
    if (currentDepth > maxDepth || length < 0.03 || radius < 0.001) return;

    const endPos = new THREE.Vector3().copy(startPos).addScaledVector(direction, length);
    let curveAxis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    if (curveAxis.lengthSq() < 0.001) curveAxis.set(1, 0, 0);
    const secondaryAxis = new THREE.Vector3().copy(curveAxis).cross(direction).normalize();
    const cp1 = new THREE.Vector3();
    const cp2 = new THREE.Vector3();

    if (currentDepth === 0) {
      const maxTrunkWobble = 2.2;
      const currentWobble = growthFactor * maxTrunkWobble;
      cp1.copy(startPos).addScaledVector(direction, length * 0.35);
      cp2.copy(startPos).addScaledVector(direction, length * 0.7).add(this._scratchVec1.set(currentWobble, 0, currentWobble * 0.5));
    } else {
      const proportionalOffset = length * 0.35;
      cp1.copy(startPos).addScaledVector(direction, length * 0.33);
      cp2.copy(startPos).addScaledVector(direction, length * 0.66).addScaledVector(curveAxis, proportionalOffset).addScaledVector(secondaryAxis, proportionalOffset * 0.2);
    }

    const branchCurve = new THREE.CubicBezierCurve3(startPos, cp1, cp2, endPos);
    let segments = currentDepth === 0 ? 40 : currentDepth === 1 ? 20 : currentDepth === 2 ? 8 : currentDepth === 3 ? 4 : 2;
    let radialSegments = currentDepth === 0 ? 16 : currentDepth === 1 ? 10 : currentDepth === 2 ? 6 : currentDepth === 3 ? 4 : 3;

    const targetEndRadius = currentDepth === 0 ? radius * 0.45 : radius * 0.55;

    if (currentDepth >= 4) {
      const matrix = new THREE.Matrix4();
      this._upRef.set(0, 1, 0);
      this._scratchQuat.setFromUnitVectors(this._upRef, direction);
      this._scratchScale.set(radius, length, radius);
      matrix.compose(startPos, this._scratchQuat, this._scratchScale);
      this.instancedTwigTransforms.push(matrix);

      if (originalGrowth > 0.8) {
        const fruitMatrix = new THREE.Matrix4().copy(matrix);
        fruitMatrix.multiply(new THREE.Matrix4().makeTranslation(0, 1.0, 0));
        this.fruitTransforms.push({ matrix: fruitMatrix, path: path + "-tip" });
      }
    } else {
      const branchGeo = this._createBranchGeometry(branchCurve, radius, targetEndRadius, parentRadius === null ? radius * 1.15 : parentRadius, segments, radialSegments, currentDepth === 0);
      this.branchGeometries.push(branchGeo);
    }

    const nextDepth = currentDepth + 1;
    const nextLength = currentDepth === 0 ? length * 0.65 : length * 0.72;
    const nextRadius = radius * 0.48;

    if (currentDepth === 3 && growthFactor > 0.05) {
      const fineAvailability = THREE.MathUtils.clamp((growthFactor - 0.05) / 0.45, 0.0, 1.0);
      for (let k = 1; k <= segments; k++) {
        const splitProgress = k / segments;
        const splitOrigin = branchCurve.getPointAt(splitProgress);
        const seed = currentDepth * 3000 + k * 51.17;
        const goldenAngleStep = k * 2.39996 + Math.cos(seed * 0.7) * 0.3;
        const fineDir = new THREE.Vector3(Math.cos(goldenAngleStep) * 0.5, 0.5, Math.sin(goldenAngleStep) * 0.5).normalize();
        const adjustedAvailability = THREE.MathUtils.clamp((fineAvailability - 0.1) / 0.9, 0, 1);
        const localGrowth = Math.min(1.0, adjustedAvailability * 1.8);
        this._generateLSystem(splitOrigin, fineDir, nextLength * localGrowth, nextRadius * Math.pow(localGrowth, 1.2), nextDepth, maxDepth, growthFactor, THREE.MathUtils.lerp(radius, targetEndRadius, splitProgress), originalGrowth, path + "-k" + k);
      }
    }

    if (currentDepth === 4 && growthFactor > 0.05) {
      const leafGrowth = THREE.MathUtils.clamp((growthFactor - 0.05) / 0.32, 0.0, 1.0);
      const clumpsPerSegment = 6;
      const stepDelta = Math.max(1, Math.floor(segments / 8));
      for (let k = 1; k <= segments; k += stepDelta) {
        const progress = k / segments;
        const leafPos = branchCurve.getPointAt(progress);
        const branchForward = branchCurve.getTangentAt(progress).normalize();
        const heightFromBase = leafPos.y + 7.0;
        let hScale = (heightFromBase > 4.0 && heightFromBase < 18.0) ? Math.sin(((heightFromBase - 4.0) / 14.0) * Math.PI) : 0;
        if (hScale >= 0.1) {
          let refUp = this._upRef.set(0, 1, 0);
          if (Math.abs(branchForward.dot(refUp)) > 0.95) refUp.set(1, 0, 0);
          const bRight = new THREE.Vector3().crossVectors(branchForward, refUp).normalize();
          const bUp = new THREE.Vector3().crossVectors(bRight, branchForward).normalize();
          for (let l = 0; l < clumpsPerSegment; l++) {
            const seed = currentDepth * 4000 + (k * clumpsPerSegment + l) * 53.17;
            const randB = Math.cos(seed * 1.4) * 0.5 + 0.5;
            const sAngle = (l / clumpsPerSegment) * Math.PI * 2;
            const thick = THREE.MathUtils.lerp(radius, targetEndRadius, progress);
            const finalPos = new THREE.Vector3().copy(leafPos).addScaledVector(bRight, Math.cos(sAngle) * thick * (0.8 + randB * 1.1)).addScaledVector(bUp, Math.sin(sAngle) * thick * (0.8 + randB * 1.1));
            const outward = new THREE.Vector3().addScaledVector(bRight, Math.cos(sAngle)).addScaledVector(bUp, Math.sin(sAngle)).normalize();
            const cForward = new THREE.Vector3().copy(outward).multiplyScalar(0.8).addScaledVector(branchForward, 0.2).add(new THREE.Vector3(0, -0.15, 0)).normalize();
            let cUp = new THREE.Vector3(0, 1, 0);
            if (Math.abs(cForward.dot(cUp)) > 0.95) cUp.set(1, 0, 0);
            const cRight = new THREE.Vector3().crossVectors(cForward, cUp).normalize();
            cUp.crossVectors(cRight, cForward).normalize();
            const matrix = new THREE.Matrix4();
            matrix.makeBasis(cRight, cUp, cForward);
            matrix.setPosition(finalPos);
            const fScale = (0.35 + Math.sin(seed * 0.5 + 0.5) * 0.4) * leafGrowth * hScale * 1.38;
            matrix.multiply(new THREE.Matrix4().makeScale(fScale, fScale, fScale));
            this.leafTransforms.push(matrix);
            if (originalGrowth > 0.95 && l === 0 && k % 12 === 0) {
                const fMat = new THREE.Matrix4().copy(matrix).multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0));
                this.fruitTransforms.push({ matrix: fMat, path: path + "-l" + k + "-" + l });
            }
            this.leafColors.push(leafPalettes[Math.floor(randB * leafPalettes.length)].clone().offsetHSL((Math.sin(seed * 0.5 + 0.5) - 0.5) * 0.06, 0, (Math.sin(seed * 0.5 + 0.5) - 0.5) * 0.1));
          }
        }
      }
    }

    if (currentDepth === 0 && growthFactor > 0.01) {
      const bAvail = (growthFactor - 0.01) / 0.99;
      for (let i = 0; i < 12; i++) {
        const seed = i * 43.19;
        const progress = 0.35 + (i / 12) * 0.52 + Math.sin(seed) * 0.03;
        const angle = i * 2.39996 + Math.cos(seed * 1.7) * 0.2;
        const pitch = THREE.MathUtils.clamp(0.45 + (i / 12) * 0.15 + Math.sin(seed * 2.3) * 0.08, 0.3, 0.7);
        const bDir = new THREE.Vector3(Math.cos(angle) * (1.0 - pitch), pitch, Math.sin(angle) * (1.0 - pitch)).normalize();
        const lGrowth = Math.min(1.0, THREE.MathUtils.clamp((bAvail - (i / 12) * 0.15) / (1.0 - (i / 12) * 0.15), 0, 1) * 1.5);
        if (lGrowth > 0.01) this._generateLSystem(branchCurve.getPointAt(progress), bDir, nextLength * lGrowth, nextRadius * Math.pow(lGrowth, 1.2), nextDepth, maxDepth, growthFactor, THREE.MathUtils.lerp(radius, targetEndRadius, progress), originalGrowth, path + "-s" + i);
      }
    } else if (currentDepth === 1 && growthFactor > 0.12) {
      const tAvail = (growthFactor - 0.12) / 0.88;
      for (let i = 0; i < 3; i++) {
        const progress = 0.35 + i * 0.2;
        const tangent = branchCurve.getTangentAt(progress);
        const side = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
        if (side.lengthSq() < 0.001) side.set(1, 0, 0);
        const tDir = new THREE.Vector3().copy(tangent).addScaledVector(side, (i === 0 ? 1.0 : i === 1 ? -1.0 : 0.3) * 0.85);
        tDir.y += 0.1;
        this._generateLSystem(branchCurve.getPointAt(progress), tDir.normalize(), nextLength * Math.min(1.0, tAvail * 1.5), nextRadius * Math.pow(Math.min(1.0, tAvail * 1.5), 1.2), nextDepth, maxDepth, growthFactor, THREE.MathUtils.lerp(radius, targetEndRadius, progress), originalGrowth, path + "-t" + i);
      }
    } else if (currentDepth === 2 && growthFactor > 0.22) {
      const fAvail = (growthFactor - 0.22) / 0.78;
      for (let i = 0; i < 3; i++) {
        const progress = 0.4 + i * 0.22;
        const lat = new THREE.Vector3(Math.cos((i / 3) * Math.PI * 2), 0.3, Math.sin((i / 3) * Math.PI * 2)).normalize();
        const sDir = new THREE.Vector3().copy(branchCurve.getTangentAt(progress)).addScaledVector(lat, 0.7).normalize();
        this._generateLSystem(branchCurve.getPointAt(progress), sDir, nextLength * Math.min(1.0, fAvail * 1.7), nextRadius * Math.pow(Math.min(1.0, fAvail * 1.7), 1.2), nextDepth, maxDepth, growthFactor, THREE.MathUtils.lerp(radius, targetEndRadius, progress), originalGrowth, path + "-sh" + i);
      }
    }
  }
}
