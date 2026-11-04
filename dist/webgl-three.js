import * as THREE from "./vendor/three/three.module.js";
import { buildKitchenCabinetLayout, buildKitchenComponentRects, inferFurnitureKind, kitchenComponentVerticalRange, resolveFurnitureVerticalRange } from "./model.js?v=108";
import { cabinetDoorPanelCount, cabinetThreePlacement, clampWebGLPan, closetThreePlacement, cycleThreeSelectionCandidate, electricalThreePlacement, featureVerticalRange, isCutawayEdge, openingPanelCount, openingVerticalRange, roomEdgeWallHeight, splitWallFace, threeItemBelongsToRoom, threeItemFootprint, threeRelatedSelectionStyle, threeRoomBounds, threeSelectionKey, threeSelectionStyle, threeSelectionXrayStyle, threeWallBelongsToRoom, wallFeatureThreePlacement, yawToQuarterTurn } from "./three.js?v=108";

const WALL_THICKNESS = 6;
const DEFAULT_WALL_HEIGHT = 220;

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
    child.material?.map?.dispose?.();
  });
}

function material(color, { opacity = 1, roughness = .82, metalness = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    opacity,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    roughness,
    metalness,
    side: THREE.DoubleSide,
  });
}

function addOutline(mesh, color = 0x6f766f, opacity = .65) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  lines.renderOrder = 4;
  mesh.add(lines);
}

function markSelectable(mesh, type, item) {
  mesh.userData.selection = { type, item };
  return mesh;
}

function markSelectionBlocker(mesh) {
  mesh.userData.blocksSelection = true;
  return mesh;
}

function segmentBox(from, to, bottomCm, topCm, thickness, meshMaterial) {
  const dx = to.x - from.x;
  const dz = to.y - from.y;
  const length = Math.hypot(dx, dz);
  const height = Math.max(.5, topCm - bottomCm);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), meshMaterial);
  mesh.position.set((from.x + to.x) / 2, bottomCm + height / 2, (from.y + to.y) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

function pointAt(from, to, distanceCm, lengthCm) {
  const ratio = lengthCm ? distanceCm / lengthCm : 0;
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}

function pointToSegmentDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

function openingCutOnEdge(opening, room, edgeIndex, wallHeight) {
  const roomIds = opening.roomIds ?? [opening.roomId];
  if (!roomIds.includes(room.id)) return null;
  const range = openingVerticalRange(opening);
  if (!range) return null;
  const from = room.points[edgeIndex];
  const to = room.points[(edgeIndex + 1) % room.points.length];
  const tolerance = 16;
  if (pointToSegmentDistance(opening.from, from, to) > tolerance || pointToSegmentDistance(opening.to, from, to) > tolerance) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const coordinate = (point) => ((point.x - from.x) * dx + (point.y - from.y) * dy) / length;
  const first = coordinate(opening.from);
  const second = coordinate(opening.to);
  return {
    opening,
    u1: Math.max(0, Math.min(first, second)),
    u2: Math.min(length, Math.max(first, second)),
    z1: Math.max(0, range.bottomCm),
    z2: Math.min(wallHeight, range.topCm),
  };
}

function roomFloor(room) {
  const shape = new THREE.Shape();
  room.points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    material(room.color ?? "#e9e4d8", { roughness: 1 }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = -.8;
  mesh.receiveShadow = true;
  return markSelectionBlocker(mesh);
}

function boxObject(item, vertical, color, type) {
  const { width, depth } = threeItemFootprint(item, type);
  if (![item.x, item.y, width, depth, vertical.bottomCm, vertical.topCm].every(Number.isFinite)) return null;
  const height = Math.max(1.5, vertical.topCm - vertical.bottomCm);
  const displayColor = vertical.schematic ? new THREE.Color(color).lerp(new THREE.Color(0xffffff), .28) : color;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(displayColor));
  mesh.position.set(item.x + width / 2, vertical.bottomCm + height / 2, item.y + depth / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, type === "furniture" ? 0x815c45 : 0x326b5e, .72);
  return markSelectable(mesh, type, item);
}

function furniturePart(group, width, height, depth, x, z, y, color, outline = 0x7c6758) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.8, width), Math.max(.8, height), Math.max(.8, depth)), material(color, { roughness: .68 }));
  mesh.position.set(x, z, y);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, outline, .58);
  group.add(mesh);
  return mesh;
}

function detailedFurnitureAssembly(item, vertical) {
  const { width: footprintWidth, depth: footprintDepth } = threeItemFootprint(item, "furniture");
  if (![item.x, item.y, footprintWidth, footprintDepth, vertical.bottomCm, vertical.topCm].every(Number.isFinite)) return null;
  const kind = inferFurnitureKind(item);
  if (kind === "custom") return boxObject(item, vertical, 0xc48d68, "furniture");
  const group = markSelectable(new THREE.Group(), "furniture", item);
  const quarterTurns = ((item.rotationQuarterTurns ?? 0) % 4 + 4) % 4;
  const width = quarterTurns % 2 ? footprintDepth : footprintWidth;
  const depth = quarterTurns % 2 ? footprintWidth : footprintDepth;
  const worldCenterX = item.x + footprintWidth / 2;
  const worldCenterY = item.y + footprintDepth / 2;
  const itemX = -width / 2;
  const itemY = -depth / 2;
  const bottom = vertical.bottomCm;
  const top = vertical.topCm;
  const height = top - bottom;
  const cx = 0;
  const cy = 0;
  group.position.set(worldCenterX, 0, worldCenterY);
  group.rotation.y = quarterTurns * Math.PI / 2;
  const wood = 0xb8815f;
  const fabric = 0xd4b29e;
  const light = 0xe8e6e1;
  const dark = 0x494b49;
  const metal = 0x8d9390;

  if (kind === "bed") {
    const frameHeight = Math.min(12, height * .28);
    furniturePart(group, width, frameHeight, depth, cx, bottom + frameHeight / 2, cy, wood);
    const mattressHeight = Math.max(10, height - frameHeight - 5);
    furniturePart(group, width - 5, mattressHeight, depth - 6, cx, bottom + frameHeight + mattressHeight / 2, cy + 2, 0xeadfd4, 0x9a8679);
    furniturePart(group, width, height, 5, cx, bottom + height / 2, itemY + 2.5, wood);
    const pillowWidth = Math.max(18, (width - 12) / 2);
    for (const direction of [-1, 1]) furniturePart(group, pillowWidth, 4, Math.min(32, depth * .18), cx + direction * width * .23, top + 1.5, itemY + depth * .2, 0xf6f1e9, 0xb5aaa0);
  } else if (kind === "sofa") {
    const seatTop = bottom + height * .48;
    furniturePart(group, width, height * .34, depth * .78, cx, bottom + height * .25, cy + depth * .08, fabric);
    furniturePart(group, width * .9, height * .16, depth * .64, cx, seatTop, cy + depth * .12, 0xe0c2af);
    furniturePart(group, width, height * .62, depth * .18, cx, bottom + height * .69, itemY + depth * .09, fabric);
    for (const direction of [-1, 1]) furniturePart(group, Math.max(8, width * .08), height * .52, depth * .72, cx + direction * width * .46, bottom + height * .44, cy + depth * .1, fabric);
  } else if (kind === "dining" || kind === "desk") {
    const topThickness = Math.min(5, height * .1);
    furniturePart(group, width, topThickness, depth, cx, top - topThickness / 2, cy, wood);
    const leg = Math.max(4, Math.min(7, Math.min(width, depth) * .08));
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) furniturePart(group, leg, height - topThickness, leg, cx + dx * (width / 2 - leg * 1.4), bottom + (height - topThickness) / 2, cy + dy * (depth / 2 - leg * 1.4), wood);
  } else if (kind === "chair") {
    const seatTop = bottom + Math.min(45, height * .58);
    const seatThickness = Math.max(4, height * .07);
    furniturePart(group, width, seatThickness, depth * .82, cx, seatTop, cy + depth * .06, fabric);
    const leg = Math.max(3, Math.min(5, Math.min(width, depth) * .1));
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) furniturePart(group, leg, seatTop - bottom, leg, cx + dx * (width / 2 - leg * 1.3), bottom + (seatTop - bottom) / 2, cy + dy * (depth * .38 - leg), wood);
    furniturePart(group, width, Math.max(10, top - seatTop), Math.max(4, depth * .1), cx, seatTop + (top - seatTop) / 2, itemY + depth * .07, fabric);
  } else if (kind === "tv-board") {
    furniturePart(group, width, height, depth, cx, bottom + height / 2, cy, wood);
    const frontY = itemY + depth + 1.1;
    for (let index = 0; index < 3; index += 1) {
      const panelWidth = width / 3;
      furniturePart(group, panelWidth - 1, height - 5, 2, itemX + panelWidth * (index + .5), bottom + height / 2, frontY, 0xc39470);
    }
  } else if (kind === "tv") {
    const screenHeight = height * .78;
    const screenDepth = Math.max(3, depth * .14);
    const screenCenter = bottom + height * .58;
    furniturePart(group, width * .96, screenHeight, screenDepth, cx, screenCenter, cy, 0x242827, 0x171a19);
    furniturePart(group, width * .88, screenHeight * .86, screenDepth + 1, cx, screenCenter, cy + screenDepth * .55, 0x101817, 0x343a38);
    furniturePart(group, Math.max(5, width * .055), height * .14, Math.max(5, depth * .25), cx, bottom + height * .13, cy, dark, 0x252726);
    furniturePart(group, width * .38, Math.max(2.5, height * .035), depth * .65, cx, bottom + Math.max(1.5, height * .018), cy, dark, 0x252726);
  } else if (kind === "shelf") {
    const panel = Math.max(2.5, Math.min(5, width * .045));
    furniturePart(group, panel, height, depth, itemX + panel / 2, bottom + height / 2, cy, wood);
    furniturePart(group, panel, height, depth, itemX + width - panel / 2, bottom + height / 2, cy, wood);
    furniturePart(group, width - panel * 2, height, Math.max(2, depth * .07), cx, bottom + height / 2, itemY + 1, 0xc9a98c);
    const shelfCount = 5;
    for (let index = 0; index <= shelfCount; index += 1) {
      const shelfZ = bottom + panel / 2 + (height - panel) * index / shelfCount;
      furniturePart(group, width - panel * 2, panel, depth, cx, shelfZ, cy, wood);
    }
  } else if (kind === "chest") {
    furniturePart(group, width, height, depth, cx, bottom + height / 2, cy, wood);
    const frontY = itemY + depth + 1.2;
    const drawerCount = 4;
    for (let index = 0; index < drawerCount; index += 1) {
      const drawerHeight = height / drawerCount;
      const drawerZ = bottom + drawerHeight * (index + .5);
      furniturePart(group, width - 4, drawerHeight - 2, 2.2, cx, drawerZ, frontY, 0xc39470);
      furniturePart(group, width * .16, 2.2, 3.2, cx, drawerZ, frontY + 2, metal, 0x626764);
    }
  } else if (kind === "fridge") {
    furniturePart(group, width, height, depth, cx, bottom + height / 2, cy, light, 0x717572);
    const frontY = itemY + depth + 1.2;
    furniturePart(group, width - 3, height * .66, 2.2, cx, bottom + height * .67, frontY, 0xf1f0ec, 0x747875);
    furniturePart(group, width - 3, height * .3, 2.2, cx, bottom + height * .16, frontY, 0xe5e4e0, 0x747875);
    furniturePart(group, 2.2, height * .42, 2.8, itemX + width * .78, bottom + height * .67, frontY + 2, metal, 0x626764);
  } else if (kind === "washer") {
    furniturePart(group, width, height, depth, cx, bottom + height / 2, cy, light, 0x717572);
    furniturePart(group, width * .68, 2, depth * .62, cx, top + 1.1, cy, 0xd8dcda, 0x747875);
    furniturePart(group, width * .82, height * .12, 2.2, cx, top - height * .1, itemY + depth + 1.2, metal, 0x626764);
  } else if (kind === "microwave") {
    furniturePart(group, width, height, depth, cx, bottom + height / 2, cy, light, 0x717572);
    const frontY = itemY + depth + 1.2;
    furniturePart(group, width * .68, height * .68, 2.2, itemX + width * .4, bottom + height * .52, frontY, dark, 0x252726);
    furniturePart(group, width * .17, height * .68, 2.2, itemX + width * .86, bottom + height * .52, frontY, metal, 0x626764);
  }
  group.userData.labelPosition = new THREE.Vector3(worldCenterX, top + 22, worldCenterY);
  return group;
}

function offsetPoint(point, vector, distance) {
  return { x: point.x + vector.x * distance, y: point.y + vector.y * distance };
}

function horizontalPanel(from, to, normal, depth, centerHeight, thickness, color) {
  const width = Math.hypot(to.x - from.x, to.y - from.y);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), material(color, { roughness: .72 }));
  mesh.position.set(
    (from.x + to.x) / 2 - normal.x * depth / 2,
    centerHeight,
    (from.y + to.y) / 2 - normal.y * depth / 2,
  );
  mesh.rotation.y = -Math.atan2(to.y - from.y, to.x - from.x);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function orientedBox(width, height, depth, center, centerHeight, tangent, meshMaterial) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), meshMaterial);
  mesh.position.set(center.x, centerHeight, center.y);
  mesh.rotation.y = -Math.atan2(tangent.y, tangent.x);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function closetAssembly(documentData, item, vertical) {
  const placement = closetThreePlacement(documentData, item);
  if (!placement || !Number.isFinite(vertical?.topCm)) return null;
  const group = markSelectable(new THREE.Group(), "feature", item);
  const bottom = vertical.bottomCm ?? 0;
  const top = vertical.topCm;
  const depth = Math.max(12, placement.depthCm ?? 60);
  const frontOffset = WALL_THICKNESS / 2 + 2;
  const frontFrom = offsetPoint(placement.from, placement.normal, frontOffset);
  const frontTo = offsetPoint(placement.to, placement.normal, frontOffset);
  const backFrom = offsetPoint(frontFrom, placement.normal, -depth);
  const backTo = offsetPoint(frontTo, placement.normal, -depth);
  const innerMaterial = () => material(0xe8e3d9, { roughness: .9 });
  const woodMaterial = () => material(0x77553d, { roughness: .68 });

  const back = segmentBox(backFrom, backTo, bottom, top, 3, innerMaterial());
  const leftSide = segmentBox(frontFrom, backFrom, bottom, top, 3.5, innerMaterial());
  const rightSide = segmentBox(frontTo, backTo, bottom, top, 3.5, innerMaterial());
  for (const panel of [back, leftSide, rightSide]) {
    panel.receiveShadow = true;
    addOutline(panel, 0x8a8175, .45);
    group.add(panel);
  }

  const shelfThickness = Math.max(2, item.shelfThicknessCm ?? 4);
  if (Number.isFinite(item.shelfUndersideHeightCm)) {
    const shelfCenter = item.shelfUndersideHeightCm + shelfThickness / 2;
    const shelf = horizontalPanel(frontFrom, frontTo, placement.normal, depth, shelfCenter, shelfThickness, 0x8a6247);
    addOutline(shelf, 0x654631, .65);
    group.add(shelf);
    const railHeight = Math.max(bottom + 20, item.shelfUndersideHeightCm - 7);
    const railFrom = offsetPoint(frontFrom, placement.normal, -depth * .58);
    const railTo = offsetPoint(frontTo, placement.normal, -depth * .58);
    group.add(segmentBox(railFrom, railTo, railHeight - 1, railHeight + 1, 2.2, material(0x9b958b, { roughness: .3, metalness: .65 })));
  }

  const frameWidth = 4;
  const frameLeftTo = pointAt(frontFrom, frontTo, frameWidth, placement.widthCm);
  const frameRightFrom = pointAt(frontFrom, frontTo, placement.widthCm - frameWidth, placement.widthCm);
  const framePieces = [
    segmentBox(frontFrom, frameLeftTo, bottom, top, 3.6, woodMaterial()),
    segmentBox(frameRightFrom, frontTo, bottom, top, 3.6, woodMaterial()),
    segmentBox(frontFrom, frontTo, top - 5, top, 3.6, woodMaterial()),
  ];
  framePieces.forEach((piece) => { addOutline(piece, 0x4f3829, .72); group.add(piece); });

  const panelCount = placement.panelCount || 2;
  const panelWidth = placement.widthCm / panelCount;
  const doorBottom = bottom + 2;
  const doorTop = top - 5;
  for (let index = 0; index < panelCount; index += 1) {
    const gap = .65;
    const from = pointAt(frontFrom, frontTo, panelWidth * index + gap, placement.widthCm);
    const to = pointAt(frontFrom, frontTo, panelWidth * (index + 1) - gap, placement.widthCm);
    const door = segmentBox(from, to, doorBottom, doorTop, 2.8, woodMaterial());
    door.castShadow = true;
    addOutline(door, 0x4b3527, .9);
    group.add(door);
  }

  const handleHeight = Math.min(top * .48, 108);
  for (const direction of [-1, 1]) {
    const center = placement.widthCm / 2 + direction * 8;
    const from = pointAt(frontFrom, frontTo, center - 5, placement.widthCm);
    const to = pointAt(frontFrom, frontTo, center + 5, placement.widthCm);
    const handleFrom = offsetPoint(from, placement.normal, 3.4);
    const handleTo = offsetPoint(to, placement.normal, 3.4);
    group.add(segmentBox(handleFrom, handleTo, handleHeight - 1.2, handleHeight + 1.2, 2.4, material(0xa8a39a, { roughness: .28, metalness: .7 })));
  }

  group.userData.labelPosition = new THREE.Vector3(
    (frontFrom.x + frontTo.x) / 2 + placement.normal.x * 16,
    top + 22,
    (frontFrom.y + frontTo.y) / 2 + placement.normal.y * 16,
  );
  return group;
}

function cabinetAssembly(documentData, item, vertical) {
  const placement = cabinetThreePlacement(item) ?? wallFeatureThreePlacement(documentData, item);
  if (!placement || !Number.isFinite(vertical?.topCm)) return null;
  const group = markSelectable(new THREE.Group(), "feature", item);
  const bottom = vertical.bottomCm ?? 0;
  const top = vertical.topCm;
  const depth = Math.max(12, placement.depthCm ?? 45);
  const midpoint = { x: (placement.from.x + placement.to.x) / 2, y: (placement.from.y + placement.to.y) / 2 };
  const center = offsetPoint(midpoint, placement.normal, depth / 2);
  const body = orientedBox(placement.widthCm, top - bottom, depth, center, (top + bottom) / 2, placement.tangent, material(0xe8e7e2, { roughness: .62 }));
  addOutline(body, 0x777975, .62);
  group.add(body);

  const topSlab = orientedBox(placement.widthCm + 1.5, 2.5, depth + 1, center, top + 1.25, placement.tangent, material(0xf5f3ed, { roughness: .42 }));
  addOutline(topSlab, 0x858681, .52);
  group.add(topSlab);

  const doorPlaneFrom = offsetPoint(placement.from, placement.normal, depth + 1.5);
  const doorPlaneTo = offsetPoint(placement.to, placement.normal, depth + 1.5);
  const panelCount = cabinetDoorPanelCount(item);
  const panelWidth = placement.widthCm / panelCount;
  for (let index = 0; index < panelCount; index += 1) {
    const from = pointAt(doorPlaneFrom, doorPlaneTo, panelWidth * index + .5, placement.widthCm);
    const to = pointAt(doorPlaneFrom, doorPlaneTo, panelWidth * (index + 1) - .5, placement.widthCm);
    const door = segmentBox(from, to, bottom + 2, top - 2, 2.2, material(0xf1f0eb, { roughness: .58 }));
    addOutline(door, 0x7e807c, .66);
    group.add(door);
  }
  const handleHeight = Math.max(20, top - bottom - 10);
  for (const direction of [-1, 1]) {
    const handlePoint = pointAt(doorPlaneFrom, doorPlaneTo, placement.widthCm / 2 + direction * 1.45, placement.widthCm);
    const handleCenter = offsetPoint(handlePoint, placement.normal, 2.7);
    const handle = orientedBox(1.8, handleHeight, 2.4, handleCenter, (top + bottom) / 2, placement.tangent, material(0x555a59, { roughness: .28, metalness: .7 }));
    group.add(handle);
  }
  return group;
}

function kitchenAssembly(item, vertical) {
  const layout = buildKitchenCabinetLayout(item);
  if (!layout || ![item.x, item.y, item.width, item.height].every(Number.isFinite)) return boxObject(item, vertical, 0x5fa38f, "feature");
  const group = markSelectable(new THREE.Group(), "feature", item);
  const worktop = item.worktopHeightCm;
  const depth = item.height;
  const frontY = item.y + depth + 1.2;
  const cabinetMaterial = () => material(0xf0efeb, { roughness: .58 });
  const metalMaterial = () => material(0x919591, { roughness: .28, metalness: .68 });

  const carcass = new THREE.Mesh(new THREE.BoxGeometry(item.width, worktop - 5, depth), cabinetMaterial());
  carcass.position.set(item.x + item.width / 2, (worktop - 5) / 2, item.y + depth / 2);
  addOutline(carcass, 0x777b76, .52);
  group.add(carcass);

  const worktopMesh = new THREE.Mesh(new THREE.BoxGeometry(item.width + 2, 3, depth + 2), material(0xf7f5ef, { roughness: .38 }));
  worktopMesh.position.set(item.x + item.width / 2, worktop + 1.5, item.y + depth / 2);
  addOutline(worktopMesh, 0x7e817c, .48);
  group.add(worktopMesh);

  for (const section of layout.lowerSections) {
    const width = section.toCm - section.fromCm;
    const centerX = item.x + (section.fromCm + section.toCm) / 2;
    const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2, width - 1), 51, 2.2), cabinetMaterial());
    lowerPanel.position.set(centerX, 32.5, frontY);
    addOutline(lowerPanel, 0x858783, .55);
    group.add(lowerPanel);

    const upperPanel = new THREE.Mesh(new THREE.BoxGeometry(Math.max(2, width - 1), 18, 2.2), section.kind === "stove"
      ? material(0x636663, { roughness: .42, metalness: .42 }) : cabinetMaterial());
    upperPanel.position.set(centerX, 69, frontY);
    addOutline(upperPanel, 0x777b77, .6);
    group.add(upperPanel);

    const handleWidth = Math.max(8, Math.min(width * .46, 28));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(handleWidth, 1.8, 2.4), metalMaterial());
    handle.position.set(centerX, 60.5, frontY + 2.3);
    group.add(handle);
    if (section.kind !== "stove") {
      const upperHandle = new THREE.Mesh(new THREE.BoxGeometry(handleWidth, 1.8, 2.4), metalMaterial());
      upperHandle.position.set(centerX, 77, frontY + 2.3);
      group.add(upperHandle);
    }
  }

  const overheadHeight = 55;
  const overheadDepth = Math.min(36, depth * .66);
  const overheadWidth = layout.overhead.toCm - layout.overhead.fromCm;
  const overheadCenterX = item.x + (layout.overhead.fromCm + layout.overhead.toCm) / 2;
  const overheadCenterY = item.y + overheadDepth / 2;
  const overheadBody = new THREE.Mesh(new THREE.BoxGeometry(overheadWidth, overheadHeight, overheadDepth), cabinetMaterial());
  overheadBody.position.set(overheadCenterX, layout.overhead.bottomCm + overheadHeight / 2, overheadCenterY);
  addOutline(overheadBody, 0x7e817c, .5);
  group.add(overheadBody);
  const overheadPanelWidth = overheadWidth / layout.overhead.panelCount;
  for (let index = 0; index < layout.overhead.panelCount; index += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(overheadPanelWidth - 1, overheadHeight - 2, 2.2), cabinetMaterial());
    panel.position.set(item.x + layout.overhead.fromCm + overheadPanelWidth * (index + .5), layout.overhead.bottomCm + overheadHeight / 2, item.y + overheadDepth + 1.2);
    addOutline(panel, 0x858783, .52);
    group.add(panel);
  }
  const cabinetRail = new THREE.Mesh(new THREE.BoxGeometry(overheadWidth * .5, 2.5, 2.8), metalMaterial());
  cabinetRail.position.set(overheadCenterX, layout.overhead.bottomCm - 3, item.y + overheadDepth + 1.7);
  group.add(cabinetRail);

  const hoodWidth = layout.hood.toCm - layout.hood.fromCm;
  const hoodCenterX = item.x + (layout.hood.fromCm + layout.hood.toCm) / 2;
  const hoodDepth = Math.min(46, depth * .8);
  const hoodTop = Math.max(layout.hood.bottomCm + 50, layout.overhead.bottomCm + overheadHeight);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(hoodWidth, hoodTop - layout.hood.bottomCm - 9, 31), cabinetMaterial());
  chimney.position.set(hoodCenterX, layout.hood.bottomCm + 9 + (hoodTop - layout.hood.bottomCm - 9) / 2, item.y + 15.5);
  addOutline(chimney, 0x7b7e79, .52);
  group.add(chimney);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(hoodWidth + 2, 10, hoodDepth), material(0xdededa, { roughness: .38, metalness: .18 }));
  canopy.position.set(hoodCenterX, layout.hood.bottomCm + 5, item.y + hoodDepth / 2);
  addOutline(canopy, 0x555855, .65);
  group.add(canopy);
  const hoodUnderside = new THREE.Mesh(new THREE.BoxGeometry(hoodWidth * .88, 1.5, hoodDepth * .72), material(0x2d302f, { roughness: .48, metalness: .38 }));
  hoodUnderside.position.set(hoodCenterX, layout.hood.bottomCm - .4, item.y + hoodDepth * .58);
  group.add(hoodUnderside);

  const sink = buildKitchenComponentRects(item).find((component) => component.kind === "sink");
  if (sink) {
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 17, 14), metalMaterial());
    faucet.position.set(sink.x + sink.width * .56, worktop + 10, item.y + 8);
    group.add(faucet);
    const spoutFrom = { x: sink.x + sink.width * .56, y: item.y + 8 };
    const spoutTo = { x: spoutFrom.x, y: item.y + 22 };
    group.add(segmentBox(spoutFrom, spoutTo, worktop + 17, worktop + 19, 2.4, metalMaterial()));
  }

  group.userData.labelPosition = new THREE.Vector3(item.x + item.width / 2, hoodTop + 18, item.y + depth / 2);
  return group;
}

function washbasinAssembly(documentData, item, vertical) {
  const placement = wallFeatureThreePlacement(documentData, item);
  if (!placement) return null;
  const group = markSelectable(new THREE.Group(), "feature", item);
  const top = vertical.schematic ? 82 : vertical.topCm;
  const depth = Math.max(25, placement.depthCm ?? 50);
  const midpoint = { x: (placement.from.x + placement.to.x) / 2, y: (placement.from.y + placement.to.y) / 2 };
  const center = offsetPoint(midpoint, placement.normal, depth / 2);
  const cabinet = orientedBox(placement.widthCm * .94, top - 8, depth * .88, center, 8 + (top - 8) / 2, placement.tangent, material(0xe7e5df, { roughness: .74 }));
  addOutline(cabinet, 0x88877f, .64);
  group.add(cabinet);

  const counter = orientedBox(placement.widthCm, 3.5, depth, center, top, placement.tangent, material(0xf3f0e9, { roughness: .45 }));
  addOutline(counter, 0x85847d, .55);
  group.add(counter);

  const frontFrom = offsetPoint(placement.from, placement.normal, depth + 1.3);
  const frontTo = offsetPoint(placement.to, placement.normal, depth + 1.3);
  const half = placement.widthCm / 2;
  for (let index = 0; index < 2; index += 1) {
    const from = pointAt(frontFrom, frontTo, index * half + .6, placement.widthCm);
    const to = pointAt(frontFrom, frontTo, (index + 1) * half - .6, placement.widthCm);
    const door = segmentBox(from, to, 10, top - 5, 2, material(0xf0eee8, { roughness: .7 }));
    addOutline(door, 0x949189, .58);
    group.add(door);
  }

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.8, 28), material(0x9cc9d0, { roughness: .38, metalness: .12 }));
  bowl.scale.set(placement.widthCm * .27, 1, depth * .22);
  bowl.rotation.y = -Math.atan2(placement.tangent.y, placement.tangent.x);
  const bowlCenter = offsetPoint(midpoint, placement.normal, depth * .58);
  bowl.position.set(bowlCenter.x, top + 2.4, bowlCenter.y);
  addOutline(bowl, 0x55828a, .72);
  group.add(bowl);

  const faucetBase = offsetPoint(midpoint, placement.normal, depth * .22);
  const faucet = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 18, 14), material(0xaaa9a5, { roughness: .24, metalness: .72 }));
  faucet.position.set(faucetBase.x, top + 10, faucetBase.y);
  group.add(faucet);
  const spoutTo = offsetPoint(faucetBase, placement.normal, depth * .22);
  group.add(segmentBox(faucetBase, spoutTo, top + 17, top + 19, 2.4, material(0xaaa9a5, { roughness: .24, metalness: .72 })));

  const mirrorFrom = pointAt(placement.from, placement.to, placement.widthCm * .08, placement.widthCm);
  const mirrorTo = pointAt(placement.from, placement.to, placement.widthCm * .92, placement.widthCm);
  const mirror = segmentBox(offsetPoint(mirrorFrom, placement.normal, 3.2), offsetPoint(mirrorTo, placement.normal, 3.2), top + 15, top + 92, 1.8, material(0xa9c8ca, { roughness: .18, metalness: .26 }));
  addOutline(mirror, 0x6c8586, .76);
  group.add(mirror);
  return group;
}

function washerPanAssembly(item) {
  if (![item.x, item.y, item.width, item.height].every(Number.isFinite)) return null;
  const group = markSelectable(new THREE.Group(), "feature", item);
  const width = item.width;
  const depth = item.height;
  const usableWidth = Math.min(width - 2, item.usableWidthCm ?? width - 5);
  const usableDepth = Math.min(depth - 2, item.usableDepthCm ?? depth - 5);
  const rimX = Math.max(1.5, (width - usableWidth) / 2);
  const rimZ = Math.max(1.5, (depth - usableDepth) / 2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(usableWidth, 1.2, usableDepth), material(0xe9ece8, { roughness: .52 }));
  floor.position.set(item.x + width / 2, .6, item.y + depth / 2);
  addOutline(floor, 0x89928d, .55);
  group.add(floor);
  const rimMaterial = () => material(0xf6f5f0, { roughness: .46 });
  const rails = [
    new THREE.Mesh(new THREE.BoxGeometry(width, 4, rimZ), rimMaterial()),
    new THREE.Mesh(new THREE.BoxGeometry(width, 4, rimZ), rimMaterial()),
    new THREE.Mesh(new THREE.BoxGeometry(rimX, 4, usableDepth), rimMaterial()),
    new THREE.Mesh(new THREE.BoxGeometry(rimX, 4, usableDepth), rimMaterial()),
  ];
  rails[0].position.set(item.x + width / 2, 2, item.y + rimZ / 2);
  rails[1].position.set(item.x + width / 2, 2, item.y + depth - rimZ / 2);
  rails[2].position.set(item.x + rimX / 2, 2, item.y + depth / 2);
  rails[3].position.set(item.x + width - rimX / 2, 2, item.y + depth / 2);
  rails.forEach((rail) => { addOutline(rail, 0x8d918d, .58); group.add(rail); });
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, .9, 22), material(0x8d9693, { roughness: .3, metalness: .48 }));
  drain.position.set(item.x + width * .27, 1.5, item.y + depth * .72);
  group.add(drain);
  return group;
}

function bathtubAssembly(item, vertical) {
  if (![item.x, item.y, item.width, item.height].every(Number.isFinite)) return null;
  const group = markSelectable(new THREE.Group(), "feature", item);
  const width = item.width;
  const depth = item.height;
  const rimHeight = Math.max(35, vertical?.topCm ?? 55);
  const rim = Math.max(5, Math.min(9, Math.min(width, depth) * .1));
  const ceramic = () => material(0xf1f3ef, { roughness: .38 });
  const outline = 0x778681;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 5, depth), ceramic());
  floor.position.set(item.x + width / 2, 2.5, item.y + depth / 2);
  floor.receiveShadow = true;
  addOutline(floor, outline, .45);
  group.add(floor);

  const sidePanels = [
    new THREE.Mesh(new THREE.BoxGeometry(width, rimHeight - 5, rim), ceramic()),
    new THREE.Mesh(new THREE.BoxGeometry(width, rimHeight - 5, rim), ceramic()),
    new THREE.Mesh(new THREE.BoxGeometry(rim, rimHeight - 5, Math.max(4, depth - rim * 2)), ceramic()),
    new THREE.Mesh(new THREE.BoxGeometry(rim, rimHeight - 5, Math.max(4, depth - rim * 2)), ceramic()),
  ];
  sidePanels[0].position.set(item.x + width / 2, (rimHeight + 5) / 2, item.y + rim / 2);
  sidePanels[1].position.set(item.x + width / 2, (rimHeight + 5) / 2, item.y + depth - rim / 2);
  sidePanels[2].position.set(item.x + rim / 2, (rimHeight + 5) / 2, item.y + depth / 2);
  sidePanels[3].position.set(item.x + width - rim / 2, (rimHeight + 5) / 2, item.y + depth / 2);
  sidePanels.forEach((panel) => { panel.castShadow = true; panel.receiveShadow = true; addOutline(panel, outline, .45); group.add(panel); });

  const water = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(7, width - rim * 2.6), 1.2, Math.max(7, depth - rim * 2.6)),
    material(0x72bfd1, { opacity: .78, roughness: .2 }),
  );
  water.position.set(item.x + width / 2, rimHeight - 8, item.y + depth / 2);
  group.add(water);

  const rails = [
    new THREE.Mesh(new THREE.BoxGeometry(width, 5, rim), ceramic()),
    new THREE.Mesh(new THREE.BoxGeometry(width, 5, rim), ceramic()),
    new THREE.Mesh(new THREE.BoxGeometry(rim, 5, Math.max(4, depth - rim * 2)), ceramic()),
    new THREE.Mesh(new THREE.BoxGeometry(rim, 5, Math.max(4, depth - rim * 2)), ceramic()),
  ];
  rails[0].position.set(item.x + width / 2, rimHeight, item.y + rim / 2);
  rails[1].position.set(item.x + width / 2, rimHeight, item.y + depth - rim / 2);
  rails[2].position.set(item.x + rim / 2, rimHeight, item.y + depth / 2);
  rails[3].position.set(item.x + width - rim / 2, rimHeight, item.y + depth / 2);
  rails.forEach((rail) => { rail.castShadow = true; addOutline(rail, outline, .62); group.add(rail); });

  const metalMaterial = () => material(0xa9afad, { roughness: .22, metalness: .72 });
  const faucetSide = item.faucetSide ?? "top";
  let faucetX = item.x + width / 2;
  let faucetY = item.y + rim * .72;
  let spoutX = faucetX;
  let spoutY = item.y + rim * 2.2;
  if (faucetSide === "bottom") { faucetY = item.y + depth - rim * .72; spoutY = item.y + depth - rim * 2.2; }
  if (faucetSide === "left") { faucetX = item.x + rim * .72; faucetY = item.y + depth / 2; spoutX = item.x + rim * 2.2; spoutY = faucetY; }
  if (faucetSide === "right") { faucetX = item.x + width - rim * .72; faucetY = item.y + depth / 2; spoutX = item.x + width - rim * 2.2; spoutY = faucetY; }
  const faucet = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 13, 14), metalMaterial());
  faucet.position.set(faucetX, rimHeight + 7.5, faucetY);
  group.add(faucet);
  group.add(segmentBox({ x: faucetX, y: faucetY }, { x: spoutX, y: spoutY }, rimHeight + 12, rimHeight + 14.5, 2.7, metalMaterial()));

  group.userData.labelPosition = new THREE.Vector3(item.x + width / 2, rimHeight + 25, item.y + depth / 2);
  return group;
}

function toiletAssembly(item, vertical) {
  if (![item.x, item.y, item.width, item.height].every(Number.isFinite)) return null;
  const group = markSelectable(new THREE.Group(), "feature", item);
  const facing = item.facing ?? "right";
  const horizontal = facing === "right" || facing === "left";
  const length = horizontal ? item.width : item.height;
  const breadth = horizontal ? item.height : item.width;
  const tankHeight = Math.max(60, vertical?.topCm ?? 75);
  const bowlHeight = Math.min(43, tankHeight * .58);
  const ceramic = () => material(0xf4f3ee, { roughness: .34 });
  const local = new THREE.Group();
  const tankLength = Math.max(16, Math.min(23, length * .28));
  const tank = new THREE.Mesh(new THREE.BoxGeometry(tankLength, tankHeight, breadth * .9), ceramic());
  tank.position.set(-length / 2 + tankLength / 2, tankHeight / 2, 0);
  tank.castShadow = true;
  addOutline(tank, 0x7c827f, .58);
  local.add(tank);

  const baseLength = Math.max(24, length - tankLength * .72);
  const pedestal = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), ceramic());
  pedestal.scale.set(baseLength * .42, bowlHeight * .56, breadth * .35);
  pedestal.position.set(-length / 2 + tankLength + baseLength * .42, bowlHeight * .46, 0);
  pedestal.castShadow = true;
  addOutline(pedestal, 0x7c827f, .55);
  local.add(pedestal);

  const seatLength = Math.max(28, length - tankLength - 5);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(1, .16, 12, 34), material(0xf8f7f2, { roughness: .3 }));
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(seatLength * .42, breadth * .38, 1.8);
  seat.position.set(-length / 2 + tankLength + seatLength * .48, bowlHeight + 2.5, 0);
  local.add(seat);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.2, 28), material(0x83bdca, { roughness: .22 }));
  water.scale.set(seatLength * .25, 1, breadth * .22);
  water.position.set(seat.position.x + seatLength * .04, bowlHeight + 1.8, 0);
  local.add(water);

  local.position.set(item.x + item.width / 2, 0, item.y + item.height / 2);
  if (facing === "left") local.rotation.y = Math.PI;
  else if (facing === "up") local.rotation.y = Math.PI / 2;
  else if (facing === "down") local.rotation.y = -Math.PI / 2;
  group.add(local);
  group.userData.labelPosition = new THREE.Vector3(item.x + item.width / 2, tankHeight + 22, item.y + item.height / 2);
  return group;
}

function featureAssembly(documentData, item, vertical) {
  if (item.kind === "closet") return closetAssembly(documentData, item, vertical);
  if (item.kind === "washer-pan") return washerPanAssembly(item);
  if (item.kind === "washbasin") return washbasinAssembly(documentData, item, vertical);
  if (item.kind === "bathtub") return bathtubAssembly(item, vertical);
  if (item.kind === "toilet") return toiletAssembly(item, vertical);
  if (item.kind === "cabinet") return cabinetAssembly(documentData, item, vertical);
  if (item.kind === "kitchen") return kitchenAssembly(item, vertical);
  return boxObject(item, vertical, 0x5fa38f, "feature");
}

function textSprite(text, position) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  context.font = `700 ${14 * ratio}px system-ui, sans-serif`;
  const width = Math.ceil(context.measureText(text).width + 18 * ratio);
  canvas.width = width;
  canvas.height = 30 * ratio;
  context.scale(ratio, ratio);
  context.fillStyle = "rgba(255,255,255,.88)";
  context.beginPath();
  context.roundRect(0, 0, width / ratio, 24, 6);
  context.fill();
  context.fillStyle = "#41514b";
  context.font = "700 14px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / ratio / 2, 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.position.copy(position);
  sprite.scale.set(width / ratio * 1.25, 37.5, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function openingAssembly(opening, range) {
  const length = Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y);
  if (length < 8) return null;
  const group = markSelectable(new THREE.Group(), "opening", opening);
  const frameWidth = Math.min(4, length / 8);
  const innerFrom = pointAt(opening.from, opening.to, frameWidth, length);
  const innerTo = pointAt(opening.from, opening.to, length - frameWidth, length);
  const panelBottom = range.bottomCm + (range.isWindow ? frameWidth : 1);
  const panelTop = Math.max(panelBottom + 1, range.topCm - frameWidth);
  const frameColor = range.isWindow ? 0x326f83 : 0x8a6042;
  const panelColor = range.isWindow ? 0x72bdd5 : 0xf5efe5;
  const frame = (from, to, bottom, top) => {
    const mesh = segmentBox(from, to, bottom, top, 4, material(frameColor, { roughness: .55 }));
    addOutline(mesh, range.isWindow ? 0x235d70 : 0x6d482f, .9);
    group.add(mesh);
  };

  frame(opening.from, innerFrom, range.bottomCm, range.topCm);
  frame(innerTo, opening.to, range.bottomCm, range.topCm);
  frame(opening.from, opening.to, range.topCm - frameWidth, range.topCm);
  if (range.isWindow) frame(opening.from, opening.to, range.bottomCm, range.bottomCm + frameWidth);

  const pane = segmentBox(
    innerFrom,
    innerTo,
    panelBottom,
    panelTop,
    1.8,
    material(panelColor, { opacity: range.isWindow ? .46 : 1, roughness: .38 }),
  );
  pane.renderOrder = range.isWindow ? 3 : 1;
  addOutline(pane, range.isWindow ? 0x2b718a : 0x8a6042, .82);
  group.add(pane);

  const panels = openingPanelCount(opening, range.isWindow);
  for (let index = 1; index < panels; index += 1) {
    const center = length * index / panels;
    const from = pointAt(opening.from, opening.to, center - 1.25, length);
    const to = pointAt(opening.from, opening.to, center + 1.25, length);
    frame(from, to, panelBottom, panelTop);
  }
  if (range.isWindow) {
    const railHeight = panelBottom + (panelTop - panelBottom) * .52;
    frame(innerFrom, innerTo, railHeight - 1.25, railHeight + 1.25);
  }
  return group;
}

function electricalAssembly(documentData, electrical, electricalType) {
  const placement = electricalThreePlacement(documentData, electrical, electricalType);
  if (!placement) return null;
  const offset = WALL_THICKNESS / 2 + 1.4;
  const center = {
    x: placement.anchor.x + placement.normal.x * offset,
    y: placement.anchor.y + placement.normal.y * offset,
  };
  const halfWidth = placement.widthCm / 2;
  const from = {
    x: center.x - placement.tangent.x * halfWidth,
    y: center.y - placement.tangent.y * halfWidth,
  };
  const to = {
    x: center.x + placement.tangent.x * halfWidth,
    y: center.y + placement.tangent.y * halfWidth,
  };
  const bottom = placement.centerHeightCm - placement.heightCm / 2;
  const top = placement.centerHeightCm + placement.heightCm / 2;
  const group = markSelectable(new THREE.Group(), electricalType, electrical);
  const plateColor = electricalType === "outlet" ? 0xf5f1e8 : 0xdce9e3;
  const plate = segmentBox(from, to, bottom, top, 2.2, material(plateColor, { roughness: .48 }));
  addOutline(plate, electricalType === "outlet" ? 0x6c665c : 0x3f7466, .9);
  group.add(plate);

  const glyphOffset = offset + 1.7;
  const glyphCenter = {
    x: placement.anchor.x + placement.normal.x * glyphOffset,
    y: placement.anchor.y + placement.normal.y * glyphOffset,
  };
  const glyph = (alongCm, glyphWidth, glyphBottom, glyphTop, color) => {
    const glyphFrom = {
      x: glyphCenter.x + placement.tangent.x * (alongCm - glyphWidth / 2),
      y: glyphCenter.y + placement.tangent.y * (alongCm - glyphWidth / 2),
    };
    const glyphTo = {
      x: glyphCenter.x + placement.tangent.x * (alongCm + glyphWidth / 2),
      y: glyphCenter.y + placement.tangent.y * (alongCm + glyphWidth / 2),
    };
    group.add(segmentBox(glyphFrom, glyphTo, glyphBottom, glyphTop, .8, material(color, { roughness: .5 })));
  };
  if (electricalType === "outlet") {
    glyph(-2, 1, placement.centerHeightCm - 2.4, placement.centerHeightCm + 2.4, 0x4f4d49);
    glyph(2, 1, placement.centerHeightCm - 2.4, placement.centerHeightCm + 2.4, 0x4f4d49);
  } else {
    glyph(0, Math.max(3, placement.widthCm - 3), placement.centerHeightCm - 3.2, placement.centerHeightCm + 3.2, 0x5a8f7f);
  }
  const hitWidth = Math.max(22, placement.widthCm);
  const hitHeight = Math.max(26, placement.heightCm);
  const hitCenter = {
    x: placement.anchor.x + placement.normal.x * (offset + 2),
    y: placement.anchor.y + placement.normal.y * (offset + 2),
  };
  const hitFrom = {
    x: hitCenter.x - placement.tangent.x * hitWidth / 2,
    y: hitCenter.y - placement.tangent.y * hitWidth / 2,
  };
  const hitTo = {
    x: hitCenter.x + placement.tangent.x * hitWidth / 2,
    y: hitCenter.y + placement.tangent.y * hitWidth / 2,
  };
  const hitTarget = segmentBox(
    hitFrom,
    hitTo,
    placement.centerHeightCm - hitHeight / 2,
    placement.centerHeightCm + hitHeight / 2,
    9,
    material(0xffffff, { opacity: 0 }),
  );
  hitTarget.userData.selectionHitTarget = true;
  group.add(hitTarget);
  return { group, placement };
}

function layerEnabled(layer, options) { return options[layer] !== false; }

function buildScene(root, documentData, options) {
  const { plan } = documentData;
  const selectedRoom = options.roomId ? (plan.rooms ?? []).find((room) => room.id === options.roomId) : null;
  const rooms = selectedRoom ? [selectedRoom] : (plan.rooms ?? []);
  const bounds = selectedRoom ? threeRoomBounds(rooms, plan.bounds) : plan.bounds;
  const openings = (plan.openings ?? [])
    .filter((opening) => threeItemBelongsToRoom(opening, selectedRoom?.id))
    .map((opening) => ({ opening, range: openingVerticalRange(opening) }))
    .filter((entry) => entry.range);
  const features = (plan.features ?? [])
    .filter((item) => item.kind !== "column" && threeItemBelongsToRoom(item, selectedRoom?.id));
  const furniture = (plan.furniture ?? []).filter((item) => threeItemBelongsToRoom(item, selectedRoom?.id));
  const electrical = [
    ...(plan.electrical?.outlets ?? []).map((item) => ({ item, type: "outlet" })),
    ...(plan.electrical?.switches ?? []).map((item) => ({ item, type: "switch" })),
  ].filter(({ item }) => threeItemBelongsToRoom(item, selectedRoom?.id));
  const partitionWalls = (plan.walls ?? []).filter((wall) => threeWallBelongsToRoom(wall, selectedRoom));
  const wallHeight = Math.max(
    DEFAULT_WALL_HEIGHT,
    ...openings.map(({ range }) => range.topCm + 20),
    ...features.map((item) => featureVerticalRange(item).topCm + 10),
  );
  const hiddenOpeningIds = new Set();
  const cutOpeningIds = new Set();
  let hiddenWallCount = 0;
  let kitchenComponentCount = 0;

  for (const room of rooms) {
    root.add(roomFloor(room));
    room.points.forEach((from, edgeIndex) => {
      if (room.nonWallEdges?.includes(edgeIndex)) return;
      const to = room.points[(edgeIndex + 1) % room.points.length];
      const cuts = openings.map(({ opening }) => openingCutOnEdge(opening, room, edgeIndex, wallHeight)).filter(Boolean);
      if (options.cutaway !== false && isCutawayEdge(room.points, edgeIndex, options.quarterTurn ?? 0)) {
        hiddenWallCount += 1;
        cuts.forEach((cut) => hiddenOpeningIds.add(cut.opening.id));
        return;
      }
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const edgeWallHeight = roomEdgeWallHeight(room, cuts.length > 0, wallHeight);
      cuts.forEach((cut) => cutOpeningIds.add(cut.opening.id));
      const rectangles = cuts.length ? splitWallFace(length, edgeWallHeight, cuts) : [{ u1: 0, u2: length, z1: 0, z2: edgeWallHeight }];
      if (!layerEnabled("walls", options)) return;
      for (const rectangle of rectangles) {
        const segmentFrom = pointAt(from, to, rectangle.u1, length);
        const segmentTo = pointAt(from, to, rectangle.u2, length);
        const wall = segmentBox(
          segmentFrom,
          segmentTo,
          rectangle.z1,
          rectangle.z2,
          WALL_THICKNESS,
          material(0xdedbd1, { roughness: 1 }),
        );
        wall.receiveShadow = true;
        markSelectionBlocker(wall);
        addOutline(wall, 0x7c817b, .42);
        root.add(wall);
      }
    });
  }

  if (layerEnabled("walls", options)) {
    for (const wall of partitionWalls) {
      const points = wall.points?.length >= 2 ? wall.points : [wall.from, wall.to].filter(Boolean);
      for (let index = 0; index < points.length - (wall.points?.length >= 3 ? 0 : 1); index += 1) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        const mesh = segmentBox(from, to, 0, wallHeight, WALL_THICKNESS, material(0xd6d3ca));
        mesh.receiveShadow = true;
        markSelectionBlocker(mesh);
        addOutline(mesh, 0x70766f, .5);
        root.add(mesh);
      }
    }
  }

  if (layerEnabled("openings", options)) {
    for (const { opening, range } of openings) {
      if (hiddenOpeningIds.has(opening.id)) continue;
      const assembly = openingAssembly(opening, range);
      if (assembly) root.add(assembly);
    }
  }

  if (layerEnabled("features", options)) {
    for (const item of features) {
      const vertical = featureVerticalRange(item);
      const mesh = featureAssembly(documentData, item, vertical);
      if (!mesh) continue;
      root.add(mesh);
      if (item.kind === "kitchen") {
        const componentRange = kitchenComponentVerticalRange(item);
        for (const component of buildKitchenComponentRects(item)) {
          const componentItem = { ...component, name: item.name };
          const componentMesh = componentRange
            ? boxObject(componentItem, componentRange, component.kind === "sink" ? 0x6f9faf : 0x303331, "feature")
            : null;
          if (componentMesh) root.add(componentMesh);
          kitchenComponentCount += 1;
        }
      }
      if (options.showLabels) root.add(textSprite(item.name, mesh.userData.labelPosition
        ?? new THREE.Vector3(item.x + item.width / 2, vertical.topCm + 22, item.y + item.height / 2)));
    }
  }

  if (layerEnabled("furniture", options)) {
    for (const item of furniture) {
      const vertical = resolveFurnitureVerticalRange(plan, item);
      const mesh = detailedFurnitureAssembly(item, vertical);
      if (!mesh) continue;
      root.add(mesh);
      if (options.showLabels) root.add(textSprite(item.name, new THREE.Vector3(item.x + item.widthCm / 2, vertical.topCm + 22, item.y + item.depthCm / 2)));
    }
  }

  let electricalCount = 0;
  if (layerEnabled("electrical", options)) {
    for (const { item, type } of electrical) {
      const assembly = electricalAssembly(documentData, item, type);
      if (!assembly) continue;
      const room = plan.rooms?.find((entry) => entry.id === item.roomId);
      const wallIndex = assembly.placement.wall.index;
      if (options.cutaway !== false && room?.points?.length && wallIndex < room.points.length
        && isCutawayEdge(room.points, wallIndex, options.quarterTurn ?? 0)) continue;
      root.add(assembly.group);
      electricalCount += 1;
    }
  }

  return {
    rendered: true,
    bounds,
    wallHeight,
    openingCount: openings.length,
    cutOpeningCount: cutOpeningIds.size,
    hiddenWallCount,
    partitionWallCount: partitionWalls.length,
    furnitureWithoutHeight: furniture.filter((item) => !Number.isFinite(item.heightCm)).length,
    schematicFeatureCount: features.filter((item) => featureVerticalRange(item).schematic).length,
    selectedRoomName: selectedRoom?.name ?? null,
    kitchenComponentCount,
    electricalCount,
  };
}

export function createWebGLThreeView(canvas, onSelect = null, onClear = null) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf3efe6, 1);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
  renderer.setPixelRatio(Math.min(coarsePointer ? 1.5 : 2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-500, 500, 350, -350, 1, 4000);
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb6b1a7, 2.25));
  const sunlight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunlight.position.set(-450, 900, -350);
  scene.add(sunlight);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointers = new Map();
  const view = { yaw: -Math.PI / 4, pitch: .72, zoom: 1, panX: 0, panY: 0, quarterTurn: 0, focus: null };
  let sceneInfo = { bounds: { x: 0, y: 0, width: 1, height: 1 }, wallHeight: DEFAULT_WALL_HEIGHT };
  let frameRequested = false;
  let pinchStart = null;
  let usedMultiplePointers = false;
  let currentDocument = null;
  let currentOptions = {};
  let builtCutawayTurn = 0;
  let selectedKey = null;
  let selectedTone = "normal";
  let relatedKeys = new Set();
  let selectionOutlines = [];
  let lastPick = null;
  const contextMessage = canvas.parentElement?.querySelector("[data-webgl-status]");

  function requestRender() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      resize();
      renderer.render(scene, camera);
    });
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) renderer.setSize(width, height, false);
    const aspect = width / height;
    const span = Math.max(sceneInfo.bounds.width, sceneInfo.bounds.height, sceneInfo.wallHeight * 2.2) * 1.28 / view.zoom;
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    const center = view.focus
      ? new THREE.Vector3(view.focus.x, view.focus.y, view.focus.z)
      : new THREE.Vector3(
        sceneInfo.bounds.x + sceneInfo.bounds.width / 2,
        sceneInfo.wallHeight * .28,
        sceneInfo.bounds.y + sceneInfo.bounds.height / 2,
      );
    const distance = Math.max(sceneInfo.bounds.width, sceneInfo.bounds.height, 500) * 1.65;
    const horizontal = Math.cos(view.pitch) * distance;
    camera.position.set(
      center.x + Math.sin(view.yaw) * horizontal,
      center.y + Math.sin(view.pitch) * distance,
      center.z + Math.cos(view.yaw) * horizontal,
    );
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const pan = clampWebGLPan(view.panX, view.panY, view.zoom, width, height);
    view.panX = pan.x;
    view.panY = pan.y;
    const worldPerPixelY = span / height;
    const worldPerPixelX = span * aspect / width;
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const shift = cameraRight.multiplyScalar(-view.panX * worldPerPixelX)
      .add(cameraUp.multiplyScalar(view.panY * worldPerPixelY));
    camera.position.add(shift);
    center.add(shift);
    camera.lookAt(center);
  }

  function setZoom(value) {
    view.zoom = Math.max(1, Math.min(3, value));
    if (view.zoom <= 1.001) {
      view.panX = 0;
      view.panY = 0;
    } else {
      const pan = clampWebGLPan(view.panX, view.panY, view.zoom, canvas.clientWidth, canvas.clientHeight);
      view.panX = pan.x;
      view.panY = pan.y;
    }
    requestRender();
    return view.zoom;
  }

  function resetView(quarterTurn = view.quarterTurn) {
    view.quarterTurn = quarterTurn;
    view.yaw = -Math.PI / 4 + quarterTurn * Math.PI / 2;
    view.pitch = .72;
    view.zoom = 1;
    view.panX = 0;
    view.panY = 0;
    view.focus = null;
    rebuildScene();
  }

  function rebuildScene() {
    if (!currentDocument) {
      requestRender();
      return sceneInfo;
    }
    disposeObject(root);
    root.clear();
    builtCutawayTurn = yawToQuarterTurn(view.yaw);
    sceneInfo = buildScene(root, currentDocument, { ...currentOptions, quarterTurn: builtCutawayTurn });
    const selectionVisible = applySelectionHighlight();
    sceneInfo.selectionVisible = selectedKey ? selectionVisible : null;
    requestRender();
    return sceneInfo;
  }

  function materialList(object) {
    if (!object?.material) return [];
    return Array.isArray(object.material) ? object.material : [object.material];
  }

  function restoreSelectionMaterials() {
    for (const outline of selectionOutlines) {
      outline.parent?.remove(outline);
      outline.geometry?.dispose();
      outline.material?.dispose();
    }
    selectionOutlines = [];
    root.traverse((object) => {
      for (const meshMaterial of materialList(object)) {
        const original = meshMaterial.userData?.selectionOriginal;
        if (!original) continue;
        meshMaterial.emissive?.copy(original.emissive);
        meshMaterial.emissiveIntensity = original.emissiveIntensity;
        delete meshMaterial.userData.selectionOriginal;
      }
    });
  }

  function applySelectionHighlight({ focus = false } = {}) {
    restoreSelectionMaterials();
    if (!selectedKey) return false;
    let selectedObject = null;
    const relatedObjects = [];
    root.traverse((object) => {
      const selection = object.userData.selection;
      const key = threeSelectionKey(selection?.type, selection?.item);
      if (!selectedObject && key === selectedKey) selectedObject = object;
      else if (relatedKeys.has(key)) relatedObjects.push(object);
    });
    const addXrayOverlay = (target, style) => {
      if (!target) return;
      target.updateWorldMatrix(true, true);
      root.updateWorldMatrix(true, false);
      const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
      target.traverse((object) => {
        if (!object.isMesh || object.userData.selectionHitTarget || !object.geometry) return;
        const overlay = new THREE.Mesh(
          object.geometry.clone(),
          new THREE.MeshBasicMaterial({
            color: style.color,
            opacity: style.opacity,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        overlay.matrixAutoUpdate = false;
        overlay.matrix.copy(rootInverse).multiply(object.matrixWorld);
        overlay.renderOrder = 19;
        overlay.userData.selectionEffect = true;
        root.add(overlay);
        selectionOutlines.push(overlay);
      });
    };
    const highlightObject = (target, style, { xray = false } = {}) => {
      target?.traverse((object) => {
        if (object.userData.selectionHitTarget) return;
        for (const meshMaterial of materialList(object)) {
          if (!meshMaterial.emissive) continue;
          if (!meshMaterial.userData.selectionOriginal) {
            meshMaterial.userData.selectionOriginal = {
              emissive: meshMaterial.emissive.clone(),
              emissiveIntensity: meshMaterial.emissiveIntensity,
            };
          }
          meshMaterial.emissive.set(style.emissive);
          meshMaterial.emissiveIntensity = style.intensity;
        }
      });
      if (!target) return;
      const outline = new THREE.Box3Helper(new THREE.Box3().setFromObject(target), style.outline);
      outline.renderOrder = 20;
      outline.material.depthTest = false;
      selectionOutlines.push(outline);
      root.add(outline);
      if (xray) addXrayOverlay(target, threeSelectionXrayStyle(selectedTone));
    };
    const selectionStyle = threeSelectionStyle(selectedTone);
    const relatedStyle = threeRelatedSelectionStyle();
    relatedObjects.forEach((object) => highlightObject(object, relatedStyle));
    highlightObject(selectedObject, selectionStyle, { xray: true });
    if (selectedObject) {
      const bounds = new THREE.Box3().setFromObject(selectedObject);
      if (focus) {
        const center = bounds.getCenter(new THREE.Vector3());
        view.focus = { x: center.x, y: center.y, z: center.z };
      }
    }
    return Boolean(selectedObject);
  }

  function clearSelection() {
    view.focus = null;
    selectedKey = null;
    selectedTone = "normal";
    relatedKeys = new Set();
    restoreSelectionMaterials();
    requestRender();
  }

  function setSelection(type, item, { tone = "normal", focus = true, related = [] } = {}) {
    selectedKey = threeSelectionKey(type, item);
    selectedTone = ["danger", "warning"].includes(tone) ? tone : "normal";
    relatedKeys = new Set(related
      .map((entry) => threeSelectionKey(entry.type, entry.item ?? entry))
      .filter((key) => key && key !== selectedKey));
    if (focus) {
      view.focus = null;
      view.panX = 0;
      view.panY = 0;
    }
    applySelectionHighlight({ focus });
    requestRender();
    return Boolean(selectedKey);
  }

  function selectionsAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(root.children, true);
    const selections = [];
    for (const hit of hits) {
      let object = hit.object;
      let blocked = false;
      let selection = null;
      while (object) {
        if (object.userData.selection) {
          selection = object.userData.selection;
          break;
        }
        if (object.userData.blocksSelection) blocked = true;
        object = object.parent;
      }
      if (selection) selections.push(selection);
      else if (blocked) break;
    }
    return selections;
  }

  function pick(clientX, clientY) {
    const offsets = [[0, 0], [-10, 0], [10, 0], [0, -10], [0, 10], [-8, -8], [8, -8], [-8, 8], [8, 8]];
    const candidates = offsets.flatMap(([x, y]) => selectionsAt(clientX + x, clientY + y));
    const now = performance.now();
    const repeatedLocation = lastPick
      && now - lastPick.time < 1400
      && Math.hypot(clientX - lastPick.x, clientY - lastPick.y) <= 18;
    const selected = cycleThreeSelectionCandidate(candidates, repeatedLocation ? selectedKey : null);
    if (selected) {
      selectedKey = threeSelectionKey(selected.type, selected.item);
      selectedTone = "normal";
      relatedKeys = new Set();
      const uniqueKeys = [...new Set(candidates.map((candidate) => threeSelectionKey(candidate.type, candidate.item)).filter(Boolean))];
      const candidateIndex = Math.max(0, uniqueKeys.indexOf(selectedKey));
      lastPick = { x: clientX, y: clientY, time: now };
      applySelectionHighlight();
      requestRender();
      onSelect?.(selected.type, selected.item, { candidateCount: uniqueKeys.length, candidateIndex });
      return;
    }
    lastPick = null;
    clearSelection();
    onClear?.();
  }

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false });
    if (pointers.size === 2) {
      usedMultiplePointers = true;
      const values = [...pointers.values()];
      pinchStart = {
        distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y),
        midpointX: (values[0].x + values[1].x) / 2,
        midpointY: (values[0].y + values[1].y) / 2,
        zoom: view.zoom,
        panX: view.panX,
        panY: view.panY,
      };
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const current = pointers.get(event.pointerId);
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.x = event.clientX;
    current.y = event.clientY;
    if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5) {
      current.moved = true;
      lastPick = null;
    }
    if (pointers.size === 1 && !usedMultiplePointers) {
      view.yaw -= dx * .009;
      view.pitch = Math.max(.25, Math.min(1.3, view.pitch + dy * .006));
      requestRender();
    } else if (pointers.size === 2 && pinchStart) {
      const values = [...pointers.values()];
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      if (pinchStart.distance > 0) setZoom(pinchStart.zoom * distance / pinchStart.distance);
      const midpointX = (values[0].x + values[1].x) / 2;
      const midpointY = (values[0].y + values[1].y) / 2;
      const pan = clampWebGLPan(
        pinchStart.panX + midpointX - pinchStart.midpointX,
        pinchStart.panY + midpointY - pinchStart.midpointY,
        view.zoom,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      view.panX = pan.x;
      view.panY = pan.y;
      requestRender();
    }
    event.preventDefault();
  });

  function endPointer(event) {
    const current = pointers.get(event.pointerId);
    const shouldPick = pointers.size === 1 && current && !current.moved && !usedMultiplePointers;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!pointers.size) {
      pinchStart = null;
      usedMultiplePointers = false;
    }
    if (current?.moved && currentOptions.cutaway !== false) {
      const nextCutawayTurn = yawToQuarterTurn(view.yaw);
      if (nextCutawayTurn !== builtCutawayTurn) rebuildScene();
    }
    if (shouldPick) pick(event.clientX, event.clientY);
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", (event) => {
    setZoom(view.zoom + (event.deltaY < 0 ? .15 : -.15));
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    if (contextMessage) contextMessage.hidden = false;
    canvas.setAttribute("aria-label", "間取りのWebGL 3D表示（一時停止中）");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (contextMessage) contextMessage.hidden = true;
    canvas.setAttribute("aria-label", "間取りのWebGL 3D表示");
    rebuildScene();
  });

  const observer = new ResizeObserver(requestRender);
  observer.observe(canvas);

  return {
    render(documentData, options = {}) {
      if (options.quarterTurn !== view.quarterTurn) {
        const difference = ((options.quarterTurn ?? 0) - view.quarterTurn + 4) % 4;
        view.yaw += (difference === 3 ? -1 : difference) * Math.PI / 2;
        view.quarterTurn = options.quarterTurn ?? 0;
      }
      currentDocument = documentData;
      currentOptions = { ...options };
      return rebuildScene();
    },
    getZoom: () => view.zoom,
    getPan: () => ({ x: view.panX, y: view.panY }),
    getFocus: () => view.focus ? { ...view.focus } : null,
    setZoom,
    resetView,
    clearSelection,
    setSelection,
    requestRender,
  };
}
