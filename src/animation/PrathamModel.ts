import * as THREE from 'three';
import { createReferenceHuman } from './KennyModel';

/** A rounded face, thick black spectacles and a cream hoodie on the detailed human rig. */
export function createPrathamModel(source: THREE.Object3D, face: THREE.Texture, alternateCostume = false): THREE.Object3D {
  return createReferenceHuman(source, face, {
    identity: 'pratham', alternateCostume, faceWidth: 1.30,
    faceAnchors: [[0,0],[.3,.2],[.369,.29],[.4,.345],[.425,.385],[.455,.43],[.535,.495],[.66,.588],[.85,.82],[1,1]],
  });
}
