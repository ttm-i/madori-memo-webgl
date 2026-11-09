import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alignCurtainToOpening, alignCurtainsToOpenings, alignFurnitureToSupport, alignSupportedFurniture, analyzeDeliveryRoute, analyzeFurnitureConflicts, analyzeFurniturePlacement, analyzeFurnitureSupportFit, applyFurnitureCandidate, buildElevationItems, buildFurnitureHierarchy, buildKitchenCabinetLayout, buildKitchenComponentRects, buildRoomWalls, buildWallDiagram, countQualities, createSamplePlan, curtainOpening, duplicateFurniture, duplicateFurnitureStack, findDeliveryDoorPath, fitsRectangle, FORMAT, furnitureBounds, furnitureDescendantIds, furnitureEighthTurns, furniturePolygon, furniturePriceSummary, FURNITURE_PRESETS, furnitureDisplayHeight, furnitureRotationDegrees, furnitureWallMove, getDimensionGroup, getElectricalPlanPosition, inferFurnitureKind, kitchenComponentVerticalRange, moveDimensionGuide, normalizeFurnitureProductUrl, pointInPolygon, previewFurnitureCandidate, rectangleIntersectsPolygon, rectanglesOverlap, removeFurnitureStack, resolveFurnitureElevationPlacement, resolveFurnitureVerticalRange, rotateFurniture, rotateFurnitureStack, snapToGrid, supportSurfaceSize, translateFurnitureDescendants, updateFurniture, validatePlan, wallDisplayWidth } from "../dist/model.js";
import { detailMarkup, gestureExceedsTapThreshold, measurementMetrics, PlanRenderer, snapMeasurementPoint, zoomTransformAround } from "../dist/renderer.js";
import { bayWindowFootprint, cabinetDoorPanelCount, cabinetThreePlacement, clampIndoorPitch, clampWebGLPan, closetDoorPanelCount, closetThreePlacement, cycleThreeSelectionCandidate, electricalThreePlacement, featureVerticalRange, isCutawayEdge, openingPanelCount, openingVerticalRange, projectThreeDepth, projectThreePoint, roomEdgeWallHeight, roomInteriorViewpoint, splitWallFace, subdivideVerticalRange, subdivideWallRectangle, subdivideWallRectangleTiles, subdivideWallSegment, threeItemBelongsToRoom, threeItemFootprint, threeLayerEnabled, threeRelatedSelectionStyle, threeRoomBounds, threeSelectableType, threeSelectionKey, threeSelectionStyle, threeSelectionXrayStyle, threeViewportBox, threeWallBelongsToRoom, visibleBoxSideIndexes, wallFeatureThreePlacement, yawToQuarterTurn } from "../dist/three.js";

test("3D selection keys distinguish element kinds and reject anonymous data", () => {
  assert.equal(threeSelectionKey("outlet", { id: "outlet-3" }), "outlet:outlet-3");
  assert.equal(threeSelectionKey("switch", { id: "outlet-3" }), "switch:outlet-3");
  assert.equal(threeSelectionKey("outlet", { name: "コンセント" }), null);
});

test("overlapping 3D selections cycle in depth order without duplicate candidates", () => {
  const front = { type: "furniture", item: { id: "front" } };
  const behind = { type: "outlet", item: { id: "behind" } };
  assert.equal(cycleThreeSelectionCandidate([front, behind, front]).item.id, "front");
  assert.equal(cycleThreeSelectionCandidate([front, behind, front], "furniture:front").item.id, "behind");
  assert.equal(cycleThreeSelectionCandidate([front, behind], "outlet:behind").item.id, "front");
  assert.equal(cycleThreeSelectionCandidate([], "furniture:front"), null);
});

test("3D selection colors distinguish normal, warning and danger states", () => {
  assert.deepEqual(threeSelectionStyle(), { emissive: 0x0f9b78, outline: 0x08795f, intensity: .75 });
  assert.deepEqual(threeSelectionStyle("warning"), { emissive: 0xc46613, outline: 0xe59a3a, intensity: .68 });
  assert.deepEqual(threeSelectionStyle("danger"), { emissive: 0xb42318, outline: 0xe05248, intensity: .7 });
  assert.deepEqual(threeRelatedSelectionStyle(), { emissive: 0xd78b32, outline: 0xf0b765, intensity: .28 });
  assert.deepEqual(threeSelectionXrayStyle(), { color: 0x16a884, opacity: .2 });
  assert.deepEqual(threeSelectionXrayStyle("warning"), { color: 0xe59a3a, opacity: .22 });
  assert.deepEqual(threeSelectionXrayStyle("danger"), { color: 0xe05248, opacity: .24 });
});

test("3D closets face the owning room and choose a plausible folding-door count", () => {
  const sample = createSamplePlan();
  const closet = sample.plan.features.find((item) => item.kind === "closet");
  const placement = closetThreePlacement(sample, closet);
  assert.deepEqual(placement.from, { x: 420, y: 60 });
  assert.deepEqual(placement.to, { x: 560, y: 60 });
  assert.equal(Math.abs(placement.normal.x), 0);
  assert.equal(placement.normal.y, 1);
  assert.equal(placement.panelCount, 2);
  assert.equal(closetDoorPanelCount({ elevationWidthCm: 263.5 }), 4);
  assert.equal(closetDoorPanelCount({ elevationWidthCm: 135.5 }), 2);
});

test("3D shoe cabinet uses a pair of center-opening doors", () => {
  assert.equal(cabinetDoorPanelCount({ kind: "cabinet" }), 2);
  assert.equal(cabinetDoorPanelCount({ kind: "washbasin" }), 0);
  assert.deepEqual(
    cabinetThreePlacement({ kind: "cabinet", x: 307, y: 98, width: 36, height: 75.5, doorFacing: "left" }),
    { from: { x: 343, y: 98 }, to: { x: 343, y: 173.5 }, tangent: { x: 0, y: 1 }, normal: { x: -1, y: 0 }, widthCm: 75.5, depthCm: 36 },
  );
});

test("3D equipment without elevation metadata uses its nearest room wall", () => {
  const documentData = {
    plan: {
      rooms: [{ id: "room", name: "部屋", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }] }],
      features: [], walls: [], openings: [], furniture: [],
    },
  };
  const placement = wallFeatureThreePlacement(documentData, { roomId: "room", x: 2, y: 40, width: 60, height: 50 });
  assert.equal(placement.wall.index, 3);
  assert.equal(placement.widthCm, 50);
  assert.equal(placement.depthCm, 60);
  assert.equal(placement.normal.x, 1);
  assert.equal(Math.abs(placement.normal.y), 0);
});

test("sample plan conforms to the public schema", () => {
  const sample = createSamplePlan();
  assert.equal(sample.format, FORMAT);
  assert.doesNotThrow(() => validatePlan(sample));
  assert.equal(sample.plan.rooms.length, 2);
});

test("invalid coordinates are rejected", () => {
  const sample = createSamplePlan();
  sample.plan.rooms[0].points[0].x = "not-a-number";
  assert.throws(() => validatePlan(sample), /座標が不正/);
});

test("structural columns represented by the room outline are removed from equipment", () => {
  const sample = createSamplePlan();
  sample.plan.features.push({ id: "structural-column", name: "柱型", kind: "column", roomId: "sample-room", x: 0, y: 0, width: 20, height: 20 });
  const validated = validatePlan(sample);
  assert.equal(validated.plan.features.some((feature) => feature.kind === "column"), false);
});

test("quality counts include uncertain room geometry", () => {
  const sample = createSamplePlan();
  sample.plan.rooms[0].uncertain = true;
  const counts = countQualities(sample);
  assert.equal(counts.measured, 6);
  assert.equal(counts.uncertain, 3);
});

test("wall elevation items preserve measured heights without inventing a ceiling", () => {
  const sample = createSamplePlan();
  const items = buildElevationItems(sample, "sample-room");
  assert.deepEqual(items.map(({ name, bottomCm, topCm }) => ({ name, bottomCm, topCm })), [
    { name: "掃き出し窓", bottomCm: 0, topCm: 180 },
    { name: "洋室引き戸", bottomCm: 0, topCm: 200 },
    { name: "サンプルソファ", bottomCm: 0, topCm: 80 },
  ]);
  assert.equal(items.some((item) => item.name.includes("天井")), false);
});

test("room walls retain plan direction and place openings at measured horizontal offsets", () => {
  const sample = createSamplePlan();
  const walls = buildRoomWalls(sample, "sample-room");
  assert.deepEqual(walls.map(({ id, label, lengthCm }) => ({ id, label, lengthCm })), [
    { id: "sample-room-wall-0", label: "上側の壁", lengthCm: 500 },
    { id: "sample-room-wall-1", label: "右側の壁", lengthCm: 280 },
    { id: "sample-room-wall-2", label: "下側の壁", lengthCm: 500 },
    { id: "sample-room-wall-3", label: "左側の壁", lengthCm: 280 },
  ]);
  const top = buildWallDiagram(sample, "sample-room", "sample-room-wall-0");
  const bottom = buildWallDiagram(sample, "sample-room", "sample-room-wall-2");
  assert.deepEqual(top.items.map(({ name, offsetCm, widthCm, topCm }) => ({ name, offsetCm, widthCm, topCm })), [
    { name: "洋室引き戸", offsetCm: 120, widthCm: 140, topCm: 200 },
  ]);
  assert.deepEqual(bottom.items.map(({ name, offsetCm, widthCm, topCm }) => ({ name, offsetCm, widthCm, topCm })), [
    { name: "掃き出し窓", offsetCm: 40, widthCm: 170, topCm: 180 },
  ]);
});

test("wall elevations use a common room scale instead of stretching every wall", () => {
  assert.equal(wallDisplayWidth(500, 500), 840);
  assert.equal(wallDisplayWidth(280, 500), 470.40000000000003);
  assert.equal(wallDisplayWidth(90, 500), 151.2);
});

test("electrical markers share wall coordinates between plan and elevation", () => {
  const sample = createSamplePlan();
  const outlet = sample.plan.electrical.outlets[0];
  const position = getElectricalPlanPosition(sample, outlet);
  assert.deepEqual(position, {
    anchor: { x: 560, y: 150 },
    display: { x: 544, y: 150 },
  });
  const diagram = buildWallDiagram(sample, "sample-ldk", "sample-ldk-wall-1");
  assert(diagram.items.some((item) => item.id === "sample-outlet" && item.offsetCm === 86 && item.widthCm === 8 && item.topCm === 25));
  assert(diagram.items.some((item) => item.id === "sample-switch" && item.offsetCm === 126 && item.widthCm === 8 && item.topCm === 120));
});

test("electrical detail uses outlet-specific fields", () => {
  const sample = createSamplePlan();
  const markup = detailMarkup("outlet", { ...sample.plan.electrical.outlets[0], roomName: "LDK" });
  assert.match(markup, /コンセント/);
  assert.match(markup, /2口/);
  assert.match(markup, /床から 25 cm/);
  assert.match(markup, /プレート中心/);
});

test("feature detail separates dimension quality from placement quality", () => {
  const markup = detailMarkup("feature", {
    name: "収納",
    widthCm: 120,
    quality: "measured",
    placementQuality: "approximate",
  });
  assert.match(markup, /寸法: 実測/);
  assert.match(markup, /配置: 要確認/);
});

test("kitchen components are positioned from the measured edge segments", () => {
  const kitchen = {
    x: 10, y: 20, width: 200, kind: "kitchen",
    horizontalSegmentsCm: { stoveToLeftEdge: 10, stoveWidth: 50, sinkToStove: 40, sinkWidth: 80, rightEdgeToSink: 20 },
    depthDetailsCm: { stoveDepth: 45, stoveToWall: 3, sinkDepth: 44, sinkToWall: 4 },
  };
  assert.deepEqual(buildKitchenComponentRects(kitchen), [
    { kind: "stove", label: "コンロ", x: 20, y: 23, width: 50, height: 45 },
    { kind: "sink", label: "シンク", x: 110, y: 24, width: 80, height: 44 },
  ]);
  assert.deepEqual(buildKitchenCabinetLayout({
    ...kitchen,
    overallWidthCm: 200,
    worktopHeightCm: 85,
    overheadCabinetClearanceCm: 73.5,
    rangeHoodClearanceCm: 83.5,
  }), {
    lowerSections: [
      { kind: "stove", fromCm: 0, toCm: 60 },
      { kind: "prep", fromCm: 60, toCm: 100 },
      { kind: "sink", fromCm: 100, toCm: 200 },
    ],
    overhead: { fromCm: 60, toCm: 200, bottomCm: 158.5, panelCount: 3 },
    hood: { fromCm: 10, toCm: 60, bottomCm: 168.5 },
  });
  assert.deepEqual(kitchenComponentVerticalRange({ worktopHeightCm: 85 }), { bottomCm: 88.2, topCm: 90.2 });
  assert.equal(kitchenComponentVerticalRange({}), null);
  const markup = detailMarkup("feature", { ...kitchen, overallWidthCm: 200, overallDepthCm: 60, worktopHeightCm: 85, quality: "measured", placementQuality: "confirmed" });
  assert.match(markup, /キッチン全体/);
  assert.match(markup, /シンク/);
  assert.match(markup, /コンロ/);
});

test("delivery checks consider every orientation without promising access", () => {
  assert.equal(fitsRectangle([80, 45, 190], 85, 200), true);
  assert.equal(fitsRectangle([210, 220, 230], 85, 200), false);
  const sample = createSamplePlan();
  const sofa = sample.plan.furniture[0];
  assert.deepEqual(findDeliveryDoorPath(sample, "sample-room").map((door) => door.id), ["sample-door"]);
  const candidate = analyzeDeliveryRoute(sofa, sample);
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.checks.length, 5);
  assert(candidate.checks.some((check) => check.id === "internal-sample-door"));
  assert(candidate.checks.every((check) => check.status === "pass"));
  const oversized = { ...sofa, deliveryDimensions: { sideACm: 210, sideBCm: 220, sideCCm: 230, basis: "packed" } };
  assert.equal(analyzeDeliveryRoute(oversized, sample).status, "review");
  assert.equal(analyzeDeliveryRoute({ ...sofa, deliveryDimensions: undefined }, sample).status, "missing");
});

test("plan styles can independently hide each display layer", () => {
  const css = readFileSync(new URL("../dist/styles.css", import.meta.url), "utf8");
  assert.match(css, /room-labels-hidden/);
  assert.match(css, /dimensions-hidden/);
  assert.match(css, /features-hidden/);
  assert.match(css, /furniture-hidden/);
  assert.match(css, /curtains-hidden \.furniture-group\.is-curtain/);
  assert.match(css, /electrical-hidden/);
  assert.match(css, /\.field-label input, \.field-label select[^}]*font-size:\s*16px/);
});

test("custom elevations can replace a room edge and omit a non-wall opening", () => {
  const sample = createSamplePlan();
  const room = sample.plan.rooms.find((item) => item.id === "sample-room");
  room.nonWallEdges = [1];
  sample.plan.hiddenElevationWallIds = ["sample-room-wall-2"];
  sample.plan.elevationWalls = [{
    id: "sample-custom-wall",
    roomId: "sample-room",
    label: "折れ壁",
    from: { x: 500, y: 280 },
    to: { x: 382.5, y: 280 },
    lengthCm: 117.5,
  }];
  sample.plan.elevationWallOrderByRoom = { "sample-room": ["sample-custom-wall", "sample-room-wall-0"] };
  assert.deepEqual(buildRoomWalls(sample, "sample-room").map((wall) => wall.id), [
    "sample-custom-wall",
    "sample-room-wall-0",
    "sample-room-wall-3",
  ]);
});

test("furniture rotates around its center", () => {
  const furniture = { id: "f1", name: "テーブル", x: 100, y: 200, widthCm: 140, depthCm: 80 };
  rotateFurniture(furniture);
  assert.deepEqual(furniture, { id: "f1", name: "テーブル", x: 100, y: 200, widthCm: 140, depthCm: 80, rotationEighthTurns: 1, rotationQuarterTurns: 0 });
  rotateFurniture(furniture);
  assert.deepEqual(furniture, { id: "f1", name: "テーブル", x: 130, y: 170, widthCm: 80, depthCm: 140, rotationEighthTurns: 2, rotationQuarterTurns: 1 });
  for (let count = 0; count < 6; count += 1) rotateFurniture(furniture);
  assert.deepEqual(furniture, { id: "f1", name: "テーブル", x: 100, y: 200, widthCm: 140, depthCm: 80, rotationEighthTurns: 0, rotationQuarterTurns: 0 });
});

test("legacy quarter-turn data maps to eight directions and diagonal bounds", () => {
  assert.equal(furnitureEighthTurns({ rotationQuarterTurns: 3 }), 6);
  const furniture = { x: 50, y: 90, widthCm: 100, depthCm: 20, rotationEighthTurns: 1 };
  const bounds = furnitureBounds(furniture);
  assert.ok(Math.abs(bounds.left - 57.5736) < 0.001);
  assert.ok(Math.abs(bounds.right - 142.4264) < 0.001);
  assert.ok(Math.abs(bounds.top - 57.5736) < 0.001);
  assert.ok(Math.abs(bounds.bottom - 142.4264) < 0.001);
  assert.equal(furniturePolygon(furniture).length, 4);
});

test("rotating a support keeps stacked furniture aligned and facing the same way", () => {
  const stand = { id: "stand", name: "テレビ台", x: 100, y: 100, widthCm: 150, depthCm: 40 };
  const tv = { id: "tv", name: "テレビ", supportId: "stand", x: 120, y: 107.5, widthCm: 110, depthCm: 25, supportOffsetX: 20, supportOffsetY: 7.5 };
  const plan = { furniture: [stand, tv] };
  rotateFurnitureStack(plan, stand);
  assert.deepEqual(stand, { id: "stand", name: "テレビ台", x: 100, y: 100, widthCm: 150, depthCm: 40, rotationEighthTurns: 1, rotationQuarterTurns: 0 });
  assert.deepEqual(tv, { id: "tv", name: "テレビ", supportId: "stand", x: 120, y: 107.5, widthCm: 110, depthCm: 25, supportOffsetX: 20, supportOffsetY: 7.5, rotationEighthTurns: 1, rotationQuarterTurns: 0 });
  assert.equal(analyzeFurnitureSupportFit(tv, plan).fits, true);
  assert.deepEqual(analyzeFurnitureSupportFit(tv, plan).overflowEdgesCm, { left: 0, right: 0, top: 0, bottom: 0 });
  alignSupportedFurniture(plan);
  assert.deepEqual({ x: tv.x, y: tv.y }, { x: 120, y: 107.5 });
});

test("rotating stacked furniture itself preserves its new position on the support", () => {
  const stand = { id: "stand", name: "テレビ台", x: 100, y: 100, widthCm: 150, depthCm: 40 };
  const tv = { id: "tv", name: "テレビ", supportId: "stand", x: 120, y: 107.5, widthCm: 110, depthCm: 25, supportOffsetX: 20, supportOffsetY: 7.5 };
  const plan = { furniture: [stand, tv] };
  rotateFurnitureStack(plan, tv);
  assert.deepEqual(tv, { id: "tv", name: "テレビ", supportId: "stand", x: 120, y: 107.5, widthCm: 110, depthCm: 25, supportOffsetX: 20, supportOffsetY: 7.5, rotationEighthTurns: 1, rotationQuarterTurns: 0 });
  alignSupportedFurniture(plan);
  assert.deepEqual({ x: tv.x, y: tv.y }, { x: 120, y: 107.5 });
});

test("furniture duplication preserves size and offsets position", () => {
  const original = { id: "f1", name: "ソファ", x: 20, y: 30, widthCm: 180, depthCm: 85 };
  const copy = duplicateFurniture(original, "f2");
  assert.deepEqual(copy, { id: "f2", name: "ソファ コピー", x: 35, y: 45, widthCm: 180, depthCm: 85 });
  assert.equal(original.name, "ソファ");
});

test("furniture prices remain optional, total only registered values and survive duplication", () => {
  const furniture = { id: "priced", name: "ソファ", x: 0, y: 0, widthCm: 180, depthCm: 85, priceYen: 128000 };
  const copy = duplicateFurniture(furniture, "copy");
  assert.equal(copy.priceYen, 128000);
  assert.deepEqual(furniturePriceSummary([furniture, { id: "missing" }, { id: "free", priceYen: 0 }]), {
    totalYen: 128000,
    registeredCount: 2,
    missingCount: 1,
  });
  updateFurniture(furniture, { name: "ソファ", roomId: "room", widthCm: 180, depthCm: 85, heightCm: null, priceYen: null, supportId: null, furnitureKind: null });
  assert.equal(Object.hasOwn(furniture, "priceYen"), false);
  const invalidPlan = createSamplePlan();
  invalidPlan.plan.furniture[0].priceYen = 12.5;
  assert.throws(() => validatePlan(invalidPlan), /価格が不正/);
});

test("furniture product links accept web URLs, survive duplication and reject unsafe schemes", () => {
  assert.equal(normalizeFurnitureProductUrl(" https://example.com/item?id=1 "), "https://example.com/item?id=1");
  assert.equal(normalizeFurnitureProductUrl("javascript:alert(1)"), null);
  const furniture = { id: "linked", name: "椅子", x: 0, y: 0, widthCm: 45, depthCm: 50 };
  updateFurniture(furniture, { name: "椅子", roomId: "room", widthCm: 45, depthCm: 50, productUrl: "https://shop.example/chair", supportId: null });
  assert.equal(furniture.productUrl, "https://shop.example/chair");
  assert.equal(duplicateFurniture(furniture, "copy").productUrl, "https://shop.example/chair");
  updateFurniture(furniture, { name: "椅子", roomId: "room", widthCm: 45, depthCm: 50, productUrl: null, supportId: null });
  assert.equal(Object.hasOwn(furniture, "productUrl"), false);
  const invalidPlan = createSamplePlan();
  invalidPlan.plan.furniture[0].productUrl = "file:///secret";
  assert.throws(() => validatePlan(invalidPlan), /商品URLが不正/);
});

test("furniture candidates preserve current orientation and apply price, link and packed dimensions", () => {
  const furniture = { id: "table", name: "テーブル", x: 100, y: 200, widthCm: 70, depthCm: 105, heightCm: 70, rotationEighthTurns: 2 };
  const candidate = {
    id: "candidate-a",
    brand: "ブランドA",
    productName: "テーブルA",
    productUrl: "https://example.com/table-a",
    widthCm: 120,
    depthCm: 75,
    heightCm: 72,
    priceYen: 49800,
    deliveryDimensions: { sideACm: 126, sideBCm: 81, sideCCm: 16, basis: "packed" },
  };
  const preview = previewFurnitureCandidate(furniture, candidate);
  assert.deepEqual({ x: preview.x, y: preview.y, width: preview.widthCm, depth: preview.depthCm, height: preview.heightCm }, { x: 97.5, y: 192.5, width: 75, depth: 120, height: 72 });
  assert.equal(furniture.widthCm, 70);
  applyFurnitureCandidate(furniture, candidate, "group-a");
  assert.deepEqual({ width: furniture.widthCm, depth: furniture.depthCm, price: furniture.priceYen, url: furniture.productUrl }, { width: 75, depth: 120, price: 49800, url: "https://example.com/table-a" });
  assert.deepEqual(furniture.deliveryDimensions, candidate.deliveryDimensions);
  assert.equal(furniture.appliedCandidateId, "candidate-a");
  assert.equal(furniture.candidateGroupId, "group-a");

  const documentData = createSamplePlan();
  documentData.plan.furnitureCandidateGroups = [{ id: "group-a", name: "ダイニングテーブル", furnitureId: "sample-sofa", candidates: [candidate] }];
  assert.doesNotThrow(() => validatePlan(documentData));
  documentData.plan.furnitureCandidateGroups[0].candidates[0].deliveryDimensions.sideACm = 0;
  assert.throws(() => validatePlan(documentData), /梱包寸法が不正/);
});

test("furniture details render registered product links safely", () => {
  const markup = detailMarkup("furniture", { name: "椅子", widthCm: 45, depthCm: 50, productUrl: "https://example.com/chair?color=white&size=1" });
  assert.match(markup, /class="detail-product-link"/);
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
  assert.match(markup, /color=white&amp;size=1/);
  assert.doesNotMatch(detailMarkup("furniture", { productUrl: "javascript:alert(1)" }), /detail-product-link/);
});

test("furniture details include every body and installed-height dimension", () => {
  const measured = detailMarkup("furniture", {
    name: "テーブル", widthCm: 105, depthCm: 70, heightCm: 70,
    vertical: { bottomCm: 40, topCm: 110, schematic: false }, quality: "measured",
  });
  assert.match(measured, /<dt>幅<\/dt><dd>105 cm<\/dd>/);
  assert.match(measured, /<dt>奥行<\/dt><dd>70 cm<\/dd>/);
  assert.match(measured, /<dt>高さ<\/dt><dd>70 cm<\/dd>/);
  assert.match(measured, /<dt>床から底面<\/dt><dd>40 cm<\/dd>/);
  assert.match(measured, /<dt>床から最上部<\/dt><dd>110 cm<\/dd>/);

  const schematic = detailMarkup("furniture", {
    name: "ソファ", widthCm: 180, depthCm: 85,
    vertical: { bottomCm: 0, topCm: 80, schematic: true }, quality: "measured",
  });
  assert.match(schematic, /<dt>高さ<\/dt><dd>未登録<\/dd>/);
  assert.match(schematic, /<dt>3D表示高さ<\/dt><dd>約80 cm（種類別の模式値）<\/dd>/);
  assert.match(schematic, /<dt>床から底面<\/dt><dd>0 cm<\/dd>/);
  assert.match(schematic, /<dt>床から最上部<\/dt><dd>約80 cm（模式値）<\/dd>/);
});

test("window and curtain details include opening dimensions needed for purchasing", () => {
  const opening = detailMarkup("opening", {
    name: "LDK側面窓", kind: "window", widthCm: 160, heightCm: 96.5, sillHeightCm: 88, quality: "measured",
  });
  assert.match(opening, /<dt>開口幅<\/dt><dd>160 cm<\/dd>/);
  assert.match(opening, /<dt>開口高さ<\/dt><dd>96\.5 cm<\/dd>/);
  assert.match(opening, /<dt>床から窓下端<\/dt><dd>88 cm<\/dd>/);
  assert.match(opening, /<dt>床から窓上端<\/dt><dd>184\.5 cm<\/dd>/);

  const curtain = detailMarkup("furniture", {
    name: "カーテンセット", furnitureKind: "curtain", widthCm: 180, depthCm: 12, heightCm: 200,
    openingName: "LDK側面窓", openingWidthCm: 160, openingHeightCm: 96.5, openingSillHeightCm: 88,
    vertical: { bottomCm: 0, topCm: 200, schematic: false }, quality: "measured",
  });
  assert.match(curtain, /<dt>窓の開口幅<\/dt><dd>160 cm<\/dd>/);
  assert.match(curtain, /<dt>窓の開口高さ<\/dt><dd>96\.5 cm<\/dd>/);
  assert.match(curtain, /<dt>床から窓下端<\/dt><dd>88 cm<\/dd>/);
  assert.match(curtain, /<dt>床から窓上端<\/dt><dd>184\.5 cm<\/dd>/);
});

test("furniture stack duplication preserves nested support relationships", () => {
  const stand = { id: "stand", name: "テレビ台", x: 100, y: 100, widthCm: 150, depthCm: 40 };
  const tv = { id: "tv", name: "テレビ", supportId: "stand", x: 120, y: 107.5, widthCm: 110, depthCm: 25, supportOffsetX: 20, supportOffsetY: 7.5 };
  const speaker = { id: "speaker", name: "スピーカー", supportId: "tv", x: 130, y: 110, widthCm: 20, depthCm: 10, supportOffsetX: 10, supportOffsetY: 2.5 };
  const plan = { furniture: [stand, tv, speaker] };
  let index = 0;
  const copies = duplicateFurnitureStack(plan, stand, () => `copy-${++index}`);
  assert.deepEqual(copies.map(({ id, name, supportId, x, y }) => ({ id, name, supportId, x, y })), [
    { id: "copy-1", name: "テレビ台 コピー", supportId: undefined, x: 115, y: 115 },
    { id: "copy-2", name: "テレビ コピー", supportId: "copy-1", x: 135, y: 122.5 },
    { id: "copy-3", name: "スピーカー コピー", supportId: "copy-2", x: 145, y: 125 },
  ]);
  assert.deepEqual([...furnitureDescendantIds(plan, "stand")], ["tv", "speaker"]);
  assert.equal(removeFurnitureStack(plan, "stand"), 3);
  assert.deepEqual(plan.furniture, []);
});

test("moving a support translates every stacked descendant by the same delta", () => {
  const stand = { id: "stand", name: "テレビ台", x: 100, y: 100, widthCm: 150, depthCm: 40 };
  const tv = { id: "tv", name: "テレビ", supportId: "stand", x: 120, y: 107.5, widthCm: 110, depthCm: 25, supportOffsetX: 20, supportOffsetY: 7.5 };
  const speaker = { id: "speaker", name: "スピーカー", supportId: "tv", x: 130, y: 110, widthCm: 20, depthCm: 10, supportOffsetX: 10, supportOffsetY: 2.5 };
  const unrelated = { id: "chair", name: "椅子", x: 300, y: 300, widthCm: 45, depthCm: 50 };
  const plan = { furniture: [stand, tv, speaker, unrelated] };
  assert.deepEqual(translateFurnitureDescendants(plan, "stand", 25, -10).map((item) => item.id), ["tv", "speaker"]);
  assert.deepEqual({ x: tv.x, y: tv.y, offsetX: tv.supportOffsetX, offsetY: tv.supportOffsetY }, { x: 145, y: 97.5, offsetX: 20, offsetY: 7.5 });
  assert.deepEqual({ x: speaker.x, y: speaker.y, offsetX: speaker.supportOffsetX, offsetY: speaker.supportOffsetY }, { x: 155, y: 100, offsetX: 10, offsetY: 2.5 });
  assert.deepEqual({ x: unrelated.x, y: unrelated.y }, { x: 300, y: 300 });
});

test("furniture hierarchy keeps stacked items beside their parent and retains orphans", () => {
  const stand = { id: "stand", name: "テレビ台" };
  const chair = { id: "chair", name: "椅子" };
  const tv = { id: "tv", name: "テレビ", supportId: "stand" };
  const speaker = { id: "speaker", name: "スピーカー", supportId: "tv" };
  const microwave = { id: "microwave", name: "電子レンジ", supportId: "fixed-counter" };
  const orphan = { id: "orphan", name: "参照切れ", supportId: "missing-furniture" };
  const plan = { furniture: [stand, chair, tv, speaker, microwave, orphan] };
  assert.deepEqual(buildFurnitureHierarchy(plan).map(({ furniture, depth }) => [furniture.id, depth]), [
    ["stand", 0],
    ["tv", 1],
    ["speaker", 2],
    ["chair", 0],
    ["microwave", 0],
    ["orphan", 0],
  ]);
});

test("furniture positions snap to a 5cm grid", () => {
  assert.equal(snapToGrid(102.4), 100);
  assert.equal(snapToGrid(102.6), 105);
});

test("dimension guides move only perpendicular to their measured edge", () => {
  const horizontal = { from: { x: 10, y: 20 }, to: { x: 110, y: 20 } };
  const vertical = { from: { x: 30, y: 40 }, to: { x: 30, y: 140 } };
  moveDimensionGuide(horizontal, 12.5);
  moveDimensionGuide(vertical, -8);
  assert.deepEqual(horizontal, { from: { x: 10, y: 32.5 }, to: { x: 110, y: 32.5 } });
  assert.deepEqual(vertical, { from: { x: 22, y: 40 }, to: { x: 22, y: 140 } });
});

test("temporary measurement reports direct and axis distances and snaps to plan edges", () => {
  assert.deepEqual(measurementMetrics({ x: 10, y: 20 }, { x: 40, y: 60 }), { distance: 50, horizontal: 30, vertical: 40 });
  const sample = createSamplePlan();
  assert.deepEqual(snapMeasurementPoint({ x: 100, y: 64 }, sample, 10), { x: 100, y: 60 });
  assert.deepEqual(snapMeasurementPoint({ x: 400, y: 400 }, sample, 5), { x: 400, y: 400 });
});

test("a second pointer cancels measurement input and becomes a pinch gesture", () => {
  const renderer = Object.create(PlanRenderer.prototype);
  const previousMeasurement = { from: { x: 10, y: 20 }, to: { x: 30, y: 40 } };
  renderer.measurement = { from: { x: 90, y: 100 }, to: null };
  renderer.measurementPointer = {
    pointerId: 1,
    clientX: 100,
    clientY: 120,
    lastClientX: 105,
    lastClientY: 125,
    measurementBefore: previousMeasurement,
  };
  renderer.draggingMeasurement = null;
  renderer.pointers = new Map();
  let overlayUpdates = 0;
  renderer.updateMeasurementOverlay = () => { overlayUpdates += 1; };
  let prevented = false;
  let captured = null;
  const promoted = renderer.promoteMeasurementGestureToPinch({
    pointerId: 2,
    clientX: 220,
    clientY: 240,
    preventDefault: () => { prevented = true; },
    currentTarget: { setPointerCapture: (pointerId) => { captured = pointerId; } },
  });
  assert.equal(promoted, true);
  assert.equal(prevented, true);
  assert.equal(captured, 2);
  assert.deepEqual(renderer.measurement, previousMeasurement);
  assert.deepEqual([...renderer.pointers.entries()], [
    [1, { x: 105, y: 125, startX: 100, startY: 120, moved: false }],
    [2, { x: 220, y: 240, startX: 220, startY: 240, moved: false }],
  ]);
  assert.equal(renderer.measurementPointer, null);
  assert.equal(overlayUpdates, 1);
});

test("furniture placement reports wall clearances inside a room", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }] };
  const furniture = { x: 100, y: 50, widthCm: 140, depthCm: 80 };
  assert.equal(pointInPolygon({ x: 0, y: 200 }, room.points), true);
  assert.deepEqual(analyzeFurniturePlacement(furniture, room), {
    inside: true,
    clearances: { left: 100, right: 260, top: 50, bottom: 270 },
    boundaries: { left: 0, right: 500, top: 0, bottom: 400 },
  });
});

test("furniture can move directly to each room boundary without crossing a recessed wall", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }] };
  const furniture = { x: 40, y: 30, widthCm: 30, depthCm: 30 };
  assert.deepEqual(furnitureWallMove(furniture, room, "left"), { x: 0, y: 30, distance: 40 });
  assert.deepEqual(furnitureWallMove(furniture, room, "up"), { x: 40, y: 0, distance: 30 });
  const recessedRoom = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 120, y: 200 }, { x: 120, y: 100 }, { x: 0, y: 100 }] };
  const recessedFurniture = { x: 140, y: 80, widthCm: 30, depthCm: 30 };
  const left = furnitureWallMove(recessedFurniture, recessedRoom, "left");
  assert.ok(Math.abs(left.x - 120) < .01);
  assert.equal(left.y, 80);
});

test("direct furniture movement stops at the first furniture, equipment or partition wall", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 240 }, { x: 0, y: 240 }] };
  const moving = { id: "moving", name: "移動家具", x: 20, y: 40, widthCm: 30, depthCm: 30 };
  const other = { id: "other", name: "別の家具", x: 100, y: 35, widthCm: 40, depthCm: 50 };
  const feature = { id: "feature", name: "固定設備", x: 15, y: 120, width: 50, height: 30 };
  const plan = { furniture: [moving, other], features: [feature], walls: [] };
  const furnitureDestination = furnitureWallMove(moving, room, "right", plan);
  assert.ok(Math.abs(furnitureDestination.x - 70) < .01);
  assert.equal(furnitureDestination.y, 40);
  const featureDestination = furnitureWallMove(moving, room, "down", plan);
  assert.equal(featureDestination.x, 20);
  assert.ok(Math.abs(featureDestination.y - 90) < .01);

  const partitionPlan = {
    furniture: [moving], features: [],
    walls: [{ id: "partition", name: "間仕切り壁", from: { x: 160, y: 0 }, to: { x: 160, y: 240 }, thicknessCm: 10 }],
  };
  const wallDestination = furnitureWallMove(moving, room, "right", partitionPlan);
  assert.ok(Math.abs(wallDestination.x - 125) < .01);
  assert.equal(wallDestination.y, 40);
});

test("furniture placement warns when a corner is outside the room", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }] };
  const result = analyzeFurniturePlacement({ x: 250, y: 40, widthCm: 100, depthCm: 80 }, room);
  assert.equal(result.inside, false);
  assert.equal(result.clearances, null);
  assert.deepEqual(result.overflow, { left: 0, right: 50, top: 0, bottom: 0 });
  assert.equal(result.crossesIrregularBoundary, false);
});

test("diagonal furniture placement uses its rotated corners", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }] };
  const result = analyzeFurniturePlacement({ x: 0, y: 0, widthCm: 100, depthCm: 20, rotationEighthTurns: 1 }, room);
  assert.equal(result.inside, false);
  assert.ok(result.overflow.top > 32 && result.overflow.top < 33);
});

test("furniture placement distinguishes a recessed room boundary from outer-bounds overflow", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 180, y: 200 }, { x: 180, y: 100 }, { x: 0, y: 100 }] };
  const result = analyzeFurniturePlacement({ x: 150, y: 80, widthCm: 60, depthCm: 40 }, room);
  assert.equal(result.inside, false);
  assert.deepEqual(result.overflow, { left: 0, right: 0, top: 0, bottom: 0 });
  assert.equal(result.crossesIrregularBoundary, true);
});

test("furniture conflicts detect furniture, fixed features and partition walls", () => {
  const target = { id: "target", name: "テーブル", x: 100, y: 100, widthCm: 100, depthCm: 60 };
  const plan = {
    furniture: [target, { id: "other", name: "椅子", x: 180, y: 120, widthCm: 40, depthCm: 40 }],
    features: [{ id: "cabinet", name: "収納", x: 90, y: 80, width: 30, height: 40 }],
    walls: [{ id: "wall", name: "仕切り壁", from: { x: 150, y: 140 }, to: { x: 150, y: 220 }, thicknessCm: 10 }],
  };
  assert.equal(rectanglesOverlap(target, plan.furniture[1]), true);
  assert.deepEqual(analyzeFurnitureConflicts(target, plan).map((item) => item.name), ["椅子", "収納", "仕切り壁"]);
});

test("touching furniture edges are not treated as overlap", () => {
  assert.equal(rectanglesOverlap(
    { x: 0, y: 0, widthCm: 100, depthCm: 50 },
    { x: 100, y: 0, widthCm: 40, depthCm: 40 },
  ), false);
});

test("diagonal furniture collisions use rotated shapes instead of unrotated rectangles", () => {
  const diagonal = { x: 50, y: 90, widthCm: 100, depthCm: 20, rotationEighthTurns: 1 };
  const other = { x: 125, y: 125, widthCm: 10, depthCm: 10 };
  assert.equal(rectanglesOverlap({ ...diagonal, rotationEighthTurns: 0 }, other), false);
  assert.equal(rectanglesOverlap(diagonal, other), true);
});

test("polygon walls preserve a recessed counter niche in conflict checks", () => {
  const wall = [{ x: 164.5, y: 621 }, { x: 203, y: 621 }, { x: 203, y: 656 }, { x: 171.5, y: 656 }, { x: 171.5, y: 738.5 }, { x: 164.5, y: 738.5 }];
  assert.equal(rectangleIntersectsPolygon({ x: 180, y: 670, widthCm: 10, depthCm: 10 }, wall), false);
  assert.equal(rectangleIntersectsPolygon({ x: 165, y: 670, widthCm: 4, depthCm: 10 }, wall), true);
  assert.equal(rectangleIntersectsPolygon({ x: 180, y: 630, widthCm: 10, depthCm: 10 }, wall), true);
  assert.equal(rectangleIntersectsPolygon({ x: 171.5, y: 670, widthCm: 8, depthCm: 10 }, wall), false);
});

test("dimension groups are inferred from stable ids and allow explicit overrides", () => {
  assert.equal(getDimensionGroup({ id: "hall-left-2" }), "wet");
  assert.equal(getDimensionGroup({ id: "hall-right-1" }), "hall");
  assert.equal(getDimensionGroup({ id: "counter-depth" }), "ldk");
  assert.equal(getDimensionGroup({ id: "bedroom-side-window" }), "bedroom");
  assert.equal(getDimensionGroup({ id: "balcony-depth" }), "balcony");
  assert.equal(getDimensionGroup({ id: "custom", group: "ldk" }), "ldk");
});

test("furniture editing preserves its center while changing size", () => {
  const furniture = { id: "f1", name: "家具", roomId: "ldk", x: 100, y: 200, widthCm: 100, depthCm: 50 };
  updateFurniture(furniture, { name: "テーブル", roomId: "bedroom", widthCm: 140, depthCm: 80, heightCm: 72, furnitureKind: "dining" });
  assert.deepEqual(furniture, { id: "f1", name: "テーブル", furnitureKind: "dining", roomId: "bedroom", x: 80, y: 185, widthCm: 140, depthCm: 80, heightCm: 72 });
  updateFurniture(furniture, { name: "テーブル", roomId: "bedroom", widthCm: 140, depthCm: 80, heightCm: null, furnitureKind: null });
  assert.equal("heightCm" in furniture, false);
  assert.equal("furnitureKind" in furniture, false);
});

test("furniture kinds are explicit and presets provide editable two-person defaults", () => {
  assert.equal(inferFurnitureKind({ furnitureKind: "fridge", name: "家電" }), "fridge");
  assert.equal(inferFurnitureKind({ furnitureKind: "single-bed" }), "bed");
  assert.equal(inferFurnitureKind({ name: "冷蔵庫" }), "custom");
  assert.equal(inferFurnitureKind({ name: "電子レンジ" }), "custom");
  assert.deepEqual(FURNITURE_PRESETS.tv, { name: "テレビ", width: 110, depth: 25, height: 65 });
  assert.deepEqual(FURNITURE_PRESETS.bed, { name: "ダブルベッド", width: 140, depth: 195, height: 45 });
  assert.deepEqual(FURNITURE_PRESETS["single-bed"], { name: "シングルベッド", width: 97, depth: 195, height: 45 });
  assert.deepEqual(FURNITURE_PRESETS.cupboard, { name: "食器棚", width: 90, depth: 45, height: 180 });
  assert.deepEqual(FURNITURE_PRESETS.mirror, { name: "姿見", width: 40, depth: 45, height: 160 });
  assert.deepEqual(FURNITURE_PRESETS["drying-rack"], { name: "室内物干し", width: 85, depth: 50, height: 150 });
  assert.deepEqual(FURNITURE_PRESETS.plant, { name: "観葉植物", width: 50, depth: 50, height: 160 });
  assert.deepEqual(FURNITURE_PRESETS["counter-chair"], { name: "カウンターチェア", width: 41.5, depth: 45.5, height: 98 });
  assert.deepEqual(FURNITURE_PRESETS.dining, { name: "ダイニングテーブル（長方形）", width: 105, depth: 70, height: 70 });
  assert.deepEqual(FURNITURE_PRESETS["dining-round"], { name: "ダイニングテーブル（円形・楕円形）", width: 105, depth: 105, height: 70 });
  assert.deepEqual(FURNITURE_PRESETS.curtain, { name: "カーテンセット", width: 200, depth: 12, height: 200 });
  assert.equal(furnitureDisplayHeight({ furnitureKind: "fridge" }), 180);
  assert.equal(furnitureDisplayHeight({ name: "冷蔵庫" }), 35);
  assert.equal(furnitureDisplayHeight({ name: "洗濯機", heightCm: 106 }), 106);
  assert.deepEqual(resolveFurnitureVerticalRange({ furniture: [] }, { name: "ソファ", furnitureKind: "sofa" }), { bottomCm: 0, topCm: 80, schematic: true, support: null });
});

test("curtains attach to the indoor side of their selected window", () => {
  const curtain = { id: "curtain", name: "カーテン", furnitureKind: "curtain", openingId: "window", roomId: "room", x: 0, y: 0, widthCm: 220, depthCm: 12, heightCm: 210 };
  const plan = {
    rooms: [{ id: "room", name: "部屋", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] }],
    openings: [{ id: "window", name: "掃き出し窓", kind: "window", roomId: "room", from: { x: 50, y: 300 }, to: { x: 250, y: 300 }, widthCm: 200, sillHeightCm: 0, heightCm: 180 }],
    furniture: [curtain], features: [], walls: [],
  };
  assert.equal(curtainOpening(plan, curtain), plan.openings[0]);
  assert.equal(alignCurtainToOpening(plan, curtain), true);
  assert.deepEqual({ x: curtain.x, y: curtain.y, rotation: curtain.rotationEighthTurns }, { x: 40, y: 286, rotation: 0 });
  assert.deepEqual(resolveFurnitureVerticalRange(plan, curtain), { bottomCm: 0, topCm: 190, schematic: false, support: null });
  assert.deepEqual(analyzeFurnitureConflicts(curtain, plan), []);
  curtain.x = 999;
  alignCurtainsToOpenings(plan);
  assert.equal(curtain.x, 40);
});

test("curtains retain the full window angle in the 2D plan", () => {
  const room = { id: "room", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] };
  const curtain = { id: "curtain", furnitureKind: "curtain", openingId: "vertical", roomId: "room", widthCm: 180, depthCm: 12, heightCm: 190 };
  const plan = {
    rooms: [room], furniture: [curtain], features: [], walls: [],
    openings: [{ id: "vertical", kind: "window", roomId: "room", from: { x: 300, y: 60 }, to: { x: 300, y: 240 } }],
  };
  alignCurtainToOpening(plan, curtain);
  assert.equal(furnitureEighthTurns(curtain), 2);
  assert.equal(furnitureRotationDegrees(curtain), 90);
  assert.deepEqual(furnitureBounds(curtain), { left: 286, right: 298, top: 60, bottom: 240, width: 12, height: 180 });
  plan.openings[0] = { id: "vertical", kind: "window", roomId: "room", from: { x: 40, y: 40 }, to: { x: 160, y: 160 } };
  alignCurtainToOpening(plan, curtain);
  assert.equal(furnitureEighthTurns(curtain), 1);
  assert.equal(furnitureRotationDegrees(curtain), 45);
});

test("supported furniture aligns to its base and stacks measured heights", () => {
  const plan = {
    features: [{ id: "pan", name: "洗濯機パン", kind: "washer-pan", roomId: "washroom", x: 10, y: 20, width: 64, height: 64 }],
    furniture: [
      { id: "washer", name: "洗濯機", roomId: "washroom", supportId: "pan", x: 0, y: 0, widthCm: 60, depthCm: 60, heightCm: 105 },
      { id: "rack", name: "上置き棚", roomId: "washroom", supportId: "washer", x: 0, y: 0, widthCm: 55, depthCm: 45, heightCm: 30 },
    ],
  };
  alignFurnitureToSupport(plan, plan.furniture[0]);
  alignFurnitureToSupport(plan, plan.furniture[1]);
  assert.deepEqual({ x: plan.furniture[0].x, y: plan.furniture[0].y }, { x: 12, y: 22 });
  assert.deepEqual({ x: plan.furniture[0].supportOffsetX, y: plan.furniture[0].supportOffsetY }, { x: 2, y: 2 });
  plan.furniture[0].supportOffsetX = 99;
  plan.furniture[0].supportOffsetY = -10;
  alignFurnitureToSupport(plan, plan.furniture[0]);
  assert.deepEqual({ x: plan.furniture[0].x, y: plan.furniture[0].y }, { x: 73.9, y: 10 });
  assert.deepEqual({ fits: analyzeFurnitureSupportFit(plan.furniture[0], plan).fits, overlaps: analyzeFurnitureSupportFit(plan.furniture[0], plan).overlaps }, { fits: false, overlaps: true });
  assert.deepEqual(resolveFurnitureVerticalRange(plan, plan.furniture[0]), { bottomCm: 4, topCm: 109, schematic: true, support: plan.features[0] });
  assert.equal(resolveFurnitureVerticalRange(plan, plan.furniture[1]).bottomCm, 109);
  assert.deepEqual(analyzeFurnitureConflicts(plan.furniture[0], plan), []);
});

test("support fit reports movement range and oversized furniture overflow", () => {
  const stand = { id: "stand", name: "台", x: 100, y: 100, widthCm: 100, depthCm: 50, heightCm: 40 };
  const fitting = { id: "fitting", name: "家電", supportId: "stand", widthCm: 80, depthCm: 30, supportOffsetX: 15, supportOffsetY: 10 };
  const oversized = { id: "oversized", name: "大型家電", supportId: "stand", widthCm: 110, depthCm: 60 };
  const partiallySupported = { id: "partial", name: "一部上置き", supportId: "stand", x: 199.9, y: 149.9, widthCm: 80, depthCm: 30 };
  const detached = { id: "detached", name: "非接触", supportId: "stand", x: 200, y: 150, widthCm: 80, depthCm: 30 };
  const plan = { furniture: [stand, fitting, oversized, partiallySupported, detached] };
  alignFurnitureToSupport(plan, fitting);
  assert.deepEqual(analyzeFurnitureSupportFit(fitting, plan), {
    support: stand,
    supportWidthCm: 100,
    supportDepthCm: 50,
    fits: true,
    overlaps: true,
    overlapWidthCm: 80,
    overlapDepthCm: 30,
    overflowWidthCm: 0,
    overflowDepthCm: 0,
    overflowEdgesCm: { left: 0, right: 0, top: 0, bottom: 0 },
    movementWidthCm: 20,
    movementDepthCm: 20,
  });
  assert.deepEqual({ x: fitting.x, y: fitting.y, offsetX: fitting.supportOffsetX, offsetY: fitting.supportOffsetY }, { x: 115, y: 110, offsetX: 15, offsetY: 10 });
  const overflow = analyzeFurnitureSupportFit(oversized, plan);
  assert.deepEqual({ fits: overflow.fits, overlaps: overflow.overlaps, width: overflow.overflowWidthCm, depth: overflow.overflowDepthCm }, { fits: false, overlaps: true, width: 10, depth: 10 });
  assert.deepEqual(overflow.overflowEdgesCm, { left: 5, right: 5, top: 5, bottom: 5 });
  alignFurnitureToSupport(plan, oversized);
  assert.deepEqual({ x: oversized.x, y: oversized.y }, { x: 95, y: 95 });
  assert.deepEqual({ fits: analyzeFurnitureSupportFit(partiallySupported, plan).fits, overlaps: analyzeFurnitureSupportFit(partiallySupported, plan).overlaps }, { fits: false, overlaps: true });
  assert.deepEqual({ fits: analyzeFurnitureSupportFit(detached, plan).fits, overlaps: analyzeFurnitureSupportFit(detached, plan).overlaps }, { fits: false, overlaps: false });
});

test("fixed counter support uses its plan footprint instead of its physical depth metadata", () => {
  const counter = { id: "counter", name: "カウンター", kind: "counter", x: 171.5, y: 656, width: 31.5, height: 82.5, depthCm: 31.5 };
  const monitor = { id: "monitor", name: "モニター", supportId: "counter", x: 176.994, y: 675.865, widthCm: 20, depthCm: 50, rotationEighthTurns: 6 };
  const plan = { features: [counter], furniture: [monitor] };
  assert.deepEqual(supportSurfaceSize(counter), { widthCm: 31.5, depthCm: 82.5 });
  const fit = analyzeFurnitureSupportFit(monitor, plan);
  assert.equal(fit.fits, true);
  assert.deepEqual(fit.overflowEdgesCm, { left: 0, right: 0, top: 0, bottom: 0 });
});

test("supported furniture inherits a fixed feature's elevation wall", () => {
  const plan = {
    features: [{ id: "counter", name: "カウンター", roomId: "ldk", elevationWallId: "wall-a", elevationOffsetCm: 10, elevationWidthCm: 80 }],
    furniture: [{ id: "appliance", name: "家電", roomId: "ldk", supportId: "counter", widthCm: 50, depthCm: 40, heightCm: 30 }],
  };
  assert.deepEqual(resolveFurnitureElevationPlacement(plan, plan.furniture[0]), { wallId: "wall-a", offsetCm: 25, widthCm: 50 });
});

test("zoom keeps the content under the pinch midpoint fixed", () => {
  const transform = { x: 70, y: 50, scale: 0.5 };
  const previousAnchor = { x: 300, y: 400 };
  const nextAnchor = { x: 320, y: 410 };
  const contentPoint = {
    x: (previousAnchor.x - transform.x) / transform.scale,
    y: (previousAnchor.y - transform.y) / transform.scale,
  };
  const zoomed = zoomTransformAround(transform, previousAnchor, nextAnchor, 2);
  assert.equal(zoomed.scale, 1);
  assert.equal(zoomed.x + contentPoint.x * zoomed.scale, nextAnchor.x);
  assert.equal(zoomed.y + contentPoint.y * zoomed.scale, nextAnchor.y);
});

test("gesture movement distinguishes a pan from a tap", () => {
  assert.equal(gestureExceedsTapThreshold({ x: 10, y: 10 }, { x: 13, y: 13 }), false);
  assert.equal(gestureExceedsTapThreshold({ x: 10, y: 10 }, { x: 14, y: 13 }), true);
});

test("3D overview projection rotates the plan without changing its scale", () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 };
  const original = projectThreePoint({ x: 300, y: 150 }, bounds, 0, 0);
  const rotated = projectThreePoint({ x: 300, y: 150 }, bounds, 1, 0);
  assert.deepEqual(original, { x: 72, y: 36 });
  assert.deepEqual(rotated, { x: -72, y: 36 });
  assert.equal(projectThreePoint({ x: 300, y: 150 }, bounds, 0, 100).y, -26);
  assert.ok(projectThreeDepth({ x: 300, y: 150 }, bounds, 0, 100) > projectThreeDepth({ x: 300, y: 150 }, bounds, 0, 0));
});

test("3D viewport zoom stays inside the rendered scene", () => {
  assert.deepEqual(threeViewportBox(), { x: 0, y: 0, width: 900, height: 620, scale: 1, panX: 0, panY: 0 });
  assert.deepEqual(threeViewportBox({ scale: 2, panX: 999, panY: -999 }), { x: 450, y: 0, width: 450, height: 310, scale: 2, panX: 225, panY: -155 });
  assert.equal(threeViewportBox({ scale: 9 }).scale, 3);
});

test("WebGL pan is disabled at 100% and clamped to the zoomed scene", () => {
  assert.deepEqual(clampWebGLPan(120, -80, 1, 400, 300), { x: 0, y: 0 });
  assert.deepEqual(clampWebGLPan(500, -500, 2, 400, 300), { x: 200, y: -150 });
  assert.deepEqual(clampWebGLPan(75, 40, 2, 400, 300), { x: 75, y: 40 });
});

test("indoor viewpoints stay safely inside concave rooms at eye height", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 260 }, { x: 0, y: 260 }] };
  const viewpoint = roomInteriorViewpoint(room);
  assert.equal(viewpoint.y, 160);
  assert.ok(viewpoint.x >= 0 && viewpoint.x <= 300);
  assert.ok(viewpoint.z >= 0 && viewpoint.z <= 260);
  assert.ok(viewpoint.x <= 120 || viewpoint.z <= 100);
  assert.equal(clampIndoorPitch(Math.PI), Math.PI * .42);
  assert.equal(clampIndoorPitch(-Math.PI), -Math.PI * .42);
  const obstacle = { x: viewpoint.x - 20, y: viewpoint.z - 20, widthCm: 40, depthCm: 40 };
  const moved = roomInteriorViewpoint(room, 160, [obstacle]);
  assert.ok(Math.hypot(moved.x - viewpoint.x, moved.z - viewpoint.z) > 20);
  const preferred = roomInteriorViewpoint(room, 160, [], { x: 40, y: 40 });
  assert.ok(Math.hypot(preferred.x - 40, preferred.z - 40) < Math.hypot(viewpoint.x - 40, viewpoint.z - 40));
});

test("3D layers default to visible and can be independently hidden", () => {
  assert.equal(threeLayerEnabled("walls", {}), true);
  assert.equal(threeLayerEnabled("walls", { walls: false, furniture: true }), false);
  assert.equal(threeLayerEnabled("furniture", { walls: false, furniture: true }), true);
});

test("3D equipment and furniture expose their matching detail types", () => {
  assert.equal(threeSelectableType({ type: "feature" }), "feature");
  assert.equal(threeSelectableType({ type: "furniture" }), "furniture");
  assert.equal(threeSelectableType({ type: "wall" }), null);
});

test("3D room focus filters room-owned items and recalculates its bounds", () => {
  assert.equal(threeItemBelongsToRoom({ roomId: "ldk" }, "ldk"), true);
  assert.equal(threeItemBelongsToRoom({ roomIds: ["ldk", "hall"] }, "hall"), true);
  assert.equal(threeItemBelongsToRoom({ roomId: "bedroom" }, "ldk"), false);
  assert.deepEqual(threeRoomBounds([{ points: [{ x: 20, y: 30 }, { x: 220, y: 180 }] }]), { x: 20, y: 30, width: 200, height: 150 });
});

test("3D room focus retains unassigned partition walls inside the room", () => {
  const room = { id: "ldk", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }] };
  assert.equal(threeWallBelongsToRoom({ from: { x: 50, y: 50 }, to: { x: 150, y: 50 } }, room), true);
  assert.equal(threeWallBelongsToRoom({ from: { x: 250, y: 50 }, to: { x: 300, y: 50 } }, room), false);
  assert.equal(threeWallBelongsToRoom({ points: [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }] }, room), true);
});

test("3D boxes choose the two front faces after every rotation", () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 };
  const base = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }];
  const initial = visibleBoxSideIndexes(base.map((point) => projectThreePoint(point, bounds, 0)));
  const rotated = visibleBoxSideIndexes(base.map((point) => projectThreePoint(point, bounds, 1)));
  assert.equal(initial.length, 2);
  assert.equal(rotated.length, 2);
  assert.notDeepEqual(initial, rotated);
});

test("3D openings preserve measured door and window heights", () => {
  const from = { x: 0, y: 0 }; const to = { x: 100, y: 0 };
  assert.deepEqual(openingVerticalRange({ kind: "door", from, to, heightCm: 199 }), { bottomCm: 0, topCm: 199, isWindow: false });
  assert.deepEqual(openingVerticalRange({ kind: "window", from, to, heightCm: 96.5, sillHeightCm: 88 }), { bottomCm: 88, topCm: 184.5, isWindow: true });
  assert.equal(openingVerticalRange({ kind: "window", from, to }), null);
});

test("3D cutaway walls follow the selected viewing direction", () => {
  const room = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  assert.deepEqual(room.map((_, index) => isCutawayEdge(room, index, 0)), [false, false, true, true]);
  assert.deepEqual(room.map((_, index) => isCutawayEdge(room, index, 1)), [false, true, true, false]);
  assert.deepEqual(room.map((_, index) => isCutawayEdge(room, index, 2)), [true, true, false, false]);
  assert.deepEqual(room.map((_, index) => isCutawayEdge(room, index, 3)), [true, false, false, true]);
});

test("WebGL orbit angles choose the nearest cutaway direction", () => {
  assert.equal(yawToQuarterTurn(-Math.PI / 4), 0);
  assert.equal(yawToQuarterTurn(Math.PI / 4), 1);
  assert.equal(yawToQuarterTurn(Math.PI * 3 / 4), 2);
  assert.equal(yawToQuarterTurn(-Math.PI * 3 / 4), 3);
  assert.equal(yawToQuarterTurn(Math.PI * 7 / 4), 0);
});

test("WebGL fixed equipment uses its plan footprint instead of duplicate physical depth fields", () => {
  assert.deepEqual(
    threeItemFootprint({ width: 40, height: 90, depthCm: 40 }, "feature"),
    { width: 40, depth: 90 },
  );
  assert.deepEqual(
    threeItemFootprint({ widthCm: 100, depthCm: 55, height: 90 }, "furniture"),
    { width: 100, depth: 55 },
  );
});

test("WebGL opening assemblies use the expected number of panels", () => {
  assert.equal(openingPanelCount({ kind: "hinged-door" }), 1);
  assert.equal(openingPanelCount({ kind: "three-panel-sliding-door" }), 3);
  assert.equal(openingPanelCount({ kind: "window" }), 2);
  assert.equal(openingPanelCount({ kind: "floor-sliding-window" }), 2);
  assert.equal(openingPanelCount({ kind: "trapezoid-bay-window" }), 3);
});

test("trapezoid bay windows project outward from the room and retain measured depth", () => {
  const room = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }] };
  const opening = { kind: "trapezoid-bay-window", from: { x: 100, y: 20 }, to: { x: 100, y: 185 }, depthCm: 35.5 };
  const footprint = bayWindowFootprint(opening, room);
  assert.equal(footprint.length, 165);
  assert.equal(footprint.frontWidth, 118.8);
  assert.equal(footprint.depthCm, 35.5);
  assert.equal(footprint.outerFrom.x, 135.5);
  assert.equal(footprint.outerTo.x, 135.5);
  assert.equal(footprint.outerFrom.y, 43.1);
  assert.equal(footprint.outerTo.y, 161.9);
});

test("balcony exterior edges use a low schematic wall except at an opening", () => {
  const balcony = { id: "balcony", name: "Balcony" };
  assert.equal(roomEdgeWallHeight(balcony, false, 220), 110);
  assert.equal(roomEdgeWallHeight(balcony, true, 220), 220);
  assert.equal(roomEdgeWallHeight({ name: "室内" }, false, 220), 220);
  assert.equal(roomEdgeWallHeight({ name: "バルコニー", wallHeightCm: 95 }, false, 220), 95);
});

test("3D electrical plates reuse wall coordinates and measured center height", () => {
  const sample = createSamplePlan();
  const outlet = sample.plan.electrical.outlets[0];
  const placement = electricalThreePlacement(sample, outlet, "outlet");
  assert.deepEqual(placement.anchor, { x: 560, y: 150 });
  assert.equal(placement.centerHeightCm, 25);
  assert.equal(placement.widthCm, 8);
  assert.equal(Math.hypot(placement.tangent.x, placement.tangent.y), 1);
  assert.equal(Math.hypot(placement.normal.x, placement.normal.y), 1);
});

test("3D electrical plates choose the intended face of a custom counter wall", () => {
  const documentData = {
    plan: {
      rooms: [{ id: "ldk", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] }],
      elevationWalls: [
        { id: "counter-side", roomId: "ldk", from: { x: 100, y: 200 }, to: { x: 100, y: 100 }, lengthCm: 100 },
        { id: "counter-back", roomId: "ldk", from: { x: 60, y: 100 }, to: { x: 60, y: 200 }, lengthCm: 100 },
      ],
      features: [{ id: "counter", roomId: "ldk", elevationWallId: "counter-side", elevationOffsetCm: 0, elevationWidthCm: 60, x: 70, y: 130, width: 30, height: 60 }],
    },
  };
  const counterOutlet = { roomId: "ldk", elevationWallId: "counter-side", elevationCenterCm: 40, verticalPosition: { centerHeightCm: 100 } };
  const counterSwitch = { roomId: "ldk", elevationWallId: "counter-side", elevationCenterCm: 90, verticalPosition: { centerHeightCm: 120 } };
  const kitchenOutlet = { roomId: "ldk", elevationWallId: "counter-back", elevationCenterCm: 40, verticalPosition: { centerHeightCm: 104 } };
  const counterPlacement = electricalThreePlacement(documentData, counterOutlet);
  const counterNormal = counterPlacement.normal;
  const switchPlacement = electricalThreePlacement(documentData, counterSwitch, "switch");
  const kitchenNormal = electricalThreePlacement(documentData, kitchenOutlet).normal;
  assert.equal(counterPlacement.anchor.x, 70);
  assert.equal(counterNormal.x, 1);
  assert.equal(Math.abs(counterNormal.y), 0);
  assert.equal(switchPlacement.anchor.x, 100);
  assert.equal(switchPlacement.normal.x, 1);
  assert.equal(kitchenNormal.x, -1);
  assert.equal(Math.abs(kitchenNormal.y), 0);
});

test("3D wall faces are split around door and window openings", () => {
  assert.deepEqual(splitWallFace(300, 220, [{ u1: 100, u2: 180, z1: 0, z2: 199 }]), [
    { u1: 0, u2: 100, z1: 0, z2: 220 },
    { u1: 180, u2: 300, z1: 0, z2: 220 },
    { u1: 100, u2: 180, z1: 199, z2: 220 },
  ]);
  assert.equal(splitWallFace(300, 220, [{ u1: 80, u2: 180, z1: 88, z2: 184.5 }]).length, 4);
});

test("3D wall strips are subdivided for local depth sorting", () => {
  const rectangles = subdivideWallRectangle({ u1: 0, u2: 100, z1: 0, z2: 220 }, 35);
  assert.equal(rectangles.length, 3);
  assert.equal(rectangles[0].u1, 0);
  assert.equal(rectangles.at(-1).u2, 100);
  assert.deepEqual(rectangles.map(({ stripIndex, stripCount }) => [stripIndex, stripCount]), [[0, 3], [1, 3], [2, 3]]);
  assert.ok(rectangles.every((rectangle) => rectangle.u2 - rectangle.u1 <= 35.4));
  const segments = subdivideWallSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 35);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0].from, { x: 0, y: 0 });
  assert.deepEqual(segments.at(-1).to, { x: 100, y: 0 });
  assert.deepEqual(segments.map(({ stripIndex, stripCount }) => [stripIndex, stripCount]), [[0, 3], [1, 3], [2, 3]]);
  const rows = subdivideVerticalRange(0, 220, 55);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].z1, 0);
  assert.equal(rows.at(-1).z2, 220);
  const tiles = subdivideWallRectangleTiles({ u1: 0, u2: 100, z1: 0, z2: 220 }, 35, 55);
  assert.equal(tiles.length, 12);
});

test("3D equipment uses measured vertical ranges without making tall closets opaque", () => {
  assert.deepEqual(featureVerticalRange({ kind: "closet", derivedInteriorHeightCm: 232 }), { bottomCm: 0, topCm: 232, schematic: false });
  assert.deepEqual(featureVerticalRange({ kind: "cabinet", bottomHeightCm: 8, topHeightCm: 112 }), { bottomCm: 8, topCm: 112, schematic: false });
  assert.deepEqual(featureVerticalRange({ kind: "counter", undersideHeightCm: 90, derivedTopHeightCm: 91.5 }), { bottomCm: 90, topCm: 91.5, schematic: false });
  assert.deepEqual(featureVerticalRange({ kind: "washer-pan" }), { bottomCm: 0, topCm: 4, schematic: true });
  assert.deepEqual(featureVerticalRange({ kind: "bathtub" }), { bottomCm: 0, topCm: 55, schematic: true });
  assert.deepEqual(featureVerticalRange({ kind: "bathtub", rimHeightCm: 53 }), { bottomCm: 0, topCm: 53, schematic: false });
  assert.deepEqual(featureVerticalRange({ kind: "toilet" }), { bottomCm: 0, topCm: 75, schematic: true });
  assert.deepEqual(featureVerticalRange({ kind: "toilet", tankHeightCm: 72 }), { bottomCm: 0, topCm: 72, schematic: false });
  assert.deepEqual(featureVerticalRange({ kind: "unknown" }), { bottomCm: 0, topCm: 55, schematic: true });
});

test("all app element bindings exist in the HTML", () => {
  const appSource = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  const htmlSource = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const bindingBlock = appSource.match(/Object\.fromEntries\(\[([\s\S]*?)\]\.map/)[1];
  const boundIds = [...bindingBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const htmlIds = new Set([...htmlSource.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual(boundIds.filter((id) => !htmlIds.has(id)), []);
});

