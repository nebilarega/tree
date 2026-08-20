import * as THREE from 'three';

const FOREGROUND_GEOMETRY = buildQuadGeometry(
  [
    [0.146573, 0.127266, 0.458553],
    [0.228827, -0.122203, 0.443074],
    [-0.395632, 0.122203, -0.504593],
    [-0.313378, -0.127266, -0.520072],
  ],
  [0, 1, 3, 0, 3, 2]
);

const MIDDLEGROUND_GEOMETRY = buildQuadGeometry(
  [
    [0.3132, 0.1273, 0.52],
    [0.3954, -0.1222, 0.5046],
    [-0.229, 0.1222, -0.4431],
    [-0.1468, -0.1273, -0.4586],
  ],
  [0, 1, 3, 0, 3, 2]
);

const FOREGROUND_INSTANCES = [
  { position: [249.33, -80.82, -2.17], scale: [163.29, 656.85, 237.19], rotation: [0, 0, 0] },
  { position: [98.44, -50.32, 62.69], scale: [146.93, 722.35, 213.44], rotation: [0, 0, 0] },
  { position: [153.94, -74.24, 283.85], scale: [202.75, 996.73, 294.51], rotation: [0, 0, 0] },
];

const MIDDLEGROUND_INSTANCES = [
  { position: [117.57, -28.92, -204.93], scale: [118.04, 580.3, 232.98], rotation: [0, -0.041, 0] },
  { position: [-10.56, -36.84, 152.1], scale: [119.22, 586.07, 173.17], rotation: [0, 0, 0] },
  { position: [64.66, -41.65, 156.02], scale: [147.03, 722.83, 213.58], rotation: [0, 0, 0] },
  { position: [3.76, -18.43, -119.46], scale: [127.68, 627.68, 185.47], rotation: [0, 0, 0] },
  { position: [96.64, -27.43, -89.5], scale: [100.93, 496.18, 146.61], rotation: [0, 0, 0] },
  { position: [74, -24.83, 116.24], scale: [134.67, 662.08, 195.63], rotation: [0, 0, 0] },
];

/** Default layout for the instanced cloud field. */
export const DEFAULT_LAYOUT = {
  position: [0, 50, 0],
  rotationDeg: [5.5, -110.5, 0],
};

/** Suggested camera for the default layout. */
export const DEFAULT_CAMERA = {
  position: new THREE.Vector3(0, 0, 304.77),
  target: new THREE.Vector3(0, 3.9, 0),
};

function buildQuadGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 1, 1, 0], 2)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createInstancedLayer(name, geometry, instances, material, renderOrder) {
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  instances.forEach((instance, index) => {
    position.fromArray(instance.position);
    scale.fromArray(instance.scale);
    euler.fromArray(instance.rotation);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Creates Foreground (×3) + Middleground (×6) instanced cloud planes.
 */
export function createCloudPlanes(material, layout = DEFAULT_LAYOUT) {
  const group = new THREE.Group();
  group.name = 'Clouds';

  const foreground = createInstancedLayer(
    'Foreground',
    FOREGROUND_GEOMETRY,
    FOREGROUND_INSTANCES,
    material,
    1
  );
  const middleground = createInstancedLayer(
    'Middleground',
    MIDDLEGROUND_GEOMETRY,
    MIDDLEGROUND_INSTANCES,
    material,
    -1
  );

  group.add(middleground, foreground);
  group.position.fromArray(layout.position);
  group.rotation.set(
    THREE.MathUtils.degToRad(layout.rotationDeg[0]),
    THREE.MathUtils.degToRad(layout.rotationDeg[1]),
    THREE.MathUtils.degToRad(layout.rotationDeg[2])
  );
  if (layout.scale) {
    group.scale.fromArray(layout.scale);
  }

  return { group, foreground, middleground };
}
