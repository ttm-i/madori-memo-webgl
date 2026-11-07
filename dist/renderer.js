import { alignCurtainToOpening, alignFurnitureToSupport, analyzeFurnitureConflicts, analyzeFurniturePlacement, analyzeFurnitureSupportFit, buildKitchenComponentRects, findSupportItem, furnitureBounds, furnitureDescendantIds, furnitureRotationDegrees, furnitureWallMove, getDimensionGroup, getElectricalPlanPosition, inferFurnitureKind, moveDimensionGuide, normalizeFurnitureProductUrl, previewFurnitureCandidate, QUALITY_LABELS, rotateFurnitureStack, snapToGrid, translateFurnitureDescendants } from "./model.js?v=146";

const NS = "http://www.w3.org/2000/svg";

function svg(name, attributes = {}, text = "") {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function pointsValue(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function projectPointToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return { ...from };
  const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

export function measurementMetrics(from, to) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { distance: Math.hypot(dx, dy), horizontal: Math.abs(dx), vertical: Math.abs(dy) };
}

export function snapMeasurementPoint(point, documentData, thresholdCm = 15) {
  if (!documentData?.plan) return { ...point };
  const segments = [];
  const addPolygon = (points) => points?.forEach((from, index) => segments.push([from, points[(index + 1) % points.length]]));
  const addRectangle = (item, width, height) => {
    if (![item?.x, item?.y, width, height].every(Number.isFinite)) return;
    addPolygon([{ x: item.x, y: item.y }, { x: item.x + width, y: item.y }, { x: item.x + width, y: item.y + height }, { x: item.x, y: item.y + height }]);
  };
  for (const room of documentData.plan.rooms ?? []) addPolygon(room.points);
  for (const opening of documentData.plan.openings ?? []) if (opening.from && opening.to) segments.push([opening.from, opening.to]);
  for (const wall of documentData.plan.walls ?? []) {
    if (wall.from && wall.to) segments.push([wall.from, wall.to]);
    if (wall.points?.length >= 3) wall.points.forEach((point, index) => segments.push([point, wall.points[(index + 1) % wall.points.length]]));
  }
  for (const feature of documentData.plan.features ?? []) addRectangle(feature, feature.width, feature.height);
  for (const furniture of documentData.plan.furniture ?? []) addRectangle(furniture, furniture.widthCm, furniture.depthCm);
  let closest = { ...point };
  let closestDistance = thresholdCm;
  for (const [from, to] of segments) {
    const candidate = projectPointToSegment(point, from, to);
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function zoomTransformAround(transform, previousAnchor, nextAnchor, factor, minScale = 0.15, maxScale = 4) {
  const scale = Math.min(maxScale, Math.max(minScale, transform.scale * factor));
  const contentX = (previousAnchor.x - transform.x) / transform.scale;
  const contentY = (previousAnchor.y - transform.y) / transform.scale;
  return {
    x: nextAnchor.x - contentX * scale,
    y: nextAnchor.y - contentY * scale,
    scale,
  };
}

export function gestureExceedsTapThreshold(start, current, threshold = 5) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export class PlanRenderer {
  constructor(svgElement, layer, onSelect, onFurnitureEvent, onViewChange, onMeasurementChange) {
    this.svg = svgElement;
    this.layer = layer;
    this.onSelect = onSelect;
    this.onFurnitureEvent = onFurnitureEvent;
    this.onViewChange = onViewChange;
    this.onMeasurementChange = onMeasurementChange;
    this.transform = { x: 70, y: 50, scale: 0.78 };
    this.fitTransform = null;
    this.pointers = new Map();
    this.locked = true;
    this.snapEnabled = true;
    this.draggingFurniture = null;
    this.draggingDimension = null;
    this.draggingMeasurement = null;
    this.measurementPointer = null;
    this.measurementMode = false;
    this.measurement = { from: null, to: null };
    this.selectedFurnitureId = null;
    this.candidatePreview = null;
    this.dimensionGroups = null;
    this.selectableTypes = new Set(["room", "dimension", "equipment", "electrical", "furniture"]);
    this.suppressNextClick = false;
    this.selectionSuppressedUntil = 0;
    this.bindGestures();
  }

  suppressSelection(durationMs = 250) {
    this.suppressNextClick = true;
    this.selectionSuppressedUntil = Math.max(this.selectionSuppressedUntil, Date.now() + durationMs);
    setTimeout(() => {
      if (Date.now() >= this.selectionSuppressedUntil) this.suppressNextClick = false;
    }, durationMs + 10);
  }

  selectionIsSuppressed() {
    return this.suppressNextClick || Date.now() < this.selectionSuppressedUntil;
  }

  render(documentData) {
    this.layer.replaceChildren();
    this.document = documentData;
    if (!documentData) return;

    const defs = svg("defs");
    const pattern = svg("pattern", { id: "uncertainPattern", width: 12, height: 12, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    pattern.append(svg("rect", { width: 12, height: 12, fill: "#f2e5d5" }), svg("line", { x1: 0, y1: 0, x2: 0, y2: 12, stroke: "#c7854c", "stroke-width": 4 }));
    defs.append(pattern);
    this.layer.append(defs);

    const content = svg("g", { class: "plan-content" });
    const furnitureControlsLayer = svg("g", { class: "furniture-controls-layer", "aria-label": "選択中の家具の操作" });
    for (const room of documentData.plan.rooms) {
      const group = svg("g", { class: this.isSelectable("room") ? "" : "not-selectable", "data-id": room.id });
      const polygon = svg("polygon", { class: `room-shape ${room.uncertain ? "uncertain" : ""}`, points: pointsValue(room.points), fill: room.color ?? "#eee8d9" });
      polygon.addEventListener("click", () => { if (this.isSelectable("room")) this.onSelect("room", room); });
      group.append(polygon);
      room.points.forEach((from, index) => {
        if (room.nonWallEdges?.includes(index)) return;
        const to = room.points[(index + 1) % room.points.length];
        group.append(svg("line", {
          class: `room-boundary ${room.uncertain ? "uncertain" : ""}`,
          x1: from.x, y1: from.y, x2: to.x, y2: to.y,
        }));
      });
      if (room.label) {
        group.append(svg("text", { class: "room-label", x: room.label.x, y: room.label.y }, room.name));
        if (room.areaLabel) group.append(svg("text", { class: "room-area", x: room.label.x, y: room.label.y + 24 }, room.areaLabel));
      }
      content.append(group);
    }

    for (const wall of documentData.plan.walls ?? []) {
      if (wall.points?.length >= 3) {
        content.append(svg("polygon", {
          class: `wall-area ${wall.uncertain ? "uncertain" : ""}`,
          points: pointsValue(wall.points),
        }));
      } else if (wall.from && wall.to) {
        content.append(svg("line", {
          class: `wall-line ${wall.uncertain ? "uncertain" : ""}`,
          x1: wall.from.x,
          y1: wall.from.y,
          x2: wall.to.x,
          y2: wall.to.y,
          "stroke-width": wall.thicknessCm ?? 10,
        }));
      }
    }

    for (const opening of documentData.plan.openings ?? []) {
      const line = svg("line", { class: `opening-line ${opening.uncertain ? "uncertain" : ""} ${this.isSelectable("equipment") ? "" : "not-selectable"}`, x1: opening.from.x, y1: opening.from.y, x2: opening.to.x, y2: opening.to.y, tabindex: 0, role: "button", "aria-label": opening.name });
      line.addEventListener("click", () => { if (this.isSelectable("equipment")) this.onSelect("opening", opening); });
      content.append(line);
    }

    for (const feature of documentData.plan.features ?? []) {
      if (feature.kind === "column") continue;
      const placementUncertain = feature.placementQuality ? feature.placementQuality !== "confirmed" : Boolean(feature.uncertain);
      const group = svg("g", { class: `feature ${placementUncertain ? "placement-uncertain" : ""} ${this.isSelectable("equipment") ? "" : "not-selectable"}` });
      const rect = svg("rect", { class: `feature-shape ${placementUncertain ? "placement-uncertain" : ""}`, x: feature.x, y: feature.y, width: feature.width, height: feature.height, rx: 4, tabindex: 0, role: "button", "aria-label": feature.name });
      rect.addEventListener("click", () => { if (this.isSelectable("equipment")) this.onSelect("feature", feature); });
      group.append(rect);
      if (feature.kind === "kitchen") {
        for (const component of buildKitchenComponentRects(feature)) {
          group.append(svg("rect", {
            class: `kitchen-component kitchen-${component.kind}`,
            x: component.x, y: component.y, width: component.width, height: component.height, rx: 5,
          }));
          if (component.kind === "stove") {
            const burnerRadius = Math.max(3, Math.min(component.width, component.height) * 0.12);
            for (const xRatio of [0.3, 0.7]) for (const yRatio of [0.3, 0.7]) {
              group.append(svg("circle", {
                class: "kitchen-burner",
                cx: component.x + component.width * xRatio,
                cy: component.y + component.height * yRatio,
                r: burnerRadius,
              }));
            }
          }
          group.append(svg("text", {
            class: `kitchen-component-label kitchen-${component.kind}-label`,
            x: component.x + component.width / 2,
            y: component.y + component.height / 2,
          }, component.label));
        }
      }
      if (feature.shortLabel) {
        group.append(svg("text", {
          class: "feature-label",
          x: feature.x + feature.width / 2,
          y: feature.y + feature.height / 2,
        }, feature.shortLabel));
      }
      content.append(group);
    }

    const electricalItems = [
      ...(documentData.plan.electrical?.outlets ?? []).map((item) => ({ ...item, electricalType: "outlet" })),
      ...(documentData.plan.electrical?.switches ?? []).map((item) => ({ ...item, electricalType: "switch" })),
    ];
    for (const electrical of electricalItems) {
      const position = getElectricalPlanPosition(documentData, electrical);
      if (!position) continue;
      const selectable = this.isSelectable("electrical");
      const group = svg("g", {
        class: `electrical-marker electrical-${electrical.electricalType} ${selectable ? "" : "not-selectable"}`,
        tabindex: 0,
        role: "button",
        "aria-label": `${electrical.sourceLabel ?? ""} ${electrical.name}`.trim(),
      });
      if (position.anchor.x !== position.display.x || position.anchor.y !== position.display.y) {
        group.append(svg("line", {
          class: "electrical-leader",
          x1: position.anchor.x, y1: position.anchor.y,
          x2: position.display.x, y2: position.display.y,
        }));
      }
      group.append(svg("circle", { class: "electrical-hit", cx: position.display.x, cy: position.display.y, r: 25 }));
      if (electrical.electricalType === "outlet") {
        group.append(
          svg("circle", { class: "electrical-symbol", cx: position.display.x, cy: position.display.y, r: 12 }),
          svg("line", { class: "electrical-glyph", x1: position.display.x - 4, y1: position.display.y - 5, x2: position.display.x - 4, y2: position.display.y + 5 }),
          svg("line", { class: "electrical-glyph", x1: position.display.x + 4, y1: position.display.y - 5, x2: position.display.x + 4, y2: position.display.y + 5 }),
        );
      } else {
        group.append(
          svg("rect", { class: "electrical-symbol", x: position.display.x - 11, y: position.display.y - 11, width: 22, height: 22, rx: 4 }),
          svg("line", { class: "electrical-glyph", x1: position.display.x - 5, y1: position.display.y + 5, x2: position.display.x + 5, y2: position.display.y - 5 }),
        );
      }
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        if (selectable) this.onSelect(electrical.electricalType, electrical);
      });
      content.append(group);
    }

    for (const furniture of documentData.plan.furniture ?? []) {
      const room = documentData.plan.rooms.find((item) => item.id === furniture.roomId);
      const windowAttached = inferFurnitureKind(furniture) === "curtain" && Boolean(furniture.openingId);
      const placement = windowAttached ? { inside: true, boundaries: null, clearances: null } : analyzeFurniturePlacement(furniture, room);
      const conflicts = windowAttached ? [] : analyzeFurnitureConflicts(furniture, documentData.plan);
      const selected = furniture.id === this.selectedFurnitureId;
      const support = findSupportItem(documentData.plan, furniture.supportId);
      const supportFit = analyzeFurnitureSupportFit(furniture, documentData.plan);
      const supportedMovable = support && supportFit?.overlaps !== false;
      const supportOverflow = supportFit?.fits === false;
      const anotherFurnitureSelected = Boolean(this.selectedFurnitureId && !selected);
      const bounds = furnitureBounds(furniture);
      const rotationDegrees = furnitureRotationDegrees(furniture);
      const group = svg("g", { class: `furniture-group ${furniture.supportId ? "is-supported" : ""} ${furniture.supportId && !supportedMovable ? "is-supported-fixed" : ""} ${supportOverflow ? "support-overflow" : ""} ${this.isSelectable("furniture") ? "" : "not-selectable"} ${anotherFurnitureSelected ? "move-disabled" : ""} ${selected ? "selected" : ""} ${placement.inside ? "" : "out-of-room"} ${conflicts.length ? "has-conflict" : ""}`, "data-furniture-id": furniture.id, tabindex: 0, role: "button", "aria-label": `${furniture.name}${furniture.supportId ? " 上置き" : ""}${supportOverflow ? " 設置面からはみ出し" : ""}${placement.inside ? "" : " 部屋外"}${conflicts.length ? " 重なりあり" : ""}` });
      const centerX = furniture.x + furniture.widthCm / 2;
      const centerY = furniture.y + furniture.depthCm / 2;
      const rectAttributes = { class: "furniture-shape", x: furniture.x, y: furniture.y, width: furniture.widthCm, height: furniture.depthCm, rx: 5 };
      if (rotationDegrees) rectAttributes.transform = `rotate(${rotationDegrees} ${centerX} ${centerY})`;
      const rect = svg("rect", rectAttributes);
      const label = svg("text", { class: "furniture-label", x: furniture.x + furniture.widthCm / 2, y: furniture.y + furniture.depthCm / 2 - 7 }, furniture.name);
      const sizeLabel = svg("text", { class: "furniture-size-label", x: furniture.x + furniture.widthCm / 2, y: furniture.y + furniture.depthCm / 2 + 10 }, `${furniture.widthCm}×${furniture.depthCm}`);
      group.append(rect, label, sizeLabel);
      const supportLabel = furniture.supportId ? svg("text", { class: "furniture-support-label", x: centerX, y: bounds.bottom - 6 }, "上置き") : null;
      if (supportLabel) group.append(supportLabel);
      if (selected && placement.inside && placement.boundaries) {
        const guides = [
          [placement.boundaries.left, centerY, bounds.left, centerY, placement.clearances.left, "horizontal"],
          [bounds.right, centerY, placement.boundaries.right, centerY, placement.clearances.right, "horizontal"],
          [centerX, placement.boundaries.top, centerX, bounds.top, placement.clearances.top, "vertical"],
          [centerX, bounds.bottom, centerX, placement.boundaries.bottom, placement.clearances.bottom, "vertical"],
        ];
        for (const [x1, y1, x2, y2, distance, direction] of guides) {
          if (![x1, y1, x2, y2, distance].every(Number.isFinite)) continue;
          group.append(svg("line", { class: "placement-guide", x1, y1, x2, y2 }));
          group.append(svg("text", {
            class: "placement-distance",
            x: (x1 + x2) / 2 + (direction === "vertical" ? 12 : 0),
            y: (y1 + y2) / 2 + (direction === "horizontal" ? -6 : 0),
          }, `${Math.round(distance * 10) / 10} cm`));
        }
      }
      if (!placement.inside || conflicts.length || supportOverflow) {
        const reasons = [];
        if (!placement.inside) reasons.push("部屋外");
        if (supportOverflow) reasons.push("設置面超過");
        if (conflicts.length) reasons.push("重なり");
        const warning = `⚠ ${reasons.join("・")}`;
        group.append(svg("text", { class: "placement-warning", x: centerX, y: bounds.top - 10 }, warning));
      }
      let directControls = null;
      if (selected && !this.locked && !windowAttached) {
        const controls = svg("g", { class: "furniture-direct-controls", "aria-label": `${furniture.name}の直接操作` });
        directControls = controls;
        const operate = (action) => {
          const destination = action === "rotate" ? null : furnitureWallMove(furniture, room, action, documentData.plan);
          if (action !== "rotate" && (!destination || destination.distance < .05)) return;
          this.onFurnitureEvent?.("start");
          if (action === "rotate") rotateFurnitureStack(documentData.plan, furniture);
          else {
            const dx = destination.x - furniture.x;
            const dy = destination.y - furniture.y;
            furniture.x = destination.x;
            furniture.y = destination.y;
            translateFurnitureDescendants(documentData.plan, furniture.id, dx, dy);
          }
          this.onFurnitureEvent?.("commit");
        };
        const addControl = (action, glyph, x, y, labelText) => {
          const control = svg("g", { class: `furniture-direct-control action-${action}`, role: "button", tabindex: 0, "aria-label": labelText });
          control.append(
            svg("circle", { class: "furniture-direct-control-bg", cx: x, cy: y, r: 15 }),
            svg("text", { class: "furniture-direct-control-glyph", x, y }, glyph),
          );
          control.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
          control.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); operate(action); });
          control.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            operate(action);
          });
          controls.append(control);
        };
        addControl("rotate", "↻", bounds.right + 18, bounds.top - 18, "45度回転");
        if (!furniture.supportId && placement.inside) {
          addControl("left", "←", bounds.left - 20, centerY, "左の壁・設備・家具まで移動");
          addControl("right", "→", bounds.right + 20, centerY, "右の壁・設備・家具まで移動");
          addControl("up", "↑", centerX, bounds.top - 20, "上の壁・設備・家具まで移動");
          addControl("down", "↓", centerX, bounds.bottom + 20, "下の壁・設備・家具まで移動");
        }
        furnitureControlsLayer.append(controls);
      }
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        if (this.suppressNextClick) {
          this.suppressNextClick = false;
          return;
        }
        if (this.isSelectable("furniture")) this.onSelect("furniture", furniture);
      });
      group.addEventListener("pointerdown", (event) => {
        if (this.locked || !this.isSelectable("furniture")) return;
        event.stopPropagation();
        if (windowAttached || anotherFurnitureSelected || (furniture.supportId && !supportedMovable)) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const descendantGroups = [...furnitureDescendantIds(documentData.plan, furniture.id)]
          .map((id) => this.svg.querySelector(`.furniture-group[data-furniture-id="${id}"]`))
          .filter(Boolean);
        this.draggingFurniture = {
          furniture, rect, label, sizeLabel, supportLabel, support, rotationDegrees,
          directControls,
          descendantGroups,
          clientX: event.clientX, clientY: event.clientY,
          startX: furniture.x, startY: furniture.y,
          moved: false,
        };
      });
      content.append(group);
      if (this.candidatePreview?.furnitureId === furniture.id) {
        const preview = previewFurnitureCandidate(furniture, this.candidatePreview.candidate);
        if (preview) {
          if (inferFurnitureKind(preview) === "curtain") alignCurtainToOpening(documentData.plan, preview);
          const previewCenterX = preview.x + preview.widthCm / 2;
          const previewCenterY = preview.y + preview.depthCm / 2;
          const previewRotation = furnitureRotationDegrees(preview);
          const previewGroup = svg("g", { class: "furniture-candidate-preview", "aria-label": `${this.candidatePreview.label ?? "商品候補"}の配置プレビュー` });
          const previewRect = svg("rect", { x: preview.x, y: preview.y, width: preview.widthCm, height: preview.depthCm, rx: 6 });
          if (previewRotation) previewRect.setAttribute("transform", `rotate(${previewRotation} ${previewCenterX} ${previewCenterY})`);
          previewGroup.append(
            previewRect,
            svg("text", { x: previewCenterX, y: previewCenterY - 3 }, this.candidatePreview.label ?? "商品候補"),
            svg("text", { x: previewCenterX, y: previewCenterY + 11 }, `${this.candidatePreview.candidate.widthCm}×${this.candidatePreview.candidate.depthCm}×${this.candidatePreview.candidate.heightCm}`),
          );
          content.append(previewGroup);
        }
      }
    }

    for (const dimension of documentData.plan.dimensions ?? []) {
      const label = `${dimension.label ?? dimension.valueCm} cm`;
      const horizontal = Math.abs(dimension.to.x - dimension.from.x) >= Math.abs(dimension.to.y - dimension.from.y);
      const dimensionGroup = getDimensionGroup(dimension);
      const group = svg("g", {
        class: `dimension ${horizontal ? "horizontal" : "vertical"} ${dimension.uncertain ? "uncertain" : ""} ${this.dimensionGroups && !this.dimensionGroups.has(dimensionGroup) ? "scope-hidden" : ""} ${this.isSelectable("dimension") ? "" : "not-selectable"}`,
        "data-dimension-group": dimensionGroup,
        tabindex: 0,
        role: "button",
        "aria-label": `${dimension.name ?? "寸法"} ${label}`,
      });
      const dx = dimension.to.x - dimension.from.x;
      const dy = dimension.to.y - dimension.from.y;
      const segmentLength = Math.hypot(dx, dy) || 1;
      const normal = { x: -dy / segmentLength, y: dx / segmentLength };
      const capHalf = 6;
      const lineAttributes = { x1: dimension.from.x, y1: dimension.from.y, x2: dimension.to.x, y2: dimension.to.y };

      if (dimension.witnessFrom) group.append(svg("line", { class: "dimension-witness", x1: dimension.witnessFrom.x, y1: dimension.witnessFrom.y, x2: dimension.from.x, y2: dimension.from.y }));
      if (dimension.witnessTo) group.append(svg("line", { class: "dimension-witness", x1: dimension.witnessTo.x, y1: dimension.witnessTo.y, x2: dimension.to.x, y2: dimension.to.y }));
      group.append(svg("line", { class: "dimension-hit", ...lineAttributes }));
      group.append(svg("line", { class: "dimension-line", ...lineAttributes }));
      for (const point of [dimension.from, dimension.to]) {
        group.append(svg("line", {
          class: "dimension-cap",
          x1: point.x - normal.x * capHalf,
          y1: point.y - normal.y * capHalf,
          x2: point.x + normal.x * capHalf,
          y2: point.y + normal.y * capHalf,
        }));
      }
      const labelOffset = dimension.labelOffset ?? -14;
      const midX = (dimension.from.x + dimension.to.x) / 2 + normal.x * labelOffset;
      const midY = (dimension.from.y + dimension.to.y) / 2 + normal.y * labelOffset;
      group.append(svg("text", { class: "dimension-text", x: midX, y: midY }, label));
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        if (this.suppressNextClick) {
          this.suppressNextClick = false;
          return;
        }
        if (this.isSelectable("dimension")) this.onSelect("dimension", { ...dimension, name: dimension.name ?? "寸法" });
      });
      group.addEventListener("pointerdown", (event) => {
        if (this.locked || !this.isSelectable("dimension")) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        this.draggingDimension = { dimension, group, horizontal, clientX: event.clientX, clientY: event.clientY, offset: 0, moved: false };
      });
      content.append(group);
    }
    content.append(furnitureControlsLayer);
    if (this.measurementMode) content.append(this.createMeasurementOverlay());
    this.layer.append(content);
    this.applyTransform();
  }

  createMeasurementOverlay() {
    const group = svg("g", { class: "measurement-overlay" });
    const { from, to } = this.measurement;
    if (!from) return group;
    const lineLength = to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
    const cap = lineLength
      ? { x: -(to.y - from.y) / lineLength * 6, y: (to.x - from.x) / lineLength * 6 }
      : { x: 0, y: 6 };
    const makeHandle = (key, point) => {
      const handle = svg("g", {
        class: `measurement-handle measurement-handle-${key}`,
        role: "button",
        tabindex: 0,
        "aria-label": key === "from" ? "測定の始点" : "測定の終点",
      });
      handle.append(
        svg("circle", { class: "measurement-handle-hit", cx: point.x, cy: point.y, r: 24 }),
        svg("line", {
          class: "measurement-handle-cap",
          x1: point.x - cap.x,
          y1: point.y - cap.y,
          x2: point.x + cap.x,
          y2: point.y + cap.y,
        }),
        svg("circle", { class: "measurement-handle-dot", cx: point.x, cy: point.y, r: 1.8 }),
      );
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.promoteMeasurementGestureToPinch(event)) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        this.draggingMeasurement = {
          key,
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          measurementBefore: structuredClone(this.measurement),
        };
      });
      return handle;
    };
    if (to) {
      const metrics = measurementMetrics(from, to);
      const corner = { x: to.x, y: from.y };
      group.append(
        svg("path", { class: "measurement-axis", d: `M ${from.x} ${from.y} L ${corner.x} ${corner.y} L ${to.x} ${to.y}` }),
        svg("line", { class: "measurement-line", x1: from.x, y1: from.y, x2: to.x, y2: to.y }),
      );
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      group.append(
        svg("text", { class: "measurement-distance", x: midX, y: midY - 12 }, `${Math.round(metrics.distance * 10) / 10} cm`),
        svg("text", { class: "measurement-breakdown", x: midX, y: midY + 8 }, `横 ${Math.round(metrics.horizontal * 10) / 10}・縦 ${Math.round(metrics.vertical * 10) / 10}`),
      );
    }
    group.append(makeHandle("from", from));
    if (to) group.append(makeHandle("to", to));
    return group;
  }

  updateMeasurementOverlay() {
    const content = this.layer.querySelector(".plan-content");
    if (!content) return;
    content.querySelector(".measurement-overlay")?.remove();
    if (this.measurementMode) content.append(this.createMeasurementOverlay());
    this.onMeasurementChange?.(structuredClone(this.measurement));
  }

  setLocked(value) {
    this.locked = value;
    this.svg.classList.toggle("editing", !value);
  }
  setRoomLabelsVisible(value) { this.svg.classList.toggle("room-labels-hidden", !value); }
  setDimensionsVisible(value) { this.svg.classList.toggle("dimensions-hidden", !value); }
  setFeaturesVisible(value) { this.svg.classList.toggle("features-hidden", !value); }
  setFurnitureVisible(value) { this.svg.classList.toggle("furniture-hidden", !value); }
  setElectricalVisible(value) { this.svg.classList.toggle("electrical-hidden", !value); }
  setMeasurementMode(value) {
    this.measurementMode = value;
    if (!value) this.measurement = { from: null, to: null };
    this.svg.classList.toggle("measuring", value);
    if (this.document) this.render(this.document);
    this.onMeasurementChange?.(structuredClone(this.measurement));
  }
  clearMeasurement() {
    this.measurement = { from: null, to: null };
    this.updateMeasurementOverlay();
  }
  setSnapEnabled(value) { this.snapEnabled = value; }
  setDimensionGroups(groups) {
    this.dimensionGroups = groups == null ? null : new Set(groups);
    this.layer.querySelectorAll(".dimension").forEach((group) => {
      group.classList.toggle("scope-hidden", this.dimensionGroups != null && !this.dimensionGroups.has(group.dataset.dimensionGroup));
    });
  }
  setSelectableTypes(types) {
    this.selectableTypes = new Set(types);
    if (this.document) this.render(this.document);
  }
  isSelectable(type) { return !this.measurementMode && this.selectableTypes.has(type); }
  setSelectedFurniture(id) {
    this.selectedFurnitureId = id;
    if (this.document) this.render(this.document);
  }
  setCandidatePreview(preview) {
    this.candidatePreview = preview;
    if (this.document) this.render(this.document);
  }

  focusFurniture(id) {
    if (!this.document) return false;
    const furniture = this.document.plan.furniture?.find((item) => item.id === id);
    if (!furniture) return false;
    const viewport = this.svg.viewBox.baseVal;
    const fitScale = this.fitTransform?.scale ?? this.transform.scale;
    const scale = Math.min(3, Math.max(this.transform.scale, fitScale * 1.75));
    const centerX = furniture.x + furniture.widthCm / 2;
    const centerY = furniture.y + furniture.depthCm / 2;
    this.transform.scale = scale;
    this.transform.x = viewport.x + viewport.width / 2 - centerX * scale;
    this.transform.y = viewport.y + viewport.height / 2 - centerY * scale;
    this.applyTransform();
    return true;
  }

  fit() {
    if (!this.document) return;
    const bounds = this.document.plan.bounds;
    const viewport = this.svg.viewBox.baseVal;
    const scale = Math.min((viewport.width - 90) / bounds.width, (viewport.height - 90) / bounds.height);
    this.transform.scale = Math.max(0.15, scale);
    this.transform.x = (viewport.width - bounds.width * scale) / 2 - bounds.x * scale;
    this.transform.y = (viewport.height - bounds.height * scale) / 2 - bounds.y * scale;
    this.fitTransform = { ...this.transform };
    this.applyTransform();
  }

  applyTransform() {
    const { x, y, scale } = this.transform;
    this.layer.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
    const changed = this.fitTransform != null && (
      Math.abs(x - this.fitTransform.x) > 0.5
      || Math.abs(y - this.fitTransform.y) > 0.5
      || Math.abs(scale - this.fitTransform.scale) > 0.001
    );
    this.onViewChange?.(changed);
  }

  measurementPointFromEvent(event) {
    const rect = this.svg.getBoundingClientRect();
    const viewport = this.svg.viewBox.baseVal;
    const viewportPoint = {
      x: viewport.x + (event.clientX - rect.left) * viewport.width / rect.width,
      y: viewport.y + (event.clientY - rect.top) * viewport.height / rect.height,
    };
    const point = {
      x: (viewportPoint.x - this.transform.x) / this.transform.scale,
      y: (viewportPoint.y - this.transform.y) / this.transform.scale,
    };
    const thresholdCm = 14 * viewport.width / rect.width / this.transform.scale;
    return snapMeasurementPoint(point, this.document, thresholdCm);
  }

  promoteMeasurementGestureToPinch(event) {
    const active = this.measurementPointer ?? this.draggingMeasurement;
    if (!active || active.pointerId === event.pointerId) return false;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this.measurement = structuredClone(active.measurementBefore ?? this.measurement);
    this.pointers.clear();
    this.pointers.set(active.pointerId, {
      x: active.lastClientX ?? active.clientX,
      y: active.lastClientY ?? active.clientY,
      startX: active.clientX,
      startY: active.clientY,
      moved: false,
    });
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false });
    this.measurementPointer = null;
    this.draggingMeasurement = null;
    this.updateMeasurementOverlay();
    return true;
  }

  bindGestures() {
    this.svg.addEventListener("click", (event) => {
      if (!this.selectionIsSuppressed()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressNextClick = false;
      this.selectionSuppressedUntil = 0;
    }, true);
    this.svg.addEventListener("click", (event) => {
      const selectionTarget = event.target.closest?.(".room-shape,.opening-line,.feature,.electrical-marker,.furniture-group,.dimension,.measurement-handle");
      if (!selectionTarget || selectionTarget.closest?.(".not-selectable")) this.onSelect?.(null, null);
    });
    this.svg.addEventListener("pointerdown", (event) => {
      if (this.measurementMode) {
        event.preventDefault();
        if (this.promoteMeasurementGestureToPinch(event)) return;
        event.target.setPointerCapture?.(event.pointerId);
        const measurementBefore = structuredClone(this.measurement);
        const point = this.measurementPointFromEvent(event);
        const startsNew = !this.measurement.from || this.measurement.to;
        if (startsNew) this.measurement = { from: point, to: null };
        this.measurementPointer = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          action: startsNew ? "from" : "to",
          moved: false,
          measurementBefore,
        };
        this.updateMeasurementOverlay();
        return;
      }
      event.target.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false });
    });
    this.svg.addEventListener("pointermove", (event) => {
      if (this.draggingMeasurement?.pointerId === event.pointerId) {
        event.preventDefault();
        this.draggingMeasurement.lastClientX = event.clientX;
        this.draggingMeasurement.lastClientY = event.clientY;
        this.measurement[this.draggingMeasurement.key] = this.measurementPointFromEvent(event);
        this.updateMeasurementOverlay();
        return;
      }
      if (this.measurementPointer?.pointerId === event.pointerId) {
        event.preventDefault();
        const pointer = this.measurementPointer;
        pointer.lastClientX = event.clientX;
        pointer.lastClientY = event.clientY;
        if (!pointer.moved && Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) >= 4) pointer.moved = true;
        if (pointer.moved) {
          this.measurement.to = this.measurementPointFromEvent(event);
          this.updateMeasurementOverlay();
        }
        return;
      }
      if (this.draggingFurniture) {
        const drag = this.draggingFurniture;
        if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
        if (!drag.moved) {
          drag.moved = true;
          this.onFurnitureEvent?.("start");
        }
        const rect = this.svg.getBoundingClientRect();
        const viewport = this.svg.viewBox.baseVal;
        const dx = (event.clientX - drag.clientX) * viewport.width / rect.width / this.transform.scale;
        const dy = (event.clientY - drag.clientY) * viewport.height / rect.height / this.transform.scale;
        const previousX = drag.furniture.x;
        const previousY = drag.furniture.y;
        if (drag.support) {
          drag.furniture.x = drag.startX + dx;
          drag.furniture.y = drag.startY + dy;
          drag.furniture.supportOffsetX = drag.furniture.x - drag.support.x;
          drag.furniture.supportOffsetY = drag.furniture.y - drag.support.y;
          alignFurnitureToSupport(this.document.plan, drag.furniture);
        } else {
          drag.furniture.x = this.snapEnabled ? snapToGrid(drag.startX + dx) : drag.startX + dx;
          drag.furniture.y = this.snapEnabled ? snapToGrid(drag.startY + dy) : drag.startY + dy;
        }
        translateFurnitureDescendants(this.document.plan, drag.furniture.id, drag.furniture.x - previousX, drag.furniture.y - previousY);
        const stackDeltaX = drag.furniture.x - drag.startX;
        const stackDeltaY = drag.furniture.y - drag.startY;
        for (const descendantGroup of drag.descendantGroups) descendantGroup.setAttribute("transform", `translate(${stackDeltaX} ${stackDeltaY})`);
        drag.directControls?.setAttribute("transform", `translate(${stackDeltaX} ${stackDeltaY})`);
        drag.rect.setAttribute("x", drag.furniture.x);
        drag.rect.setAttribute("y", drag.furniture.y);
        if (drag.rotationDegrees) drag.rect.setAttribute("transform", `rotate(${drag.rotationDegrees} ${drag.furniture.x + drag.furniture.widthCm / 2} ${drag.furniture.y + drag.furniture.depthCm / 2})`);
        drag.label.setAttribute("x", drag.furniture.x + drag.furniture.widthCm / 2);
        drag.label.setAttribute("y", drag.furniture.y + drag.furniture.depthCm / 2 - 7);
        drag.sizeLabel.setAttribute("x", drag.furniture.x + drag.furniture.widthCm / 2);
        drag.sizeLabel.setAttribute("y", drag.furniture.y + drag.furniture.depthCm / 2 + 10);
        if (drag.supportLabel) {
          const dragBounds = furnitureBounds(drag.furniture);
          drag.supportLabel.setAttribute("x", drag.furniture.x + drag.furniture.widthCm / 2);
          drag.supportLabel.setAttribute("y", dragBounds.bottom - 6);
        }
        return;
      }
      if (this.draggingDimension) {
        const drag = this.draggingDimension;
        if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
        if (!drag.moved) {
          drag.moved = true;
          this.onFurnitureEvent?.("start");
        }
        const rect = this.svg.getBoundingClientRect();
        const viewport = this.svg.viewBox.baseVal;
        const dx = (event.clientX - drag.clientX) * viewport.width / rect.width / this.transform.scale;
        const dy = (event.clientY - drag.clientY) * viewport.height / rect.height / this.transform.scale;
        drag.offset = drag.horizontal ? dy : dx;
        drag.group.setAttribute("transform", drag.horizontal ? `translate(0 ${drag.offset})` : `translate(${drag.offset} 0)`);
        return;
      }
      if (!this.pointers.has(event.pointerId)) return;
      const previous = this.pointers.get(event.pointerId);
      const previousValues = [...this.pointers.values()];
      this.pointers.set(event.pointerId, {
        ...previous,
        x: event.clientX,
        y: event.clientY,
        moved: previous.moved || gestureExceedsTapThreshold(
          { x: previous.startX, y: previous.startY },
          { x: event.clientX, y: event.clientY },
        ),
      });
      const values = [...this.pointers.values()];
      if (values.length === 1) {
        const rect = this.svg.getBoundingClientRect();
        const viewport = this.svg.viewBox.baseVal;
        this.transform.x += (event.clientX - previous.x) * viewport.width / rect.width;
        this.transform.y += (event.clientY - previous.y) * viewport.height / rect.height;
      } else if (values.length === 2) {
        const rect = this.svg.getBoundingClientRect();
        const viewport = this.svg.viewBox.baseVal;
        const toViewportPoint = (point) => ({
          x: viewport.x + (point.x - rect.left) * viewport.width / rect.width,
          y: viewport.y + (point.y - rect.top) * viewport.height / rect.height,
        });
        const previousDistance = Math.hypot(previousValues[1].x - previousValues[0].x, previousValues[1].y - previousValues[0].y);
        const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
        if (previousDistance > 0) {
          const previousMidpoint = toViewportPoint({
            x: (previousValues[0].x + previousValues[1].x) / 2,
            y: (previousValues[0].y + previousValues[1].y) / 2,
          });
          const midpoint = toViewportPoint({
            x: (values[0].x + values[1].x) / 2,
            y: (values[0].y + values[1].y) / 2,
          });
          this.transform = zoomTransformAround(this.transform, previousMidpoint, midpoint, distance / previousDistance);
        }
      }
      this.applyTransform();
    });
    const release = (event) => {
      if (this.draggingMeasurement?.pointerId === event.pointerId) {
        this.draggingMeasurement = null;
        this.updateMeasurementOverlay();
        return;
      }
      if (this.measurementPointer?.pointerId === event.pointerId) {
        const pointer = this.measurementPointer;
        if (pointer.action === "to" && !pointer.moved) this.measurement.to = this.measurementPointFromEvent(event);
        this.measurementPointer = null;
        this.updateMeasurementOverlay();
        return;
      }
      if (this.draggingFurniture) {
        const moved = this.draggingFurniture.moved;
        this.draggingFurniture = null;
        if (moved) {
          this.suppressSelection();
          this.onFurnitureEvent?.("commit");
        }
        return;
      }
      if (this.draggingDimension) {
        const drag = this.draggingDimension;
        this.draggingDimension = null;
        if (!drag.moved) return;
        this.suppressSelection();
        moveDimensionGuide(drag.dimension, Math.round(drag.offset * 10) / 10);
        this.render(this.document);
        this.onFurnitureEvent?.("commit");
        return;
      }
      const pointer = this.pointers.get(event.pointerId);
      this.pointers.delete(event.pointerId);
      if (pointer?.moved) this.suppressSelection();
    };
    this.svg.addEventListener("pointerup", release);
    this.svg.addEventListener("pointercancel", release);
    this.svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : .92;
      const rect = this.svg.getBoundingClientRect();
      const viewport = this.svg.viewBox.baseVal;
      const anchor = {
        x: viewport.x + (event.clientX - rect.left) * viewport.width / rect.width,
        y: viewport.y + (event.clientY - rect.top) * viewport.height / rect.height,
      };
      this.transform = zoomTransformAround(this.transform, anchor, anchor, factor);
      this.applyTransform();
    }, { passive: false });
  }
}

export function detailMarkup(type, item) {
  const escapeHTML = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const values = [];
  if (type === "room") {
    if (item.areaLabel) values.push(["面積", item.areaLabel]);
    values.push(["頂点", `${item.points.length}点`]);
  } else if (type === "dimension") {
    values.push(["寸法", `${item.label ?? item.valueCm} cm`]);
  } else if (type === "outlet" || type === "switch") {
    const referenceLabels = {
      "left-side-wall": "左側の壁",
      "right-side-wall": "右側の壁",
      "wall-right-edge": "壁の右端",
      "wall-start": "壁の始点",
      "ldk-right-column": "LDK柱型",
      "counter-right-edge": "カウンター右端",
      "washroom-door": "洗面所ドア",
      "ldk-door": "LDKドア",
    };
    if (item.roomName) values.push(["場所", item.roomName]);
    if (item.sourceLabel) values.push(["図面記号", item.sourceLabel]);
    values.push(["種類", type === "outlet" ? "コンセント" : "スイッチ"]);
    if (type === "outlet" && Number.isFinite(item.receptacleCount)) values.push(["口数", `${item.receptacleCount}口`]);
    const centerHeight = item.verticalPosition?.centerHeightCm ?? item.verticalPosition?.derivedCenterHeightCm;
    if (Number.isFinite(centerHeight)) values.push(["中心高さ", `床から ${centerHeight} cm`]);
    if (item.horizontalPosition?.reference) values.push(["水平基準", referenceLabels[item.horizontalPosition.reference] ?? item.horizontalPosition.reference]);
    if (Number.isFinite(item.horizontalPosition?.offsetCm)) values.push(["基準から", `${item.horizontalPosition.offsetCm} cm`]);
    values.push(["測定点", "プレート中心"]);
  } else {
    if (item.kind === "kitchen") {
      if (Number.isFinite(item.overallWidthCm) && Number.isFinite(item.overallDepthCm)) values.push(["キッチン全体", `${item.overallWidthCm} × ${item.overallDepthCm} cm`]);
      if (Number.isFinite(item.worktopHeightCm)) values.push(["天板高さ", `床から ${item.worktopHeightCm} cm`]);
      if (Number.isFinite(item.horizontalSegmentsCm?.sinkWidth) && Number.isFinite(item.depthDetailsCm?.sinkDepth)) values.push(["シンク", `${item.horizontalSegmentsCm.sinkWidth} × ${item.depthDetailsCm.sinkDepth} cm`]);
      if (Number.isFinite(item.horizontalSegmentsCm?.stoveWidth) && Number.isFinite(item.depthDetailsCm?.stoveDepth)) values.push(["コンロ", `${item.horizontalSegmentsCm.stoveWidth} × ${item.depthDetailsCm.stoveDepth} cm`]);
      if (Number.isFinite(item.horizontalSegmentsCm?.sinkToStove)) values.push(["シンク～コンロ", `${item.horizontalSegmentsCm.sinkToStove} cm`]);
      if (Number.isFinite(item.horizontalSegmentsCm?.stoveToLeftEdge)) values.push(["左端～コンロ", `${item.horizontalSegmentsCm.stoveToLeftEdge} cm`]);
      if (Number.isFinite(item.horizontalSegmentsCm?.rightEdgeToSink)) values.push(["シンク～右端", `${item.horizontalSegmentsCm.rightEdgeToSink} cm`]);
    } else {
      if (Number.isFinite(item.widthCm)) values.push(["幅", `${item.widthCm} cm`]);
      if (Number.isFinite(item.depthCm)) values.push(["奥行", `${item.depthCm} cm`]);
      if (type === "furniture") values.push(["高さ", Number.isFinite(item.heightCm) ? `${item.heightCm} cm` : "未登録"]);
      if (type === "furniture") values.push(["税込価格", Number.isInteger(item.priceYen) ? `${item.priceYen.toLocaleString("ja-JP")}円` : "未登録"]);
      if (!Number.isFinite(item.widthCm) && Number.isFinite(item.width)) values.push(["表示幅", `${item.width} cm`]);
      if (!Number.isFinite(item.depthCm) && Number.isFinite(item.height)) values.push(["表示奥行", `${item.height} cm`]);
    }
    if (item.kind && item.kind !== "kitchen") values.push(["種類", item.kind]);
    if (type === "furniture" && item.roomName) values.push(["配置先", item.roomName]);
    if (type === "furniture" && item.openingName) values.push(["取り付け窓", item.openingName]);
    if (type === "furniture" && item.furnitureKind === "curtain") {
      const colorLabels = { greige: "グレージュ", ivory: "アイボリー", gray: "グレー", blue: "ブルー", green: "グリーン", brown: "ブラウン" };
      values.push(["構成", "メイン＋レース＋レール"], ["メイン色", colorLabels[item.curtainColor] ?? "グレージュ"]);
    }
    if (type === "furniture" && item.supportName) values.push(["設置面", `${item.supportName}の上`]);
    if (type === "furniture" && item.supportFit) {
      values.push(["設置面寸法", `${item.supportFit.supportWidthCm} × ${item.supportFit.supportDepthCm} cm`]);
      if (item.supportFit.fits) values.push(["面内の移動範囲", `横 ${item.supportFit.movementWidthCm} cm・奥行 ${item.supportFit.movementDepthCm} cm`]);
    }
    if (type === "furniture" && item.vertical?.bottomCm > 0) values.push(["床から底面", `${item.vertical.bottomCm} cm`]);
    if (type === "furniture" && item.deliveryDimensions) {
      const dimensions = item.deliveryDimensions;
      values.push(["搬入時の3辺", `${dimensions.sideACm} × ${dimensions.sideBCm} × ${dimensions.sideCCm} cm`]);
      values.push(["搬入寸法の対象", dimensions.basis === "body" ? "本体（梱包なし）" : "梱包状態"]);
    }
    if (type === "furniture" && item.placement?.inside) {
      const labels = { left: "左の壁まで", right: "右の壁まで", top: "上の壁まで", bottom: "下の壁まで" };
      for (const [key, label] of Object.entries(labels)) {
        const value = item.placement.clearances?.[key];
        if (Number.isFinite(value)) values.push([label, `${Math.round(value * 10) / 10} cm`]);
      }
    }
  }
  const quality = item.quality ?? (item.uncertain ? "unmeasured" : "measured");
  const safeQuality = escapeHTML(QUALITY_LABELS[quality] ?? quality);
  const list = values.length ? `<dl class="detail-list">${values.map(([key, value]) => `<dt>${escapeHTML(key)}</dt><dd>${escapeHTML(value)}</dd>`).join("")}</dl>` : "<p>詳細値はまだ登録されていません。</p>";
  const warnings = [];
  if (type === "furniture" && item.placement && !item.placement.inside) {
    const edgeLabels = { left: "左", right: "右", top: "上", bottom: "下" };
    const overflow = Object.entries(item.placement.overflow ?? {})
      .filter(([, value]) => value > .001)
      .map(([edge, value]) => `${edgeLabels[edge]} ${Math.round(value * 10) / 10} cm`);
    if (item.placement.crossesIrregularBoundary) overflow.push("部屋形状の境界を通過");
    warnings.push(overflow.length
      ? `指定した部屋から家具がはみ出しています。超過: ${overflow.join("・")}`
      : "指定した部屋から家具がはみ出しています。");
  }
  if (type === "furniture" && item.supportFit?.fits === false) {
    const edgeLabels = { left: "左", right: "右", top: "上", bottom: "下" };
    const overflow = Object.entries(item.supportFit.overflowEdgesCm ?? {})
      .filter(([, value]) => value > .001)
      .map(([edge, value]) => `${edgeLabels[edge]} ${Math.round(value * 10) / 10} cm`);
    if (!overflow.length) {
      if (item.supportFit.overflowWidthCm > .001) overflow.push(`幅 ${item.supportFit.overflowWidthCm} cm`);
      if (item.supportFit.overflowDepthCm > .001) overflow.push(`奥行 ${item.supportFit.overflowDepthCm} cm`);
    }
    warnings.push(`設置面からの超過: ${overflow.join("・")}（設置面と重なる範囲で移動可能）`);
  }
  if (type === "furniture" && item.conflicts?.length) warnings.push(`重なり: ${item.conflicts.map((conflict) => escapeHTML(conflict.name)).join("、")}`);
  const warning = warnings.length ? `<p class="placement-alert">${warnings.join("<br>")}</p>` : "";
  const productUrl = type === "furniture" ? normalizeFurnitureProductUrl(item.productUrl) : null;
  const productLink = productUrl
    ? `<a class="detail-product-link" href="${escapeHTML(productUrl)}" target="_blank" rel="noopener noreferrer">商品ページを開く <span aria-hidden="true">↗</span></a>`
    : "";
  const qualityTags = type === "feature"
    ? `<div class="quality-tags"><span class="quality-tag ${escapeHTML(quality)}">寸法: ${safeQuality}</span><span class="quality-tag placement ${escapeHTML(item.placementQuality ?? (item.uncertain ? "approximate" : "confirmed"))}">配置: ${item.placementQuality === "confirmed" || (!item.placementQuality && !item.uncertain) ? "確認済み" : "要確認"}</span></div>`
    : `<span class="quality-tag ${escapeHTML(quality)}">${safeQuality}</span>`;
  return `${list}${productLink}${warning}${qualityTags}${item.note ? `<p>${escapeHTML(item.note)}</p>` : ""}`;
}

