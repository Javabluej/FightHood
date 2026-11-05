import * as THREE from 'three';

/** Avatar skin and fabric are dielectrics. Some exports omit metallicFactor,
 * which glTF defines as 1 and makes unlit faces appear black without an HDRI. */
export function prepareAvatarMaterial(source: THREE.Material, meshName: string, alternate: boolean): THREE.Material {
  const material = source.clone() as THREE.MeshStandardMaterial;
  if (material.isMeshStandardMaterial) {
    if (!/glasses|jewel|metal/i.test(`${meshName} ${source.name}`)) {
      material.metalness = 0;
      material.roughness = Math.max(0.65, material.roughness);
    }
    // Thin, double-sided clothing must not cast its back faces onto itself.
    material.shadowSide = THREE.FrontSide;
    if (alternate && /outfit|clothes|jacket|pants|shirt/i.test(`${meshName} ${source.name}`)) {
      material.color.offsetHSL(0.5, 0, 0);
    }
  }
  return material;
}
