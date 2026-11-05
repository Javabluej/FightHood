import * as THREE from 'three';

export interface ReferenceHumanOptions {
  identity: 'kenny' | 'pratham';
  alternateCostume?: boolean;
  faceWidth?: number;
  faceAnchors?: number[][];
}

/** Retain the accepted Kenny appearance while sharing the owned human-mesh pipeline. */
export function createKennyModel(source: THREE.Object3D, headTexture: THREE.Texture, alternateCostume = false): THREE.Object3D {
  return createReferenceHuman(source, headTexture, { identity: 'kenny', alternateCostume });
}

export function createReferenceHuman(source: THREE.Object3D, headTexture: THREE.Texture, options: ReferenceHumanOptions): THREE.Object3D {
  const pratham = options.identity === 'pratham';
  const alternateCostume = options.alternateCostume ?? false;
  source.name = pratham ? 'PrathamHoodie' : 'KennyTeacher';
  headTexture.colorSpace = THREE.SRGBColorSpace;
  headTexture.flipY = false;
  const faceMeshes = new Set(['Head', 'EyeL', 'EyeR', 'EyeCorneaL', 'EyeCorneaR', 'Eyelashes', 'TeethLower', 'TeethUpper']);
  source.traverse(part => {
    if (!(part instanceof THREE.Mesh)) return;
    // Own customized geometry/materials; the cached source remains untouched.
    part.geometry = part.geometry.clone();
    part.material = Array.isArray(part.material) ? part.material.map(m => m.clone()) : part.material.clone();
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    const positions = part.geometry.getAttribute('position');
    if (faceMeshes.has(part.name)) {
      for (let i = 0; i < positions.count; i++) positions.setX(i, positions.getX(i) * (options.faceWidth ?? 1.15));
      positions.needsUpdate = true;
      if (pratham) {
        for (let i=0;i<positions.count;i++) {
          const y=positions.getY(i),x=positions.getX(i),z=positions.getZ(i);
          if (y<1.65) positions.setY(i,1.65+(y-1.65)*.94);
          if (z>0 && y>1.56 && y<1.7) {
            const cheek=Math.max(0,1-Math.abs(y-1.625)/.075)*Math.min(1,Math.abs(x)/.055);
            positions.setZ(i,z+cheek*.006);
          }
          if(y>1.76) positions.setY(i,y+(y-1.76)*.12);
        }
      }
      part.geometry.computeVertexNormals();
    }
    if (part.name === 'Head') {
      const uv = part.geometry.getAttribute('uv');
      // The generated face atlas retains the layout; align its central facial landmarks.
      const anchors = options.faceAnchors ?? [[0, 0], [.3, .23], [.44, .36], [.535, .445], [.66, .588], [.85, .81], [1, 1]];
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        const index = Math.max(0, anchors.findIndex((a, k) => k < anchors.length - 1 && v >= a[0] && v <= anchors[k + 1][0]));
        const a = anchors[index], b = anchors[index + 1];
        const mapped = THREE.MathUtils.lerp(a[1], b[1], THREE.MathUtils.clamp((v - a[0]) / (b[0] - a[0]), 0, 1));
        const center = THREE.MathUtils.smoothstep(u, .2, .33) * (1 - THREE.MathUtils.smoothstep(u, .67, .8));
        uv.setY(i, THREE.MathUtils.lerp(v, mapped, center));
        if (pratham) {
          const mouth = Math.max(0,1-Math.abs(v-.425)/.065)*center;
          uv.setX(i,.5+(u-.5)*(1+mouth*.28));
        }
      }
      uv.needsUpdate = true;
      if (pratham) {
        const beardColors=new Float32Array(positions.count*3);
        for(let i=0;i<positions.count;i++) {
          const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
          const edge=1.61+Math.min(.035,Math.abs(x)*.25);
          const jaw=THREE.MathUtils.smoothstep(y,1.515,1.54)*(1-THREE.MathUtils.smoothstep(y,edge-.008,edge+.012));
          const mouth=(x/.048)**2+((y-1.594)/.024)**2<1;
          const coverage=z>.005&&!mouth?jaw:0;
          const shade=1-coverage*(.65+.035*Math.sin(i*17.17));
          beardColors.set([shade,shade,shade],i*3);
          if(y>1.74) {
            const front=THREE.MathUtils.smoothstep(z,-.03,.08);
            positions.setY(i,y+.025*front*THREE.MathUtils.smoothstep(y,1.74,1.80));
          }
        }
        positions.needsUpdate=true;
        part.geometry.setAttribute('color',new THREE.BufferAttribute(beardColors,3));
        part.geometry.computeVertexNormals();
      }
      for (const material of materials) {
        const skin = material as THREE.MeshStandardMaterial;
        skin.map = headTexture; skin.color.set(0xffffff); skin.roughness = .85;
        skin.normalScale?.set(.25, .25);
        if (pratham) { skin.normalMap = null; skin.vertexColors=true; }
      }
    } else if (part.name === 'OutfitTop') {
      if (pratham) { removeShirtButtons(part.geometry); }
      const colors = new Float32Array(positions.count * 3);
      const pink = new THREE.Color(alternateCostume ? '#a7c4e3' : '#efaaa5'), charcoal = new THREE.Color('#22262b');
      const hoodie = new THREE.Color(alternateCostume ? '#b7c9d6' : '#e8dfce');
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), originalY = positions.getY(i);
        // Shorten the long tunic to a shirt hem while preserving its smooth cloth surface.
        if (originalY < 1.05) positions.setY(i, 1.05 - (1.05 - originalY) * .24);
        const y = positions.getY(i);
        const opening = Math.abs(x) < .026 && y > 1.4;
        const waistcoat = Math.abs(x) < .19 && y > 1.025 && y < 1.52 && !opening;
        (pratham ? hoodie : waistcoat ? charcoal : pink).toArray(colors, i * 3);
        if (pratham && Math.abs(x) < .22) {
          positions.setX(i, x * 1.1);
          positions.setZ(i, positions.getZ(i) * 1.08);
        }
      }
      positions.needsUpdate = true;
      part.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      part.geometry.computeVertexNormals();
      for (const material of materials) {
        const cloth = material as THREE.MeshStandardMaterial;
        cloth.color.set(0xffffff); cloth.vertexColors = true; cloth.roughness = .9;
        if (pratham) { cloth.map = null; cloth.normalMap = null; }
      }
    } else if (part.name === 'OutfitBottom') {
      materials.forEach(m => (m as THREE.MeshStandardMaterial).color.set('#353b43'));
    } else if (part.name === 'Body') {
      materials.forEach(m => (m as THREE.MeshStandardMaterial).color.set('#d9b69f'));
    }
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  });
  source.updateMatrixWorld(true);
  let headBone: THREE.Bone | undefined;
  source.traverse(part => { if (part instanceof THREE.Bone && /^Head(_\d+)?$/.test(part.name)) headBone = part; });
  const headMesh = source.getObjectByName('Head');
  if (headBone && headMesh instanceof THREE.Mesh) {
    const glasses = new THREE.Group(); glasses.name = pratham ? 'PrathamGlasses' : 'KennyGlasses';
    const frame = new THREE.MeshStandardMaterial({ color: pratham ? 0x15171b : 0x82939e, metalness: pratham ? .05 : .75, roughness: .3 });
    const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame); mesh.position.set(x,y,z); glasses.add(mesh);
    };
    for (const side of [-1, 1]) {
      if (pratham) {
        const contour = (path: THREE.Shape | THREE.Path, w: number, h: number, r: number) => {
          path.moveTo(-w/2+r,-h/2);path.lineTo(w/2-r,-h/2);
          path.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);path.lineTo(w/2,h/2-r);
          path.quadraticCurveTo(w/2,h/2,w/2-r,h/2);path.lineTo(-w/2+r,h/2);
          path.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);path.lineTo(-w/2,-h/2+r);
          path.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
        };
        const shape = new THREE.Shape();contour(shape,.08,.054,.012);
        const hole = new THREE.Path();contour(hole,.067,.041,.009);shape.holes.push(hole);
        const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.005,bevelEnabled:false,curveSegments:12}),frame);
        rim.position.x=side*.043;glasses.add(rim);
      } else {
        for (const y of [-.018, .018]) bar(.066,.0025,.004,side*.038,y,0);
        for (const x of [side*.006,side*.07]) bar(.0025,.036,.004,x,0,0);
      }
      bar(pratham ? .005 : .0025,pratham ? .005 : .0025,.09,side*(pratham ? .083 : .071),.01,-.043);
    }
    bar(.014,pratham ? .005 : .0025,.004,0,.009,.01);
    const point = headMesh.localToWorld(new THREE.Vector3(0,1.683,.116));
    glasses.position.copy(headBone.worldToLocal(point));
    const ratio = headMesh.getWorldScale(new THREE.Vector3()).x / headBone.getWorldScale(new THREE.Vector3()).x;
    glasses.scale.setScalar(ratio);
    headBone.add(glasses);
  }
  if (pratham) attachHoodieDetails(source, alternateCostume);
  return source;
}

function attachHoodieDetails(source: THREE.Object3D, alternate: boolean): void {
  let chest: THREE.Bone | undefined;
  source.traverse(part => {if(part instanceof THREE.Bone && /^Spine2(_\d+)?$/.test(part.name)) chest=part;});
  const torso = source.getObjectByName('OutfitTop');
  if (!chest || !torso) return;
  const detail = new THREE.Group();detail.name='PrathamHood';
  const cotton = new THREE.MeshStandardMaterial({color:alternate?0xb7c9d6:0xe8dfce,roughness:.98});
  const seam = new THREE.MeshStandardMaterial({color:alternate?0x8ca9bc:0xc9c0b1,roughness:1});
  const addAt = (geometry:THREE.BufferGeometry, material:THREE.Material, x:number,y:number,z:number) => {
    const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);detail.add(part);return part;
  };
  // A folded hood sits behind the neck, rather than a rigid cone in front of it.
  const hood=addAt(new THREE.SphereGeometry(1,28,16),cotton,0,-.015,-.085);
  hood.scale.set(.145,.045,.075);hood.name='FoldedHood';
  for(const side of [-1,1]) {
    const points=[new THREE.Vector3(side*.042,-.012,.09),new THREE.Vector3(side*.047,-.10,.117),new THREE.Vector3(side*.05,-.20,.128)];
    detail.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,.0025,6,false),seam));
  }
  const pocketPath=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.105,-.25,.13),new THREE.Vector3(-.095,-.345,.145),
    new THREE.Vector3(0,-.355,.155),new THREE.Vector3(.095,-.345,.145),new THREE.Vector3(.105,-.25,.13),
  ]);
  const pocket=new THREE.Mesh(new THREE.TubeGeometry(pocketPath,24,.0009,5,false),seam);
  pocket.name='HoodiePocket';detail.add(pocket);
  source.updateMatrixWorld(true);
  detail.position.copy(chest.worldToLocal(torso.localToWorld(new THREE.Vector3(0,1.49,0))));
  detail.quaternion.copy(chest.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(torso.getWorldQuaternion(new THREE.Quaternion())));
  detail.scale.setScalar(torso.getWorldScale(new THREE.Vector3()).x/chest.getWorldScale(new THREE.Vector3()).x);
  chest.add(detail);
}

/** Remove disconnected shirt buttons without deleting any of the weighted cloth surface. */
function removeShirtButtons(geometry: THREE.BufferGeometry): void {
  const positions=geometry.getAttribute('position'),indices=geometry.getIndex();
  if (!indices) return;
  const parent=Uint32Array.from({length:positions.count},(_,i)=>i);
  const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a:number,b:number)=>{parent[find(a)]=find(b);};
  const weld=new Map<string,number>();
  for(let i=0;i<positions.count;i++){
    const key=`${Math.round(positions.getX(i)*1e5)},${Math.round(positions.getY(i)*1e5)},${Math.round(positions.getZ(i)*1e5)}`;
    const previous=weld.get(key);if(previous===undefined)weld.set(key,i);else join(previous,i);
  }
  for(let i=0;i<indices.count;i+=3){join(indices.getX(i),indices.getX(i+1));join(indices.getX(i),indices.getX(i+2));}
  const bounds=new Map<number,THREE.Box3>();
  const point=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){const root=find(i);let box=bounds.get(root);if(!box){box=new THREE.Box3();bounds.set(root,box);}box.expandByPoint(point.fromBufferAttribute(positions,i));}
  const removed=new Set<number>();
  bounds.forEach((box,root)=>{if(box.min.y>1.02 && box.min.z>0 && box.min.x>-.04 && box.max.x<.04 && box.max.y-box.min.y<.04)removed.add(root);});
  if(!removed.size)return;
  const kept:number[]=[];
  for(let i=0;i<indices.count;i+=3){if(!removed.has(find(indices.getX(i))))kept.push(indices.getX(i),indices.getX(i+1),indices.getX(i+2));}
  geometry.setIndex(kept);
}
