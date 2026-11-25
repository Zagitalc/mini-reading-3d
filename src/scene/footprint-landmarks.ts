import * as T from 'three';
import {toLocal} from '../../shared/geo';
import {FORBURY_HILL, LANDMARK_FOOTPRINTS} from '../../shared/landmark-footprints';
import type {LngLat} from '../../shared/types';

type BuildingId = keyof typeof LANDMARK_FOOTPRINTS;
const BASE = .12;

export function createFootprintLandmarks() {
  const root = new T.Group();
  const materials = new Map<string, T.MeshLambertMaterial>();
  function material(color: string) {
    let mat = materials.get(color);
    if (!mat) {
      mat = new T.MeshLambertMaterial({color});
      materials.set(color, mat);
    }
    return mat;
  }

  function building(id: BuildingId, position: LngLat) {
    const {ring, source} = LANDMARK_FOOTPRINTS[id];
    const [x, y] = toLocal(position);
    const points = ring.slice(0, -1).map(p => {
      const [px, py] = toLocal(p);
      return new T.Vector2(px - x, py - y);
    });
    const group = new T.Group();
    group.position.set(x, y, BASE);
    group.userData = {landmark: id, source, approximateHeights: true};
    root.add(group);
    return {group, points};
  }

  function block(points: T.Vector2[], height: number, roof: T.Material, wall: T.Material, base = 0) {
    const geometry = new T.ExtrudeGeometry(new T.Shape(points), {depth: height, bevelEnabled: false});
    geometry.translate(0, 0, base);
    return new T.Mesh(geometry, [roof, wall]);
  }

  function edgeAngle(points: T.Vector2[], start: number, end: number) {
    const edge = points[end].clone().sub(points[start]);
    return Math.atan2(edge.y, edge.x);
  }

  function box(width: number, depth: number, height: number, x: number, y: number, base: number, color: string) {
    const mesh = new T.Mesh(new T.BoxGeometry(width, depth, height), material(color));
    mesh.position.set(x, y, base + height / 2);
    return mesh;
  }

  // The tower is at the south end, with a face following the Blagrave Street wall.
  const townHall = building('town-hall', [-.969884, 51.456653]);
  const brick = material('#846054');
  const slate = material('#524e50');
  townHall.group.add(block(townHall.points, 15, slate, brick));
  const clockTower = new T.Group();
  clockTower.rotation.z = edgeAngle(townHall.points, 2, 1);
  clockTower.add(
    box(7, 7, 28, 0, 0, 0, '#846054'),
    box(7.7, 7.7, 1.2, 0, 0, 26, '#c1a589')
  );
  const spire = new T.Mesh(new T.ConeGeometry(5.2, 11, 4), slate);
  spire.rotateX(Math.PI / 2);
  spire.rotateY(Math.PI / 4);
  spire.position.z = 33.5;
  clockTower.add(spire);
  for (const side of [-1, 1]) {
    const face = new T.Mesh(new T.CircleGeometry(1.2, 24), material('#eadabd'));
    face.rotation.x = -side * Math.PI / 2;
    face.position.set(0, side * 3.52, 23);
    clockTower.add(face);
  }
  townHall.group.add(clockTower);

  const library = building('university', [-.94496, 51.4400117]);
  const facade = document.createElement('canvas');
  facade.width = 64;
  facade.height = 64;
  const ctx = facade.getContext('2d')!;
  ctx.fillStyle = '#939d9b';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#556d74';
  ctx.fillRect(0, 8, 64, 39);
  ctx.fillStyle = '#bcc3bf';
  for (const x of [0, 16, 32, 48]) ctx.fillRect(x, 0, 2, 64);
  const texture = new T.CanvasTexture(facade);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(.12, .29);
  const libraryFacade = new T.MeshLambertMaterial({map: texture});
  library.group.add(block(library.points, 20.5, material('#909a98'), libraryFacade));

  const gateway = building('abbey-gateway', [-.966747, 51.456429]);
  const stone = material('#b9ac95');
  gateway.group.add(block(gateway.points, 8.2, material('#716c67'), stone, 5));
  // The central passage is open at ground level. Extrude its two pointed spandrels through the gate.
  const arch = new T.Shape();
  arch.moveTo(-8, 0);
  arch.lineTo(-2.1, 0);
  arch.lineTo(-2.1, 2.4);
  arch.quadraticCurveTo(-1.9, 3.8, 0, 4.7);
  arch.quadraticCurveTo(1.9, 3.8, 2.1, 2.4);
  arch.lineTo(2.1, 0);
  arch.lineTo(8, 0);
  arch.lineTo(8, 5);
  arch.lineTo(-8, 5);
  arch.closePath();
  const archGeometry = new T.ExtrudeGeometry(arch, {depth: 9.6, bevelEnabled: false, curveSegments: 5});
  // Rotate shape coordinates into east/north/up, with the arch lying along the longer façade.
  archGeometry.translate(0, 0, -4.8);
  archGeometry.rotateX(Math.PI / 2);
  const archMesh = new T.Mesh(archGeometry, stone);
  archMesh.rotation.z = edgeAngle(gateway.points, 1, 3);
  gateway.group.add(archMesh);

  const gaol = building('reading-gaol', [-.964002, 51.456424]);
  const prisonBrick = material('#8d5849');
  gaol.group.add(block(gaol.points, 10.8, slate, prisonBrick));
  const wings = new T.Group();
  wings.rotation.z = edgeAngle(gaol.points, 37, 38);
  // The central hub rises over the cross formed by the wings. Roof volumes follow their mapped axis.
  const hub = new T.Mesh(new T.CylinderGeometry(6.4, 6.4, 4, 8), prisonBrick);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 0, 12.8);
  const turret = new T.Mesh(new T.CylinderGeometry(2.1, 2.1, 3.6, 8), prisonBrick);
  turret.rotation.x = Math.PI / 2;
  turret.position.z = 16.6;
  wings.add(hub, turret);
  const profile = [new T.Vector2(-3, 0), new T.Vector2(3, 0), new T.Vector2(0, 3.3)];
  for (const [length, x, y, angle] of [
    [36, -22, 2, Math.PI / 2],
    [29, 22, 2, Math.PI / 2],
    [45, 0, 27, 0],
    [17, -4.6, -12, 0]
  ]) {
    const roof = block(profile, length, slate, slate);
    roof.geometry.translate(0, 0, -length / 2);
    roof.geometry.rotateX(Math.PI / 2);
    roof.rotation.z = angle;
    roof.position.set(x, y, 10.8);
    wings.add(roof);
  }
  gaol.group.add(wings);

  // The mound rises to a level gravel plateau, with an estimated profile fitted inside the garden.
  const mound = new T.LatheGeometry([
    new T.Vector2(1, 0), new T.Vector2(.93, 1.1), new T.Vector2(.78, 2.8),
    new T.Vector2(.62, 4.6), new T.Vector2(.48, 5.6), new T.Vector2(.40, 5.9)
  ], 28);
  mound.rotateX(Math.PI / 2);
  mound.scale(19, 16, 1);
  const hill = new T.Group();
  const [hillX, hillY] = toLocal(FORBURY_HILL.position);
  hill.position.set(hillX, hillY, BASE);
  hill.userData = {landmark: 'forbury-hill', source: FORBURY_HILL.source, approximateHeights: true};
  hill.add(new T.Mesh(mound, material('#677a54')));
  const plateau = new T.Mesh(new T.CircleGeometry(1, 28), material('#a6a08d'));
  plateau.scale.set(19 * .4, 16 * .4, 1);
  plateau.position.z = 5.9;
  hill.add(plateau);
  root.add(hill);

  return root;
}
