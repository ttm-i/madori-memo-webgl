import { deleteActivePlan, loadActivePlan, saveActivePlan } from "./db.js?v=147";
import { alignCurtainToOpening, alignCurtainsToOpenings, alignFurnitureToSupport, alignSupportedFurniture, analyzeDeliveryRoute, analyzeFurnitureConflicts, analyzeFurniturePlacement, analyzeFurnitureSupportFit, applyFurnitureCandidate, buildElevationItems, buildFurnitureHierarchy, buildRoomWalls, buildWallDiagram, countQualities, createSamplePlan, curtainOpening, DIMENSION_GROUP_LABELS, duplicateFurnitureStack, featureSupportRange, findSupportItem, furnitureDescendantIds as modelFurnitureDescendantIds, furniturePriceSummary, FURNITURE_PRESETS, getDimensionGroup, getElectricalPlanPosition, inferFurnitureKind, normalizeFurnitureProductUrl, previewFurnitureCandidate, QUALITY_LABELS, removeFurnitureStack, resolveFurnitureVerticalRange, rotateFurnitureStack, supportSurfaceSize, updateFurniture, validatePlan, wallDisplayWidth } from "./model.js?v=147";
import { detailMarkup, measurementMetrics, PlanRenderer } from "./renderer.js?v=147";
import { createWebGLThreeView } from "./webgl-three.js?v=147";

const elements = Object.fromEntries([
  "menuButton", "dataMenu", "detailDialog", "detailType", "detailTitle", "detailBody", "fileInput",
  "importButton", "emptyImportButton", "exportButton", "resetButton", "sampleButton", "emptyState",
  "planCanvas", "viewportLayer", "canvasFrame", "lockButton", "fitButton", "undoButton",
  "planSelectionStatus", "planSelectionSummary", "planSelectionDetailsButton",
  "candidatePreviewBar", "candidatePreviewLabel", "adoptCandidatePreviewButton", "clearCandidatePreviewButton",
  "displayMenuButton", "displayMenu", "displayRoomLabelsToggle", "displayFeaturesToggle",
  "displayFurnitureToggle", "displayElectricalToggle", "displayDimensionsToggle",
  "dimensionFilters", "dimensionFilterList", "selectionMenuButton", "selectionMenu", "selectionModeHint",
  "measureButton", "measurementPanel", "measurementStatus", "measurementClearButton", "measurementEndButton",
  "furnitureMenuButton", "furnitureMenu", "snapToggle",
  "summaryTitle", "roomCount", "measuredCount", "uncertainCount", "connectionBadge", "saveStatus", "toast",
  "furnitureButton", "furnitureDialog", "furnitureForm", "cancelFurnitureButton",
  "furnitureName", "furnitureWidth", "furnitureDepth", "furnitureHeight", "furniturePrice", "furnitureProductUrl", "furnitureRoom", "furniturePreset", "furnitureSupportGroup", "furnitureSupport", "furnitureSupportHelp", "furnitureCurtainFields", "furnitureCurtainOpening", "furnitureCurtainColor",
  "furnitureViewActions", "showFurnitureInPlanButton", "showFurnitureInThreeButton", "furnitureActions", "rotateFurnitureButton", "duplicateFurnitureButton", "deleteFurnitureButton",
  "furnitureRoomEditGroup", "furnitureRoomEdit",
  "editFurnitureButton", "furnitureDialogTitle", "furnitureSubmitButton",
  "furnitureListButton", "furnitureListDialog", "furnitureList", "furnitureListCount", "furnitureListRoomFilter", "furnitureListIssueFilter", "furnitureListPriceFilter", "furnitureListExpandAll", "furnitureListPriceSummary",
  "wallDiagramModeButton", "wallHeightModeButton", "wallRoomList", "wallEmpty",
  "wallDiagramPanel", "wallPlanTitle", "wallPlanSvg", "wallList", "wallDiagramTitle", "wallDiagramMeta", "wallDiagramSvg", "wallDiagramDetails",
  "wallScrollViewButton", "wallOverviewButton", "wallSvgScroll",
  "wallHeightPanel", "wallCanvas", "wallScale", "wallTrack", "wallLegend", "wallCeilingNote",
  "deliveryEmpty", "deliveryContent", "deliveryRouteGrid", "deliveryDoorGrid", "deliveryFurnitureList", "deliveryLimitations",
  "deliveryDialog", "deliveryForm", "deliveryDialogTitle", "cancelDeliveryButton", "deliveryBasis",
  "deliverySideA", "deliverySideB", "deliverySideC",
  "addCandidateGroupButton", "candidateEmpty", "candidateGroupList",
  "candidateGroupDialog", "candidateGroupForm", "candidateGroupDialogTitle", "candidateGroupName", "candidateGroupFurniture", "candidateGroupSubmitButton", "cancelCandidateGroupButton",
  "candidateDialog", "candidateForm", "candidateDialogTitle", "candidateBrand", "candidateProductName", "candidateProductUrl", "candidateWidth", "candidateDepth", "candidateHeight", "candidatePrice", "candidatePriceCheckedAt", "candidateVariant", "candidateDeliverySideA", "candidateDeliverySideB", "candidateDeliverySideC", "candidateNote", "candidateSubmitButton", "cancelCandidateButton",
  "threeCanvas", "threeEmpty", "threeHeightNote", "threeSelectionStatus", "threeSelectionSummary", "threeSelectionDetailsButton", "threeCutawayToggle", "threeLabelsToggle",
  "threeRoomFilter", "threeWallsToggle", "threeOpeningsToggle", "threeFeaturesToggle", "threeFurnitureToggle", "threeElectricalToggle",
  "threeZoomOut", "threeZoomReset", "threeZoomIn", "threeZoomValue", "threeZoomHint", "threeCameraControls", "threeOverviewMode", "threeIndoorMode", "threeIndoorViewpointGroup", "threeIndoorViewpoint",
].map((id) => [id, document.getElementById(id)]));

let dialogPageScrollY = 0;
function syncDialogPageScrollLock() {
  const shouldLock = Boolean(document.querySelector("dialog[open]"));
  const locked = document.body.classList.contains("dialog-scroll-locked");
  if (shouldLock && !locked) {
    dialogPageScrollY = window.scrollY;
    document.body.style.top = `-${dialogPageScrollY}px`;
    document.body.classList.add("dialog-scroll-locked");
  } else if (!shouldLock && locked) {
    document.body.classList.remove("dialog-scroll-locked");
    document.body.style.top = "";
    window.scrollTo(0, dialogPageScrollY);
  }
}
new MutationObserver(syncDialogPageScrollLock).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });

let activePlan = null;
let toastTimer = null;
let selectedFurnitureId = null;
let editingFurnitureId = null;
let preserveFurnitureSelectionOnClose = false;
let preserveThreeSelectionOnClose = false;
let preservePlanSelectionOnClose = false;
let planSelectedType = null;
let planSelectedItem = null;
let threeSelectedType = null;
let threeSelectedItem = null;
let detailOrigin = null;
let furnitureListRoomId = "";
let furnitureListIssue = "";
let furnitureListPrice = "";
const collapsedFurnitureIds = new Set();
let locked = true;
let dimensionGroups = new Set();
let selectedWallRoomId = null;
let selectedWallId = null;
let wallDisplayMode = "diagram";
let wallViewportMode = "scroll";
let deliveryFurnitureId = null;
let threeQuarterTurn = 0;
let threeCutaway = true;
let threeShowLabels = false;
let threeRoomId = "";
let threeCameraMode = "overview";
let threeViewpointRoomId = "";
let threeViewpointOptions = [];
let webglThreeView = null;
let activeView = "plan";
let activeOtherView = "wall";
let editingCandidateGroupId = null;
let editingCandidateId = null;
let candidatePreview = null;
const threeLayers = { walls: true, openings: true, features: true, furniture: true, electrical: true };
const selectableByMode = {
  view: new Set(["room", "dimension", "equipment", "electrical", "furniture"]),
  edit: new Set(["furniture"]),
};
const history = [];
const renderer = new PlanRenderer(elements.planCanvas, elements.viewportLayer, handlePlanSelection, handleFurnitureEvent, handleViewChange, handleMeasurementChange);
let persistQueue = Promise.resolve();
let latestPersistTask = persistQueue;

function updateThreeView() {
  elements.threeEmpty.hidden = Boolean(activePlan);
  elements.threeCanvas.hidden = !activePlan;
  elements.threeCameraControls.hidden = !activePlan;
  elements.threeZoomOut.parentElement.hidden = !activePlan;
  if (!activePlan) elements.threeZoomHint.hidden = true;
  if (!activePlan) {
    elements.threeHeightNote.textContent = "";
    elements.threeSelectionStatus.hidden = true;
    return;
  }
  webglThreeView ??= createWebGLThreeView(
    elements.threeCanvas,
    (type, item, selectionMeta) => {
      setThreeSelectionPresentation(type, item, { selectionMeta });
    },
    () => {
      clearThreeSelection();
    },
    (viewpointKey) => {
      threeViewpointRoomId = viewpointKey;
      elements.threeIndoorViewpoint.value = viewpointKey;
      const destination = threeViewpointOptions.find((option) => option.value === viewpointKey);
      if (threeRoomId && destination?.roomId && destination.roomId !== threeRoomId) {
        threeRoomId = destination.roomId;
        elements.threeRoomFilter.value = threeRoomId;
        updateThreeView();
      }
      clearThreeSelection();
      syncThreeZoomControls();
    },
  );
  webglThreeView.setSuspended(document.hidden || activeView !== "three");
  const result = webglThreeView.render(activePlan, {
    quarterTurn: threeQuarterTurn,
    cutaway: threeCutaway,
    showLabels: threeShowLabels,
    roomId: threeRoomId || null,
    cameraMode: threeCameraMode,
    viewpointRoomId: threeViewpointRoomId || null,
    indoorViewpoints: threeViewpointOptions,
    ...threeLayers,
  });
  if (threeSelectedType && result.selectionVisible === false) {
    clearThreeSelection();
    showToast("選択対象が現在の表示範囲外になったため、選択を解除しました");
  }
  syncThreeZoomControls();
  const scope = result.selectedRoomName ? `${result.selectedRoomName}を表示中。` : "全体を表示中。";
  const notes = [`${scope} ドア・窓 ${result.openingCount}点のうち ${result.cutOpeningCount}点を壁の開口として反映。間仕切り壁 ${result.partitionWallCount}点。壁上端は天井位置ではありません。`];
  notes.push(`コンセント・スイッチ ${result.electricalCount}点を壁面位置と実測中心高さから表示しています。`);
  notes.push(result.furnitureWithoutHeight
    ? `高さ未登録の家具 ${result.furnitureWithoutHeight}点は、種類別の模式高さで表示しています。`
    : "家具の高さデータを反映しています。");
  if (result.schematicFeatureCount) notes.push(`高さ未測定の設備 ${result.schematicFeatureCount}点は、用途を識別するための模式形状です。`);
  elements.threeHeightNote.textContent = notes.join(" ");
}

function syncThreeZoomControls() {
  const scale = webglThreeView?.getZoom() ?? 1;
  const zoomed = scale > 1.001;
  elements.threeZoomValue.textContent = `${Math.round(scale * 100)}%`;
  elements.threeZoomOut.disabled = !zoomed;
  elements.threeZoomIn.disabled = scale >= 3;
  const activeRoomId = threeViewpointRoomId.split("::")[0];
  const sameRoomViewpointCount = threeViewpointOptions.filter((option) => option.roomId === activeRoomId).length;
  elements.threeZoomHint.textContent = threeCameraMode === "indoor"
    ? sameRoomViewpointCount > 1 ? "1本指で見回す・床の印／ドアで移動" : "1本指で見回す・ドアで部屋移動"
    : "1本指で回転・2本指で拡大縮小／移動";
  elements.threeZoomHint.hidden = threeCameraMode === "indoor" ? false : !zoomed;
}

function setThreeZoom(scale) {
  webglThreeView?.setZoom(scale);
  syncThreeZoomControls();
}

function resetThreeViewport() {
  webglThreeView?.resetView(threeQuarterTurn);
  syncThreeZoomControls();
}

function updateThreeRoomFilter() {
  const rooms = activePlan?.plan?.rooms ?? [];
  const openings = activePlan?.plan?.openings ?? [];
  if (threeRoomId && !rooms.some((room) => room.id === threeRoomId)) threeRoomId = "";
  const options = [new Option("全体", ""), ...rooms.map((room) => new Option(room.name, room.id))];
  elements.threeRoomFilter.replaceChildren(...options);
  elements.threeRoomFilter.value = threeRoomId;
  const viewpointOptions = rooms.flatMap((room) => {
    const viewpoint = (label, value) => ({ label, value, roomId: room.id });
    const roomOpenings = openings.filter((opening) => (opening.roomId === room.id || opening.roomIds?.includes(room.id))
      && opening.from && opening.to);
    const matching = (kind) => roomOpenings.filter((opening) => String(opening.kind ?? "").includes(kind))
      .sort((first, second) => (second.widthCm ?? 0) - (first.widthCm ?? 0))[0];
    if (/^(浴室|洗面室|トイレ|バルコニー)$/.test(room.name)) return [viewpoint(room.name, `${room.id}::center`)];
    const windowOpening = matching("window");
    if (/玄関|廊下/.test(room.name)) {
      const entranceDoor = roomOpenings.find((opening) => String(opening.kind ?? "").includes("door") && !(opening.roomIds?.length))
        ?? matching("door");
      const innerDoor = roomOpenings
        .filter((opening) => String(opening.kind ?? "").includes("door") && opening.id !== entranceDoor?.id)
        .find((opening) => (opening.roomIds ?? []).some((roomId) => /LDK|リビング/.test(rooms.find((candidate) => candidate.id === roomId)?.name ?? "")))
        ?? roomOpenings.filter((opening) => String(opening.kind ?? "").includes("door") && opening.id !== entranceDoor?.id).slice(-1)[0];
      return [
        entranceDoor ? viewpoint(`${room.name}入口側`, `${room.id}::entrance::${entranceDoor.id}`) : null,
        viewpoint(`${room.name}中央`, `${room.id}::center`),
        innerDoor ? viewpoint(`${room.name}奥側`, `${room.id}::back::${innerDoor.id}`) : null,
      ].filter(Boolean);
    }
    if (/洋室/.test(room.name)) {
      const entranceDoor = matching("door");
      const windows = roomOpenings.filter((opening) => String(opening.kind ?? "").includes("window"));
      const sideWindow = windows.find((opening) => Math.abs(opening.to.x - opening.from.x) < Math.abs(opening.to.y - opening.from.y));
      const backWindow = windows.find((opening) => Math.abs(opening.to.x - opening.from.x) >= Math.abs(opening.to.y - opening.from.y));
      return [
        entranceDoor ? viewpoint(`${room.name}入口側`, `${room.id}::entrance::${entranceDoor.id}`) : null,
        viewpoint(`${room.name}壁側`, `${room.id}::wall`),
        sideWindow ? viewpoint(`${room.name}窓側`, `${room.id}::window::${sideWindow.id}`) : null,
        backWindow ? viewpoint(`${room.name}奥側`, `${room.id}::back::${backWindow.id}`) : null,
      ].filter(Boolean);
    }
    if (/LDK|リビング/.test(room.name)) {
      const doorOptions = roomOpenings
        .filter((opening) => String(opening.kind ?? "").includes("door"))
        .map((opening) => {
          const adjacentRoom = (opening.roomIds ?? [])
            .map((roomId) => rooms.find((candidate) => candidate.id === roomId))
            .find((candidate) => candidate && candidate.id !== room.id);
          const label = /洋室/.test(adjacentRoom?.name ?? "") ? `${room.name}洋室側` : `${room.name}入口側`;
          const priority = /玄関|廊下/.test(adjacentRoom?.name ?? "") ? 0 : /洋室/.test(adjacentRoom?.name ?? "") ? 1 : 2;
          return { option: viewpoint(label, `${room.id}::door::${opening.id}`), priority };
        })
        .sort((first, second) => first.priority - second.priority)
        .map(({ option }) => option);
      return [
        viewpoint("キッチン", `${room.id}::kitchen`),
        ...doorOptions,
        windowOpening ? viewpoint(`${room.name}窓側`, `${room.id}::window::${windowOpening.id}`) : null,
      ].filter(Boolean);
    }
    const door = matching("door");
    return [
      viewpoint(`${room.name}中央`, `${room.id}::center`),
      door ? viewpoint(`${room.name}入口側`, `${room.id}::door::${door.id}`) : null,
      windowOpening ? viewpoint(`${room.name}窓側`, `${room.id}::window::${windowOpening.id}`) : null,
    ].filter(Boolean);
  });
  threeViewpointOptions = viewpointOptions;
  const validViewpoints = new Set(viewpointOptions.map((option) => option.value));
  if (!validViewpoints.has(threeViewpointRoomId)) {
    const preferredRoom = rooms.find((room) => /LDK|リビング/.test(room.name)) ?? rooms[0];
    threeViewpointRoomId = viewpointOptions.find((option) => option.value.startsWith(`${preferredRoom?.id}::`))?.value ?? "";
  }
  elements.threeIndoorViewpoint.replaceChildren(...viewpointOptions.map((option) => new Option(option.label, option.value)));
  elements.threeIndoorViewpoint.value = threeViewpointRoomId;
}

function setThreeCameraMode(mode) {
  threeCameraMode = mode === "indoor" ? "indoor" : "overview";
  const indoor = threeCameraMode === "indoor";
  elements.threeOverviewMode.classList.toggle("is-active", !indoor);
  elements.threeOverviewMode.setAttribute("aria-pressed", String(!indoor));
  elements.threeIndoorMode.classList.toggle("is-active", indoor);
  elements.threeIndoorMode.setAttribute("aria-pressed", String(indoor));
  elements.threeIndoorViewpointGroup.hidden = !indoor;
  elements.threeCanvas.parentElement.classList.toggle("is-indoor", indoor);
  updateThreeView();
}

function updateUndoButton() {
  elements.undoButton.hidden = history.length === 0;
}

function handleViewChange(changed) {
  elements.fitButton.hidden = !activePlan || !changed;
}

function handleMeasurementChange(measurement) {
  if (!measurement.from) elements.measurementStatus.textContent = "始点をタップ";
  else if (!measurement.to) elements.measurementStatus.textContent = "終点をタップ";
  else {
    const metrics = measurementMetrics(measurement.from, measurement.to);
    elements.measurementStatus.textContent = `${Math.round(metrics.distance * 10) / 10} cm`;
  }
}

function setMeasurementMode(value) {
  if (value && !activePlan) return showToast("先に間取りデータを読み込んでください");
  if (value) clearPlanSelection();
  renderer.setMeasurementMode(value);
  elements.measurementPanel.hidden = !value;
  elements.measureButton.textContent = value ? "📏 測定を終了" : "📏 2点間を測る";
  closeToolMenus();
  if (value) showToast("始点と終点をタップしてください");
}

function pushHistory() {
  history.push(structuredClone(activePlan));
  if (history.length > 30) history.shift();
  updateUndoButton();
}

function persistActivePlan() {
  const snapshot = structuredClone(activePlan);
  elements.saveStatus.textContent = "保存中…";
  const task = persistQueue.then(() => saveActivePlan(snapshot));
  persistQueue = task.catch(() => {});
  latestPersistTask = task;
  return task.then(() => {
    if (latestPersistTask === task) elements.saveStatus.textContent = "端末内に保存済み";
    return true;
  }, () => {
    if (latestPersistTask === task) {
      elements.saveStatus.textContent = "保存できませんでした";
      showToast("端末内への保存に失敗しました");
    }
    return false;
  });
}

async function waitForPendingSaves() {
  let observed;
  do {
    observed = persistQueue;
    await observed;
  } while (observed !== persistQueue);
}

function handleFurnitureEvent(stage) {
  if (stage === "start") pushHistory();
  if (stage === "commit") {
    alignSupportedFurniture(activePlan.plan);
    renderer.render(activePlan);
    persistActivePlan();
  }
}

function furnitureDescendantIds(furnitureId) {
  return modelFurnitureDescendantIds(activePlan?.plan, furnitureId);
}

function updateFurnitureSupportOptions(selectedId = "") {
  const roomId = elements.furnitureRoom.value;
  const excluded = editingFurnitureId ? furnitureDescendantIds(editingFurnitureId) : new Set();
  if (editingFurnitureId) excluded.add(editingFurnitureId);
  const options = [new Option("床に置く", "")];
  const appendGroup = (label, items) => {
    if (!items.length) return;
    const group = document.createElement("optgroup");
    group.label = label;
    group.append(...items.map((item) => {
      const width = item.widthCm ?? item.width;
      const depth = item.depthCm ?? item.height;
      const size = Number.isFinite(width) && Number.isFinite(depth) ? `（${width}×${depth} cm）` : "";
      return new Option(`${item.name}${size}`, item.id);
    }));
    options.push(group);
  };
  appendGroup("固定設備の上", (activePlan?.plan.features ?? []).filter((item) => item.kind !== "column" && item.roomId === roomId));
  appendGroup("家具の上", (activePlan?.plan.furniture ?? []).filter((item) => item.roomId === roomId && !excluded.has(item.id) && inferFurnitureKind(item) !== "curtain"));
  elements.furnitureSupport.replaceChildren(...options);
  elements.furnitureSupport.value = [...elements.furnitureSupport.options].some((option) => option.value === selectedId) ? selectedId : "";
  updateFurnitureSupportHelp();
}

function updateFurnitureSupportHelp() {
  const support = findSupportItem(activePlan?.plan, elements.furnitureSupport.value);
  if (!support) {
    elements.furnitureSupportHelp.textContent = "設備や家具の上に置く場合、平面上の位置と3Dの高さを連動します。";
    elements.furnitureSupportHelp.classList.remove("warning");
    return;
  }
  const { widthCm: supportWidth, depthCm: supportDepth } = supportSurfaceSize(support);
  const width = Number(elements.furnitureWidth.value);
  const depth = Number(elements.furnitureDepth.value);
  if (![supportWidth, supportDepth, width, depth].every(Number.isFinite)) {
    elements.furnitureSupportHelp.textContent = `${support.name}の上端から高さを計算します。`;
    elements.furnitureSupportHelp.classList.remove("warning");
    return;
  }
  const overflowWidth = Math.max(0, width - supportWidth);
  const overflowDepth = Math.max(0, depth - supportDepth);
  if (overflowWidth > .001 || overflowDepth > .001) {
    const overflow = [];
    if (overflowWidth > .001) overflow.push(`幅 ${overflowWidth} cm`);
    if (overflowDepth > .001) overflow.push(`奥行 ${overflowDepth} cm`);
    elements.furnitureSupportHelp.textContent = `${support.name} ${supportWidth}×${supportDepth} cmより${overflow.join("・")}大きいため、初期位置は中央になります。設置面と一部でも重なれば移動・回転できます。`;
    elements.furnitureSupportHelp.classList.add("warning");
    return;
  }
  elements.furnitureSupportHelp.textContent = `${support.name} ${supportWidth}×${supportDepth} cm内で、横 ${supportWidth - width} cm・奥行 ${supportDepth - depth} cm移動できます。`;
  elements.furnitureSupportHelp.classList.remove("warning");
}

function roomWindowOpenings(roomId) {
  return (activePlan?.plan.openings ?? []).filter((opening) => {
    if (!String(opening.kind ?? "").includes("window")) return false;
    return opening.roomId === roomId || opening.roomIds?.includes(roomId);
  });
}

function applyCurtainOpeningDefaults(opening) {
  if (!opening?.from || !opening?.to) return;
  const openingWidth = Number.isFinite(opening.widthCm)
    ? opening.widthCm
    : Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y);
  const sillHeight = opening.sillHeightCm ?? 0;
  const openingHeight = opening.heightCm ?? 180;
  const railTop = sillHeight + openingHeight + 10;
  const curtainHeight = sillHeight <= 15 ? Math.max(80, railTop - 1) : Math.max(80, openingHeight + 20);
  elements.furnitureWidth.value = String(Math.ceil((openingWidth + 20) / 5) * 5);
  elements.furnitureDepth.value = "12";
  elements.furnitureHeight.value = String(Math.round(curtainHeight * 10) / 10);
}

function updateCurtainFurnitureFields({ selectedOpeningId = "", applyDefaults = false } = {}) {
  const isCurtain = elements.furniturePreset.value === "curtain";
  elements.furnitureCurtainFields.hidden = !isCurtain;
  elements.furnitureSupportGroup.hidden = isCurtain;
  elements.furnitureSupport.disabled = isCurtain;
  if (!isCurtain) return;
  const windows = roomWindowOpenings(elements.furnitureRoom.value);
  elements.furnitureCurtainOpening.replaceChildren(...windows.map((opening) => new Option(opening.name, opening.id)));
  const preferred = windows.find((opening) => opening.id === selectedOpeningId) ?? windows[0] ?? null;
  elements.furnitureCurtainOpening.value = preferred?.id ?? "";
  elements.furnitureSupport.value = "";
  if (applyDefaults && preferred) applyCurtainOpeningDefaults(preferred);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

function updateConnection() {
  const online = navigator.onLine;
  elements.connectionBadge.textContent = online ? "オンライン" : "オフライン";
  elements.connectionBadge.classList.toggle("offline", !online);
}

function updateSummary() {
  const hasData = Boolean(activePlan);
  elements.emptyState.hidden = hasData;
  document.querySelector(".scale-indicator").classList.toggle("visible", hasData);
  if (!hasData) {
    elements.summaryTitle.textContent = "データ未読込";
    elements.roomCount.textContent = elements.measuredCount.textContent = elements.uncertainCount.textContent = "—";
    return;
  }
  const counts = countQualities(activePlan);
  elements.summaryTitle.textContent = activePlan.meta.title;
  elements.roomCount.textContent = activePlan.plan.rooms.length;
  elements.measuredCount.textContent = counts.measured;
  elements.uncertainCount.textContent = counts.uncertain;
}

function routeOpeningSize(route) {
  const opening = activePlan?.plan.openings?.find((item) => item.id === route?.dwellingEntranceOpeningId);
  return {
    width: route?.dwellingEntrance?.openingWidthCm ?? opening?.clearOpeningWidthCm ?? opening?.widthCm,
    height: route?.dwellingEntrance?.openingHeightCm ?? opening?.heightCm,
  };
}

function openDeliveryDialog(furniture) {
  deliveryFurnitureId = furniture.id;
  const dimensions = furniture.deliveryDimensions ?? {};
  elements.deliveryDialogTitle.textContent = `${furniture.name}の搬入寸法`;
  elements.deliveryBasis.value = dimensions.basis === "body" ? "body" : "packed";
  elements.deliverySideA.value = dimensions.sideACm ?? "";
  elements.deliverySideB.value = dimensions.sideBCm ?? "";
  elements.deliverySideC.value = dimensions.sideCCm ?? "";
  elements.deliveryDialog.showModal();
}

function makeDeliveryRouteCard(item) {
  const card = document.createElement("article");
  card.className = "delivery-route-card";
  const title = document.createElement("strong");
  title.textContent = item.title;
  const value = document.createElement("b");
  value.textContent = item.value;
  const note = document.createElement("span");
  note.textContent = item.note;
  card.append(title, value, note);
  return card;
}

function renderDeliveryView() {
  const route = activePlan?.plan.accessRoute;
  elements.deliveryEmpty.hidden = Boolean(route);
  elements.deliveryContent.hidden = !route;
  if (!route) {
    elements.deliveryRouteGrid.replaceChildren();
    elements.deliveryDoorGrid.replaceChildren();
    elements.deliveryFurnitureList.replaceChildren();
    elements.deliveryLimitations.replaceChildren();
    return;
  }
  const entrance = routeOpeningSize(route);
  const routeCards = [
    { title: "共用廊下", value: Number.isFinite(route.commonCorridor?.widthCm) ? `幅 ${route.commonCorridor.widthCm} cm` : "未測定", note: "曲がり角・待避余地は別途確認" },
    { title: "エレベーター入口", value: Number.isFinite(route.elevator?.openingWidthCm) && Number.isFinite(route.elevator?.openingHeightCm) ? `${route.elevator.openingWidthCm} × ${route.elevator.openingHeightCm} cm` : "未測定", note: "幅 × 開口高さ" },
    { title: "エレベーター庫内", value: Number.isFinite(route.elevator?.cabinWidthCm) && Number.isFinite(route.elevator?.cabinDepthCm) ? `${route.elevator.cabinWidthCm} × ${route.elevator.cabinDepthCm} cm` : "未測定", note: "床面の幅 × 奥行・高さ未測定" },
    { title: "住戸玄関", value: Number.isFinite(entrance.width) && Number.isFinite(entrance.height) ? `${entrance.width} × ${entrance.height} cm` : "未測定", note: "有効幅 × 開口高さ" },
  ].map(makeDeliveryRouteCard);
  elements.deliveryRouteGrid.replaceChildren(...routeCards);
  const internalDoors = activePlan.plan.openings
    .filter((opening) => String(opening.kind ?? "").includes("door") && opening.roomIds?.length === 2)
    .map((door) => {
      const width = door.clearOpeningWidthCm ?? door.widthCm;
      return makeDeliveryRouteCard({
        title: door.name,
        value: Number.isFinite(width) && Number.isFinite(door.heightCm) ? `${width} × ${door.heightCm} cm` : "未測定",
        note: "有効幅 × 開口高さ",
      });
    });
  elements.deliveryDoorGrid.replaceChildren(...internalDoors);

  const furniture = activePlan.plan.furniture ?? [];
  if (!furniture.length) {
    const empty = document.createElement("p");
    empty.className = "furniture-list-empty";
    empty.textContent = "2D画面で家具を追加すると、ここで搬入寸法を登録できます。";
    elements.deliveryFurnitureList.replaceChildren(empty);
  } else {
    const cards = furniture.map((item) => {
      const analysis = analyzeDeliveryRoute(item, activePlan);
      const statusLabels = { candidate: "数値上は通過候補", review: "要再確認", missing: "寸法未登録" };
      const card = document.createElement("article");
      card.className = "delivery-furniture-card";
      const header = document.createElement("div");
      header.className = "delivery-furniture-card-header";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const status = document.createElement("span");
      status.className = `delivery-status ${analysis.status}`;
      status.textContent = statusLabels[analysis.status];
      header.append(name, status);
      const size = document.createElement("p");
      size.className = "delivery-size";
      const dimensions = item.deliveryDimensions;
      size.textContent = dimensions
        ? `${dimensions.basis === "body" ? "本体" : "梱包"} ${dimensions.sideACm} × ${dimensions.sideBCm} × ${dimensions.sideCCm} cm`
        : `設置寸法 ${item.widthCm} × ${item.depthCm} cm（搬入寸法は別途登録）`;
      const checks = document.createElement("ul");
      checks.className = "delivery-checks";
      for (const check of analysis.checks) {
        const row = document.createElement("li");
        row.className = check.status;
        const label = document.createElement("strong");
        label.textContent = check.label;
        const detail = document.createElement("span");
        detail.textContent = check.detail;
        row.append(label, detail);
        checks.append(row);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button delivery-edit-button";
      button.textContent = dimensions ? "搬入寸法を変更" : "搬入寸法を設定";
      button.addEventListener("click", () => openDeliveryDialog(item));
      card.append(header, size);
      if (analysis.checks.length) card.append(checks);
      card.append(button);
      return card;
    });
    elements.deliveryFurnitureList.replaceChildren(...cards);
  }
  const limitations = route.limitations ?? [];
  const title = document.createElement("strong");
  title.textContent = "判定できない要素";
  const list = document.createElement("ul");
  for (const text of limitations) {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  }
  elements.deliveryLimitations.replaceChildren(title, list);
}

const SVG_NS = "http://www.w3.org/2000/svg";
function wallSvg(tag, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}

function renderWallPlan(room, walls) {
  elements.wallPlanSvg.replaceChildren();
  if (!room || !walls.length) return;
  const padding = 38;
  const xs = room.points.map((point) => point.x);
  const ys = room.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  elements.wallPlanSvg.setAttribute("viewBox", `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`);
  elements.wallPlanTitle.textContent = `${room.name}の間取り図`;
  elements.wallPlanSvg.append(wallSvg("polygon", {
    class: "wall-plan-room",
    points: room.points.map((point) => `${point.x},${point.y}`).join(" "),
  }));
  for (const opening of activePlan.plan.openings ?? []) {
    const belongs = opening.roomId === room.id || opening.roomIds?.includes(room.id);
    if (!belongs || !opening.from || !opening.to) continue;
    elements.wallPlanSvg.append(wallSvg("line", {
      class: "wall-plan-opening",
      x1: opening.from.x, y1: opening.from.y, x2: opening.to.x, y2: opening.to.y,
    }));
  }
  const electricalItems = [
    ...(activePlan.plan.electrical?.outlets ?? []),
    ...(activePlan.plan.electrical?.switches ?? []),
  ];
  for (const electrical of electricalItems) {
    if (electrical.roomId !== room.id) continue;
    const position = getElectricalPlanPosition(activePlan, electrical);
    if (!position) continue;
    elements.wallPlanSvg.append(wallSvg("circle", {
      class: "wall-plan-electrical",
      cx: position.anchor.x,
      cy: position.anchor.y,
      r: 7,
    }));
  }
  walls.forEach((wall, index) => {
    const selected = wall.id === selectedWallId;
    const group = wallSvg("g", {
      class: `wall-plan-wall ${selected ? "is-selected" : ""}`,
      role: "button",
      tabindex: 0,
      "aria-label": `壁${index + 1} ${wall.label} ${Math.round(wall.lengthCm * 10) / 10} cm`,
    });
    const attributes = { x1: wall.from.x, y1: wall.from.y, x2: wall.to.x, y2: wall.to.y };
    group.append(
      wallSvg("line", { class: "wall-plan-wall-line", ...attributes }),
      wallSvg("line", { class: "wall-plan-wall-hit", ...attributes }),
    );
    const midX = (wall.from.x + wall.to.x) / 2;
    const midY = (wall.from.y + wall.to.y) / 2;
    group.append(
      wallSvg("circle", { class: "wall-plan-wall-number-bg", cx: midX, cy: midY, r: 13 }),
      wallSvg("text", { class: "wall-plan-wall-number", x: midX, y: midY + 5, "text-anchor": "middle" }, index + 1),
    );
    const select = () => updateWallView(selectedWallRoomId, wall.id);
    group.addEventListener("click", select);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    elements.wallPlanSvg.append(group);
  });
}

function renderWallDiagram(diagram, referenceLengthCm = diagram?.lengthCm) {
  elements.wallDiagramSvg.replaceChildren();
  elements.wallDiagramDetails.replaceChildren();
  if (!diagram) {
    elements.wallDiagramTitle.textContent = "壁を選択";
    elements.wallDiagramMeta.textContent = "—";
    return;
  }
  elements.wallDiagramTitle.textContent = diagram.label;
  elements.wallDiagramMeta.textContent = `幅 ${Math.round(diagram.lengthCm * 10) / 10} cm・部屋内共通縮尺`;
  const highest = Math.max(200, ...diagram.items.map((item) => item.topCm));
  const displayMaxCm = Math.max(225, Math.ceil((highest + 20) / 25) * 25);
  const left = 80;
  const maxDrawWidth = 840;
  const right = left + wallDisplayWidth(diagram.lengthCm, referenceLengthCm, maxDrawWidth);
  const top = 72;
  const floor = 500;
  const drawWidth = right - left;
  const drawHeight = floor - top;
  const xFor = (value) => left + value / diagram.lengthCm * drawWidth;
  const yFor = (value) => floor - value / displayMaxCm * drawHeight;

  const grid = wallSvg("g", { class: "wall-svg-grid" });
  for (let height = 0; height <= displayMaxCm; height += 50) {
    const y = yFor(height);
    grid.append(
      wallSvg("line", { x1: left, y1: y, x2: right, y2: y }),
      wallSvg("text", { x: left - 12, y: y + 5, "text-anchor": "end" }, `${height}`),
    );
  }
  elements.wallDiagramSvg.append(grid);
  elements.wallDiagramSvg.append(
    wallSvg("line", { class: "wall-svg-limit", x1: left, y1: top, x2: right, y2: top }),
    wallSvg("line", { class: "wall-svg-side", x1: left, y1: top, x2: left, y2: floor }),
    wallSvg("line", { class: "wall-svg-side", x1: right, y1: top, x2: right, y2: floor }),
    wallSvg("line", { class: "wall-svg-floor", x1: left, y1: floor, x2: right, y2: floor }),
    wallSvg("text", { class: "wall-svg-limit-text", x: Math.max(right, left + 160), y: top - 13, "text-anchor": "end" }, `${displayMaxCm} cm（表示上限）`),
    wallSvg("line", { class: "wall-svg-width-line", x1: left, y1: 36, x2: right, y2: 36 }),
    wallSvg("text", { class: "wall-svg-width-text", x: (left + right) / 2, y: 28, "text-anchor": "middle" }, `壁幅 ${Math.round(diagram.lengthCm * 10) / 10} cm`),
  );

  const shapes = wallSvg("g", { class: "wall-svg-items" });
  diagram.items.forEach((item, index) => {
    const x = xFor(item.offsetCm);
    const width = Math.max(4, item.widthCm / diagram.lengthCm * drawWidth);
    const y = yFor(item.topCm);
    const height = Math.max(3, yFor(item.bottomCm) - y);
    if (item.marker) {
      shapes.append(wallSvg("line", { class: `wall-svg-item wall-svg-${item.category} is-marker`, x1: x, y1: y, x2: x + width, y2: y }));
    } else {
      shapes.append(wallSvg("rect", { class: `wall-svg-item wall-svg-${item.category}`, x, y, width, height, rx: 4 }));
    }
    const badgeX = Math.min(right - 13, Math.max(left + 13, x + width / 2));
    const badgeY = Math.max(top + 15, y + 18);
    shapes.append(
      wallSvg("circle", { class: "wall-svg-number-bg", cx: badgeX, cy: badgeY, r: 12 }),
      wallSvg("text", { class: "wall-svg-number", x: badgeX, y: badgeY + 4, "text-anchor": "middle" }, index + 1),
    );
  });
  elements.wallDiagramSvg.append(shapes);

  const detailRows = diagram.items.map((item, index) => {
    const row = document.createElement("div");
    row.className = "wall-diagram-detail";
    const number = document.createElement("span");
    number.className = `wall-detail-number wall-detail-${item.category}`;
    number.textContent = String(index + 1);
    const body = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const measurement = document.createElement("span");
    const vertical = item.marker ? `床から ${item.topCm} cm` : `高さ ${item.bottomCm}–${item.topCm} cm`;
    measurement.textContent = `図の左端から ${Math.round(item.offsetCm * 10) / 10} cm・幅 ${Math.round(item.widthCm * 10) / 10} cm・${vertical}`;
    body.append(name, measurement);
    row.append(number, body);
    return row;
  });
  if (!detailRows.length) {
    const empty = document.createElement("p");
    empty.className = "wall-diagram-detail-empty";
    empty.textContent = "この壁には、位置と高さが確定した開口部・設備がありません。";
    detailRows.push(empty);
  }
  elements.wallDiagramDetails.replaceChildren(...detailRows);
}

function renderHeightComparison(items) {
  elements.wallCanvas.hidden = items.length === 0;
  elements.wallLegend.hidden = items.length === 0;
  if (!items.length) {
    elements.wallScale.replaceChildren();
    elements.wallTrack.replaceChildren();
    return;
  }
  const highest = Math.max(...items.map((item) => item.topCm));
  const displayMaxCm = Math.max(200, Math.ceil((highest + 20) / 25) * 25);
  const scaleMarks = [];
  for (let height = 0; height <= displayMaxCm; height += 50) {
    const mark = document.createElement("span");
    mark.style.bottom = `${height / displayMaxCm * 100}%`;
    mark.textContent = `${height}`;
    scaleMarks.push(mark);
  }
  const limit = document.createElement("span");
  limit.className = "wall-limit-label";
  limit.style.bottom = "100%";
  limit.textContent = `${displayMaxCm} cm（表示上限）`;
  scaleMarks.push(limit);
  elements.wallScale.replaceChildren(...scaleMarks);
  elements.wallTrack.style.width = `${Math.max(100, items.length * 92)}px`;
  const lanes = items.map((item) => {
    const lane = document.createElement("div");
    lane.className = "wall-lane";
    const shape = document.createElement("div");
    shape.className = `wall-item wall-item-${item.category} ${item.marker ? "is-marker" : ""}`;
    shape.style.bottom = `${item.bottomCm / displayMaxCm * 100}%`;
    shape.style.height = item.marker ? "3px" : `${Math.max(1.5, (item.topCm - item.bottomCm) / displayMaxCm * 100)}%`;
    const heightLabel = item.marker ? `${item.topCm} cm` : `${item.bottomCm}–${item.topCm} cm`;
    const label = document.createElement("div");
    label.className = "wall-item-label";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const value = document.createElement("span");
    value.textContent = heightLabel;
    label.append(name, value);
    if (item.detail) {
      const detail = document.createElement("small");
      detail.textContent = item.detail;
      label.append(detail);
    }
    lane.append(shape, label);
    return lane;
  });
  elements.wallTrack.replaceChildren(...lanes);
}

function updateWallView(preferredRoomId = selectedWallRoomId, preferredWallId = selectedWallId) {
  const rooms = activePlan?.plan.rooms ?? [];
  const roomChanged = preferredRoomId !== selectedWallRoomId;
  selectedWallRoomId = rooms.some((room) => room.id === preferredRoomId) ? preferredRoomId : rooms[0]?.id ?? null;
  if (roomChanged) preferredWallId = null;
  const hasData = Boolean(activePlan && selectedWallRoomId);
  elements.wallEmpty.hidden = hasData;
  elements.wallDiagramPanel.hidden = !hasData || wallDisplayMode !== "diagram";
  elements.wallHeightPanel.hidden = !hasData || wallDisplayMode !== "height";
  elements.wallCeilingNote.hidden = !hasData;

  const roomButtons = rooms.map((room) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wall-room-button ${room.id === selectedWallRoomId ? "is-active" : ""}`;
    button.textContent = room.name;
    button.setAttribute("aria-pressed", String(room.id === selectedWallRoomId));
    button.addEventListener("click", () => updateWallView(room.id, null));
    return button;
  });
  elements.wallRoomList.replaceChildren(...roomButtons);

  if (!hasData) {
    elements.wallRoomList.replaceChildren();
    elements.wallList.replaceChildren();
    elements.wallPlanSvg.replaceChildren();
    renderWallDiagram(null);
    renderHeightComparison([]);
    return;
  }

  const walls = buildRoomWalls(activePlan, selectedWallRoomId);
  const diagrams = walls.map((wall) => buildWallDiagram(activePlan, selectedWallRoomId, wall.id));
  selectedWallId = walls.some((wall) => wall.id === preferredWallId)
    ? preferredWallId
    : diagrams.sort((first, second) => second.items.length - first.items.length)[0]?.id ?? walls[0]?.id ?? null;
  const wallButtons = walls.map((wall, index) => {
    const diagram = buildWallDiagram(activePlan, selectedWallRoomId, wall.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wall-list-button ${wall.id === selectedWallId ? "is-active" : ""}`;
    button.setAttribute("aria-pressed", String(wall.id === selectedWallId));
    const name = document.createElement("strong");
    name.textContent = `壁${index + 1}・${wall.label}`;
    const meta = document.createElement("span");
    meta.textContent = `${Math.round(wall.lengthCm * 10) / 10} cm${diagram.items.length ? `・${diagram.items.length}要素` : ""}`;
    button.append(name, meta);
    button.addEventListener("click", () => updateWallView(selectedWallRoomId, wall.id));
    return button;
  });
  elements.wallList.replaceChildren(...wallButtons);
  const selectedRoom = rooms.find((room) => room.id === selectedWallRoomId);
  renderWallPlan(selectedRoom, walls);
  renderWallDiagram(buildWallDiagram(activePlan, selectedWallRoomId, selectedWallId), Math.max(...walls.map((wall) => wall.lengthCm)));
  renderHeightComparison(buildElevationItems(activePlan, selectedWallRoomId));
}

function updateDimensionFilters() {
  const groups = activePlan ? [...new Set(activePlan.plan.dimensions.map(getDimensionGroup))] : [];
  const order = ["wet", "hall", "ldk", "bedroom", "balcony", "other"];
  groups.sort((first, second) => order.indexOf(first) - order.indexOf(second));
  const retainedGroups = groups.filter((group) => dimensionGroups.has(group));
  dimensionGroups = new Set(retainedGroups.length ? retainedGroups : groups);
  const makeChip = (value, label, checked = true) => {
    const wrapper = document.createElement("label");
    wrapper.className = "filter-chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = checked;
    wrapper.append(input, document.createTextNode(label));
    return wrapper;
  };
  const allSelected = groups.length > 0 && groups.every((group) => dimensionGroups.has(group));
  const chips = groups.length ? [makeChip("all", "すべて", allSelected), ...groups.map((group) => makeChip(group, DIMENSION_GROUP_LABELS[group] ?? group, dimensionGroups.has(group)))] : [];
  elements.dimensionFilterList.replaceChildren(...chips);
  elements.dimensionFilters.hidden = !groups.length || !elements.displayDimensionsToggle.checked;
  renderer.setDimensionGroups(dimensionGroups);

  for (const input of elements.dimensionFilterList.querySelectorAll("input")) {
    input.addEventListener("change", () => {
      const groupInputs = [...elements.dimensionFilterList.querySelectorAll('input:not([value="all"])')];
      const allInput = elements.dimensionFilterList.querySelector('input[value="all"]');
      if (input.value === "all") groupInputs.forEach((item) => { item.checked = input.checked; });
      dimensionGroups = new Set(groupInputs.filter((item) => item.checked).map((item) => item.value));
      allInput.checked = groupInputs.length > 0 && groupInputs.every((item) => item.checked);
      renderer.setDimensionGroups(dimensionGroups);
    });
  }
}

async function setActivePlan(plan, { persist = true } = {}) {
  activePlan = plan;
  clearCandidatePreview();
  activePlan.plan.features = (activePlan.plan.features ?? []).filter((feature) => feature.kind !== "column");
  alignCurtainsToOpenings(activePlan.plan);
  alignSupportedFurniture(activePlan.plan);
  history.length = 0;
  updateUndoButton();
  renderer.render(plan);
  updateSummary();
  updateWallView();
  renderDeliveryView();
  renderCandidateGroups();
  updateDimensionFilters();
  updateThreeRoomFilter();
  requestAnimationFrame(() => renderer.fit());
  if (persist) {
    await persistActivePlan();
  }
}

async function importFile(file) {
  const text = await file.text();
  const parsed = validatePlan(JSON.parse(text));
  await setActivePlan(parsed);
  elements.dataMenu.close();
  showToast("間取りデータを端末内に保存しました");
}

function exportPlan() {
  if (!activePlan) return showToast("書き出すデータがありません");
  const blob = new Blob([JSON.stringify(activePlan, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `madori-backup-${date}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("バックアップを書き出しました");
}

function showDetail(type, item, { origin = activeView === "three" ? "three" : "plan" } = {}) {
  if (!type || !item) {
    selectedFurnitureId = null;
    renderer.setSelectedFurniture(null);
    if (elements.detailDialog.open) elements.detailDialog.close();
    return;
  }
  detailOrigin = origin;
  selectedFurnitureId = type === "furniture" ? item.id : null;
  preserveFurnitureSelectionOnClose = false;
  renderer.setSelectedFurniture(origin === "plan" ? selectedFurnitureId : null);
  const furnitureEditable = type === "furniture" && !locked && activeView === "plan";
  const curtainAttached = type === "furniture" && inferFurnitureKind(item) === "curtain";
  elements.furnitureViewActions.hidden = type !== "furniture";
  if (type === "furniture") {
    const showPlanAction = origin !== "plan";
    elements.showFurnitureInPlanButton.hidden = !showPlanAction;
    elements.showFurnitureInThreeButton.hidden = false;
    elements.showFurnitureInPlanButton.textContent = "2Dで位置を表示";
    elements.showFurnitureInThreeButton.textContent = origin === "three" ? "3Dで近寄る" : "3Dで位置を表示";
    elements.furnitureViewActions.classList.toggle("single-action", !showPlanAction);
  }
  elements.furnitureActions.hidden = !furnitureEditable;
  elements.furnitureRoomEditGroup.hidden = !furnitureEditable || curtainAttached;
  elements.rotateFurnitureButton.hidden = curtainAttached;
  elements.duplicateFurnitureButton.hidden = curtainAttached;
  const typeLabels = { room: "ROOM", dimension: "DIMENSION", opening: "OPENING", feature: "EQUIPMENT", outlet: "OUTLET", switch: "SWITCH", furniture: "FURNITURE" };
  const detailClasses = ["detail-room", "detail-dimension", "detail-equipment", "detail-furniture"];
  elements.detailDialog.classList.remove(...detailClasses);
  elements.detailDialog.classList.add(type === "room" ? "detail-room" : type === "dimension" ? "detail-dimension" : type === "furniture" ? "detail-furniture" : "detail-equipment");
  elements.detailType.textContent = typeLabels[type] ?? "DETAIL";
  elements.detailTitle.textContent = item.name;
  const room = item.roomId ? activePlan.plan.rooms.find((candidate) => candidate.id === item.roomId) : null;
  const support = type === "furniture" ? findSupportItem(activePlan.plan, item.supportId) : null;
  const curtainWindow = curtainAttached ? activePlan.plan.openings.find((opening) => opening.id === item.openingId) : null;
  const vertical = type === "furniture" ? resolveFurnitureVerticalRange(activePlan.plan, item) : null;
  const detailItem = type === "furniture" && room
    ? { ...item, roomName: room.name, openingName: curtainWindow?.name, supportName: support?.name, supportFit: curtainAttached ? null : analyzeFurnitureSupportFit(item, activePlan.plan), vertical, placement: curtainAttached ? { inside: true, boundaries: null } : analyzeFurniturePlacement(item, room), conflicts: analyzeFurnitureConflicts(item, activePlan.plan) }
    : room ? { ...item, roomName: room.name } : item;
  elements.detailBody.innerHTML = detailMarkup(type, detailItem);
  if (type === "furniture") {
    elements.furnitureRoomEdit.replaceChildren(...activePlan.plan.rooms.map((candidate) => new Option(candidate.name, candidate.id, false, candidate.id === item.roomId)));
    const stackCount = furnitureDescendantIds(item.id).size + 1;
    elements.duplicateFurnitureButton.textContent = stackCount > 1 ? `一式を複製（${stackCount}点）` : "複製";
    elements.deleteFurnitureButton.textContent = stackCount > 1 ? `一式を削除（${stackCount}点）` : "削除";
  }
  elements.detailDialog.showModal();
}

elements.detailDialog.addEventListener("click", (event) => {
  if (event.target === elements.detailDialog) elements.detailDialog.close();
});
elements.detailDialog.addEventListener("close", () => {
  const preserveSelection = preserveFurnitureSelectionOnClose || preserveThreeSelectionOnClose || preservePlanSelectionOnClose;
  preserveFurnitureSelectionOnClose = false;
  preserveThreeSelectionOnClose = false;
  preservePlanSelectionOnClose = false;
  detailOrigin = null;
  if (preserveSelection) return;
  clearThreeSelection();
  clearPlanSelection();
  selectedFurnitureId = null;
  renderer.setSelectedFurniture(null);
});
elements.planSelectionDetailsButton.addEventListener("click", () => {
  if (!planSelectedType || !planSelectedItem) return;
  preservePlanSelectionOnClose = true;
  showDetail(planSelectedType, planSelectedItem, { origin: "plan" });
});
elements.threeSelectionDetailsButton.addEventListener("click", () => {
  if (!threeSelectedType || !threeSelectedItem) return;
  preserveThreeSelectionOnClose = true;
  showDetail(threeSelectedType, threeSelectedItem, { origin: "three" });
});
elements.showFurnitureInPlanButton.addEventListener("click", () => {
  const furniture = selectedFurniture();
  if (!furniture) return;
  preserveFurnitureSelectionOnClose = true;
  clearThreeSelection();
  setFurnitureVisible(true);
  document.querySelector('.tab[data-view="plan"]').click();
  setPlanSelectionPresentation("furniture", furniture, { focus: true });
  elements.detailDialog.close();
  showToast(`「${furniture.name}」を2D中央に表示しました。空白部分をタップすると距離表示を終了します`);
});
elements.showFurnitureInThreeButton.addEventListener("click", () => {
  const furniture = selectedFurniture();
  if (!furniture) return;
  preserveFurnitureSelectionOnClose = true;
  clearPlanSelection();
  threeLayers.furniture = true;
  elements.threeFurnitureToggle.checked = true;
  threeRoomId = furniture.roomId ?? "";
  updateThreeRoomFilter();
  document.querySelector('.tab[data-view="three"]').click();
  const presentation = setThreeSelectionPresentation("furniture", furniture, { focus: true });
  setThreeZoom(1.35);
  elements.detailDialog.close();
  showToast(presentation.label
    ? `「${furniture.name}」を3Dで強調しました（${presentation.tone === "danger" ? "要修正" : "要確認"}）`
    : `「${furniture.name}」を3Dで強調しました`);
});
function selectedFurniture() {
  return activePlan?.plan.furniture.find((item) => item.id === selectedFurnitureId);
}

function supportOverflowSummary(supportFit) {
  const labels = { left: "左", right: "右", top: "上", bottom: "下" };
  const parts = Object.entries(supportFit?.overflowEdgesCm ?? {})
    .filter(([, value]) => value > .001)
    .map(([edge, value]) => `${labels[edge]} ${Math.round(value * 10) / 10} cm`);
  if (parts.length) return parts.join("・");
  const sizeParts = [];
  if (supportFit?.overflowWidthCm > .001) sizeParts.push(`幅 ${Math.round(supportFit.overflowWidthCm * 10) / 10} cm`);
  if (supportFit?.overflowDepthCm > .001) sizeParts.push(`奥行 ${Math.round(supportFit.overflowDepthCm * 10) / 10} cm`);
  return sizeParts.join("・");
}

function placementOverflowSummary(placement) {
  const labels = { left: "左", right: "右", top: "上", bottom: "下" };
  const parts = Object.entries(placement?.overflow ?? {})
    .filter(([, value]) => value > .001)
    .map(([edge, value]) => `${labels[edge]} ${Math.round(value * 10) / 10} cm`);
  if (placement?.crossesIrregularBoundary) parts.push("部屋形状の境界を通過");
  return parts.join("・") || "部屋形状の境界を通過";
}

function furnitureInspectionPresentation(furniture) {
  const room = activePlan.plan.rooms.find((candidate) => candidate.id === furniture.roomId);
  const curtainAttached = inferFurnitureKind(furniture) === "curtain";
  const opening = curtainAttached ? curtainOpening(activePlan.plan, furniture) : null;
  const placement = curtainAttached ? { inside: true } : room ? analyzeFurniturePlacement(furniture, room) : null;
  const supportFit = curtainAttached ? null : analyzeFurnitureSupportFit(furniture, activePlan.plan);
  const conflicts = analyzeFurnitureConflicts(furniture, activePlan.plan);
  const support = findSupportItem(activePlan.plan, furniture.supportId);
  const vertical = resolveFurnitureVerticalRange(activePlan.plan, furniture);
  const formatCm = (value) => Math.round(value * 10) / 10;
  const heightLabel = Number.isFinite(furniture.heightCm)
    ? `${formatCm(furniture.heightCm)} cm`
    : `約${formatCm(vertical.topCm - vertical.bottomCm)} cm（模式）`;
  const installationLabel = curtainAttached
    ? `${opening?.name ?? "窓"}に固定（メイン＋レース）`
    : support
    ? `${support.name}の上・床から ${formatCm(vertical.bottomCm)} cm`
    : vertical.bottomCm > .001
      ? `床から ${formatCm(vertical.bottomCm)} cm`
      : "床置き";
  const issues = [];
  if (placement && !placement.inside) issues.push(`部屋外: ${placementOverflowSummary(placement)}`);
  if (supportFit?.fits === false) issues.push(`設置面超過: ${supportOverflowSummary(supportFit)}`);
  if (conflicts.length) issues.push(`重なり: ${conflicts.map((conflict) => conflict.name).join("、")}`);
  return {
    tone: placement && !placement.inside ? "danger" : issues.length ? "warning" : "normal",
    label: issues.join(" / "),
    summary: `${furniture.name}\n幅 ${formatCm(furniture.widthCm)} cm × 奥行 ${formatCm(furniture.depthCm)} cm × 高さ ${heightLabel}｜${installationLabel}`,
    related: conflicts.filter((conflict) => conflict.type === "furniture" || conflict.type === "feature"),
  };
}

function threeSelectionRoomLabel(item) {
  const roomIds = item.roomIds ?? (item.roomId ? [item.roomId] : []);
  return roomIds
    .map((roomId) => activePlan.plan.rooms.find((room) => room.id === roomId)?.name)
    .filter(Boolean)
    .join("・");
}

function featureSelectionPresentation(feature) {
  const kindLabels = { closet: "クローゼット", cabinet: "収納", kitchen: "キッチン", washbasin: "洗面台", "washer-pan": "洗濯機パン", bathtub: "浴槽", toilet: "便器" };
  const vertical = featureSupportRange(feature);
  const widthCm = feature.overallWidthCm ?? feature.elevationWidthCm ?? feature.widthCm ?? feature.width;
  const depthCm = feature.overallDepthCm ?? feature.depthCm ?? feature.height;
  const heightCm = vertical.topCm - vertical.bottomCm;
  const dimensions = [
    Number.isFinite(widthCm) ? `幅 ${Math.round(widthCm * 10) / 10} cm` : null,
    Number.isFinite(depthCm) ? `奥行 ${Math.round(depthCm * 10) / 10} cm` : null,
    Number.isFinite(heightCm) ? `${vertical.schematic ? "模式高さ 約" : "高さ "}${Math.round(heightCm * 10) / 10} cm` : null,
  ].filter(Boolean).join(" × ");
  const roomLabel = threeSelectionRoomLabel(feature);
  const quality = QUALITY_LABELS[feature.quality ?? (feature.uncertain ? "unmeasured" : "measured")] ?? "";
  return {
    tone: "normal",
    label: "",
    summary: [feature.name, [kindLabels[feature.kind] ?? "設備", roomLabel, quality].filter(Boolean).join("｜"), dimensions].filter(Boolean).join("\n"),
    related: [],
  };
}

function openingSelectionPresentation(opening) {
  const isWindow = String(opening.kind ?? "").includes("window");
  const widthCm = opening.widthCm ?? (opening.from && opening.to ? Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y) : null);
  const dimensions = [
    Number.isFinite(widthCm) ? `幅 ${Math.round(widthCm * 10) / 10} cm` : null,
    Number.isFinite(opening.heightCm) ? `開口高さ ${Math.round(opening.heightCm * 10) / 10} cm` : null,
    isWindow && Number.isFinite(opening.sillHeightCm) ? `床から窓下 ${Math.round(opening.sillHeightCm * 10) / 10} cm` : null,
  ].filter(Boolean).join("｜");
  const roomLabel = threeSelectionRoomLabel(opening);
  const quality = QUALITY_LABELS[opening.quality ?? (opening.uncertain ? "unmeasured" : "measured")] ?? "";
  return {
    tone: "normal",
    label: "",
    summary: [opening.name, [isWindow ? "窓" : "ドア", roomLabel, quality].filter(Boolean).join("｜"), dimensions].filter(Boolean).join("\n"),
    related: [],
  };
}

function electricalSelectionPresentation(type, item) {
  const centerHeight = item.verticalPosition?.centerHeightCm ?? item.verticalPosition?.derivedCenterHeightCm;
  const roomLabel = threeSelectionRoomLabel(item);
  const kindLabel = type === "outlet" ? `コンセント${Number.isFinite(item.receptacleCount) ? ` ${item.receptacleCount}口` : ""}` : "スイッチ";
  const position = [
    Number.isFinite(centerHeight) ? `中心高さ 床から ${Math.round(centerHeight * 10) / 10} cm` : null,
    Number.isFinite(item.horizontalPosition?.offsetCm) ? `水平基準から ${Math.round(item.horizontalPosition.offsetCm * 10) / 10} cm` : null,
  ].filter(Boolean).join("｜");
  const quality = QUALITY_LABELS[item.quality ?? (item.uncertain ? "unmeasured" : "measured")] ?? "";
  return {
    tone: "normal",
    label: "",
    summary: [item.name, [kindLabel, roomLabel, quality].filter(Boolean).join("｜"), position].filter(Boolean).join("\n"),
    related: [],
  };
}

function roomSelectionPresentation(room) {
  const quality = QUALITY_LABELS[room.quality ?? (room.uncertain ? "unmeasured" : "measured")] ?? "";
  return {
    tone: room.uncertain ? "warning" : "normal",
    label: "",
    summary: [room.name, [room.areaLabel, quality].filter(Boolean).join("｜")].filter(Boolean).join("\n"),
    related: [],
  };
}

function dimensionSelectionPresentation(dimension) {
  const valueCm = dimension.valueCm ?? dimension.label;
  const quality = QUALITY_LABELS[dimension.quality ?? (dimension.uncertain ? "unmeasured" : "measured")] ?? "";
  return {
    tone: dimension.uncertain ? "warning" : "normal",
    label: "",
    summary: [dimension.name ?? "寸法", [Number.isFinite(Number(valueCm)) ? `${valueCm} cm` : valueCm, quality].filter(Boolean).join("｜")].filter(Boolean).join("\n"),
    related: [],
  };
}

function selectionPresentation(type, item) {
  if (type === "furniture") return furnitureInspectionPresentation(item);
  if (type === "feature") return featureSelectionPresentation(item);
  if (type === "opening") return openingSelectionPresentation(item);
  if (type === "outlet" || type === "switch") return electricalSelectionPresentation(type, item);
  if (type === "room") return roomSelectionPresentation(item);
  if (type === "dimension") return dimensionSelectionPresentation(item);
  return { tone: "normal", label: "", summary: item?.name ?? "", related: [] };
}

function setThreeSelectionPresentation(type, item, { focus = false, selectionMeta = null } = {}) {
  const presentation = selectionPresentation(type, item);
  const candidateHint = selectionMeta?.candidateCount > 1
    ? `候補 ${selectionMeta.candidateIndex + 1}/${selectionMeta.candidateCount}｜同じ場所をもう一度タップして切り替え`
    : "";
  threeSelectedType = type;
  threeSelectedItem = item;
  elements.threeSelectionStatus.hidden = !presentation.summary;
  elements.threeSelectionStatus.className = `three-selection-status selection-status-card ${presentation.tone}`;
  elements.threeSelectionSummary.textContent = [
    presentation.summary,
    presentation.label ? `${presentation.tone === "danger" ? "要修正" : "要確認"}｜${presentation.label}` : "",
    candidateHint,
  ].filter(Boolean).join("\n");
  webglThreeView?.setSelection(type, item, { tone: presentation.tone, focus, related: presentation.related });
  return presentation;
}

function setPlanSelectionPresentation(type, item, { focus = false } = {}) {
  const presentation = selectionPresentation(type, item);
  planSelectedType = type;
  planSelectedItem = item;
  elements.planSelectionStatus.hidden = !presentation.summary;
  elements.planSelectionStatus.className = `plan-selection-status selection-status-card ${presentation.tone}`;
  elements.planSelectionSummary.textContent = [
    presentation.summary,
    presentation.label ? `${presentation.tone === "danger" ? "要修正" : "要確認"}｜${presentation.label}` : "",
  ].filter(Boolean).join("\n");
  renderer.setSelectedFurniture(type === "furniture" ? item.id : null);
  if (focus && type === "furniture") renderer.focusFurniture(item.id);
  return presentation;
}

function handlePlanSelection(type, item) {
  if (!type || !item) return clearPlanSelection();
  setPlanSelectionPresentation(type, item);
}

function clearPlanSelection() {
  planSelectedType = null;
  planSelectedItem = null;
  elements.planSelectionStatus.hidden = true;
  elements.planSelectionSummary.textContent = "";
  elements.planSelectionStatus.className = "plan-selection-status selection-status-card";
  renderer.setSelectedFurniture(null);
}

function clearThreeSelection() {
  threeSelectedType = null;
  threeSelectedItem = null;
  elements.threeSelectionStatus.hidden = true;
  elements.threeSelectionSummary.textContent = "";
  elements.threeSelectionStatus.className = "three-selection-status selection-status-card";
  webglThreeView?.clearSelection();
}

function furnitureCandidateGroups() {
  return activePlan?.plan?.furnitureCandidateGroups ?? [];
}

function candidateLinkedFurniture(group) {
  return activePlan?.plan?.furniture?.find((item) => item.id === group?.furnitureId) ?? null;
}

function clearCandidatePreview() {
  candidatePreview = null;
  renderer.setCandidatePreview(null);
  if (elements.candidatePreviewBar) elements.candidatePreviewBar.hidden = true;
  if (elements.candidatePreviewLabel) elements.candidatePreviewLabel.textContent = "";
}

function candidatePlacementResult(group, candidate) {
  const furniture = candidateLinkedFurniture(group);
  if (!furniture) return { tone: "muted", label: "配置家具と未連携" };
  const preview = previewFurnitureCandidate(furniture, candidate);
  if (!preview) return { tone: "danger", label: "寸法を確認" };
  if (inferFurnitureKind(preview) === "curtain") {
    return alignCurtainToOpening(activePlan.plan, preview)
      ? { tone: "ok", label: "選択した窓に固定" }
      : { tone: "danger", label: "設置先窓を確認" };
  }
  alignFurnitureToSupport(activePlan.plan, preview);
  const room = activePlan.plan.rooms.find((item) => item.id === preview.roomId);
  const inside = analyzeFurniturePlacement(preview, room).inside;
  const conflicts = analyzeFurnitureConflicts(preview, activePlan.plan);
  const supportFit = analyzeFurnitureSupportFit(preview, activePlan.plan);
  const warnings = [];
  if (!inside) warnings.push("部屋外");
  if (conflicts.length) warnings.push("重なり");
  if (supportFit?.fits === false) warnings.push("設置面超過");
  return warnings.length
    ? { tone: "warning", label: `要確認：${warnings.join("・")}` }
    : { tone: "ok", label: "現在位置で配置OK" };
}

function candidateDeliveryResult(group, candidate) {
  if (!candidate.deliveryDimensions) return "梱包寸法未登録";
  const furniture = candidateLinkedFurniture(group);
  if (!furniture) return `${candidate.deliveryDimensions.sideACm}×${candidate.deliveryDimensions.sideBCm}×${candidate.deliveryDimensions.sideCCm} cm`;
  const preview = previewFurnitureCandidate(furniture, candidate);
  if (!preview) return "寸法を確認";
  const analysis = analyzeDeliveryRoute(preview, activePlan);
  if (analysis.status === "candidate") return "数値上は通過候補";
  if (analysis.status === "review") return "搬入要再確認";
  return "判定情報不足";
}

function showCandidatePreview(group, candidate) {
  const furniture = candidateLinkedFurniture(group);
  if (!furniture) return showToast("先に比較グループを配置家具と連携してください");
  candidatePreview = { groupId: group.id, candidateId: candidate.id, furnitureId: furniture.id };
  const label = `${candidate.brand} ${candidate.productName}`.trim();
  renderer.setCandidatePreview({ furnitureId: furniture.id, candidate, label });
  elements.candidatePreviewLabel.textContent = `${label}（${candidate.widthCm}×${candidate.depthCm}×${candidate.heightCm} cm）`;
  elements.candidatePreviewBar.hidden = false;
  document.querySelector('.tab[data-view="plan"]').click();
  renderer.focusFurniture(furniture.id);
  showToast("候補寸法を破線で表示しています。まだ保存されていません");
}

async function adoptCandidate(group, candidate) {
  const furniture = candidateLinkedFurniture(group);
  if (!furniture) return showToast("先に比較グループを配置家具と連携してください");
  pushHistory();
  applyFurnitureCandidate(furniture, candidate, group.id);
  if (inferFurnitureKind(furniture) === "curtain") alignCurtainToOpening(activePlan.plan, furniture);
  else alignFurnitureToSupport(activePlan.plan, furniture);
  alignSupportedFurniture(activePlan.plan);
  clearCandidatePreview();
  renderer.render(activePlan);
  renderDeliveryView();
  renderCandidateGroups();
  await persistActivePlan();
  showToast(`${candidate.brand} ${candidate.productName}の寸法・価格・URLを採用しました`);
}

function candidateComparisonTable(group) {
  const candidates = group.candidates ?? [];
  if (candidates.length < 2) return null;
  const wrapper = document.createElement("div");
  wrapper.className = "candidate-comparison-scroll";
  const table = document.createElement("table");
  table.className = "candidate-comparison-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "比較";
  headRow.append(corner, ...candidates.map((candidate) => {
    const cell = document.createElement("th");
    cell.textContent = `${candidate.brand}\n${candidate.productName}`;
    return cell;
  }));
  head.append(headRow);
  const body = document.createElement("tbody");
  const rows = [
    ["サイズ", (candidate) => `${candidate.widthCm}×${candidate.depthCm}×${candidate.heightCm} cm`],
    ["価格", (candidate) => Number.isInteger(candidate.priceYen) ? `${candidate.priceYen.toLocaleString("ja-JP")}円` : "未登録"],
    ["確認日", (candidate) => candidate.priceCheckedAt || "—"],
    ["色・型", (candidate) => candidate.variant || "—"],
    ["配置", (candidate) => candidatePlacementResult(group, candidate).label],
    ["梱包・搬入", (candidate) => candidateDeliveryResult(group, candidate)],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.textContent = label;
    row.append(heading, ...candidates.map((candidate) => {
      const cell = document.createElement("td");
      cell.textContent = value(candidate);
      return cell;
    }));
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function openCandidateGroupDialog(group = null) {
  editingCandidateGroupId = group?.id ?? null;
  const furniture = activePlan?.plan?.furniture ?? [];
  elements.candidateGroupFurniture.replaceChildren(
    new Option("配置家具と連携しない", ""),
    ...furniture.map((item) => {
      const room = activePlan.plan.rooms.find((candidate) => candidate.id === item.roomId);
      return new Option(`${item.name}${room ? `（${room.name}）` : ""}`, item.id);
    }),
  );
  elements.candidateGroupName.value = group?.name ?? "";
  elements.candidateGroupFurniture.value = group?.furnitureId ?? "";
  elements.candidateGroupDialogTitle.textContent = group ? "比較グループを編集" : "比較グループを追加";
  elements.candidateGroupSubmitButton.textContent = group ? "変更を保存" : "追加する";
  elements.candidateGroupDialog.showModal();
}

function openCandidateDialog(group, candidate = null) {
  editingCandidateGroupId = group.id;
  editingCandidateId = candidate?.id ?? null;
  elements.candidateBrand.value = candidate?.brand ?? "";
  elements.candidateProductName.value = candidate?.productName ?? "";
  elements.candidateProductUrl.value = candidate?.productUrl ?? "";
  elements.candidateWidth.value = candidate?.widthCm ?? "";
  elements.candidateDepth.value = candidate?.depthCm ?? "";
  elements.candidateHeight.value = candidate?.heightCm ?? "";
  elements.candidatePrice.value = Number.isInteger(candidate?.priceYen) ? candidate.priceYen : "";
  elements.candidatePriceCheckedAt.value = candidate?.priceCheckedAt ?? "";
  elements.candidateVariant.value = candidate?.variant ?? "";
  elements.candidateDeliverySideA.value = candidate?.deliveryDimensions?.sideACm ?? "";
  elements.candidateDeliverySideB.value = candidate?.deliveryDimensions?.sideBCm ?? "";
  elements.candidateDeliverySideC.value = candidate?.deliveryDimensions?.sideCCm ?? "";
  elements.candidateNote.value = candidate?.note ?? "";
  elements.candidateDialogTitle.textContent = candidate ? "商品候補を編集" : `${group.name}に商品を追加`;
  elements.candidateSubmitButton.textContent = candidate ? "変更を保存" : "追加する";
  elements.candidateDialog.showModal();
}

function renderCandidateGroups() {
  const groups = furnitureCandidateGroups();
  elements.candidateEmpty.hidden = groups.length > 0;
  const cards = groups.map((group) => {
    const card = document.createElement("section");
    card.className = "candidate-group-card";
    const heading = document.createElement("div");
    heading.className = "candidate-group-heading";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = group.name;
    const linked = document.createElement("p");
    const furniture = candidateLinkedFurniture(group);
    linked.textContent = furniture ? `配置家具：${furniture.name}` : "配置家具：未連携";
    titleWrap.append(title, linked);
    const headingActions = document.createElement("div");
    const editGroup = document.createElement("button");
    editGroup.type = "button";
    editGroup.textContent = "編集";
    editGroup.addEventListener("click", () => openCandidateGroupDialog(group));
    const deleteGroup = document.createElement("button");
    deleteGroup.type = "button";
    deleteGroup.className = "danger-text";
    deleteGroup.textContent = "削除";
    deleteGroup.addEventListener("click", async () => {
      if (!confirm(`「${group.name}」と商品候補を削除しますか？`)) return;
      pushHistory();
      const linkedFurniture = candidateLinkedFurniture(group);
      if (linkedFurniture?.candidateGroupId === group.id) {
        delete linkedFurniture.appliedCandidateId;
        delete linkedFurniture.candidateGroupId;
      }
      activePlan.plan.furnitureCandidateGroups = groups.filter((item) => item.id !== group.id);
      if (candidatePreview?.groupId === group.id) clearCandidatePreview();
      renderCandidateGroups();
      await persistActivePlan();
    });
    headingActions.append(editGroup, deleteGroup);
    heading.append(titleWrap, headingActions);
    card.append(heading);

    const candidates = group.candidates ?? [];
    const list = document.createElement("div");
    list.className = "candidate-product-list";
    for (const candidate of candidates) {
      const item = document.createElement("article");
      item.className = "candidate-product-card";
      if (furniture?.appliedCandidateId === candidate.id) item.classList.add("is-applied");
      const top = document.createElement("div");
      top.className = "candidate-product-top";
      const identity = document.createElement("div");
      const brand = document.createElement("span");
      brand.className = "candidate-brand";
      brand.textContent = candidate.brand;
      const productName = document.createElement("strong");
      productName.textContent = candidate.productName;
      identity.append(brand, productName);
      const price = document.createElement("strong");
      price.className = "candidate-price";
      price.textContent = Number.isInteger(candidate.priceYen) ? `${candidate.priceYen.toLocaleString("ja-JP")}円` : "価格未登録";
      top.append(identity, price);
      const size = document.createElement("p");
      size.className = "candidate-size";
      const packageSize = candidate.deliveryDimensions
        ? `・梱包 ${candidate.deliveryDimensions.sideACm}×${candidate.deliveryDimensions.sideBCm}×${candidate.deliveryDimensions.sideCCm} cm`
        : "・梱包寸法未登録";
      size.textContent = `${candidate.widthCm}×${candidate.depthCm}×${candidate.heightCm} cm${candidate.variant ? `・${candidate.variant}` : ""}${packageSize}`;
      const placement = candidatePlacementResult(group, candidate);
      const status = document.createElement("p");
      status.className = `candidate-placement ${placement.tone}`;
      status.textContent = `${placement.label}${furniture?.appliedCandidateId === candidate.id ? "・採用中" : ""}`;
      if (candidate.note) {
        const note = document.createElement("p");
        note.className = "candidate-note";
        note.textContent = candidate.note;
        item.append(top, size, status, note);
      } else item.append(top, size, status);
      const actions = document.createElement("div");
      actions.className = "candidate-product-actions";
      const link = document.createElement("a");
      link.href = candidate.productUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "商品ページ ↗";
      const preview = document.createElement("button");
      preview.type = "button";
      preview.textContent = "2Dで試す";
      preview.disabled = !furniture;
      preview.addEventListener("click", () => showCandidatePreview(group, candidate));
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "candidate-apply-button";
      apply.textContent = furniture?.appliedCandidateId === candidate.id ? "採用中" : "採用";
      apply.disabled = !furniture || furniture?.appliedCandidateId === candidate.id;
      apply.addEventListener("click", () => adoptCandidate(group, candidate));
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "編集";
      edit.addEventListener("click", () => openCandidateDialog(group, candidate));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger-text";
      remove.textContent = "削除";
      remove.addEventListener("click", async () => {
        if (!confirm(`${candidate.brand} ${candidate.productName}を削除しますか？`)) return;
        pushHistory();
        if (furniture?.appliedCandidateId === candidate.id) {
          delete furniture.appliedCandidateId;
          delete furniture.candidateGroupId;
        }
        group.candidates = group.candidates.filter((itemCandidate) => itemCandidate.id !== candidate.id);
        if (candidatePreview?.candidateId === candidate.id) clearCandidatePreview();
        renderCandidateGroups();
        await persistActivePlan();
      });
      actions.append(link, preview, apply, edit, remove);
      item.append(actions);
      list.append(item);
    }
    card.append(list);
    const comparison = candidateComparisonTable(group);
    if (comparison) card.append(comparison);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "candidate-add-product";
    add.textContent = "＋ 商品候補を追加";
    add.addEventListener("click", () => openCandidateDialog(group));
    card.append(add);
    return card;
  });
  elements.candidateGroupList.replaceChildren(...cards);
}

function renderFurnitureList() {
  const furnitureItems = activePlan?.plan.furniture ?? [];
  const roomsWithFurniture = activePlan.plan.rooms.filter((room) => furnitureItems.some((item) => item.roomId === room.id));
  if (furnitureListRoomId && !roomsWithFurniture.some((room) => room.id === furnitureListRoomId)) furnitureListRoomId = "";
  elements.furnitureListRoomFilter.replaceChildren(
    new Option("すべての部屋", "", false, !furnitureListRoomId),
    ...roomsWithFurniture.map((room) => new Option(room.name, room.id, false, room.id === furnitureListRoomId)),
  );
  const hierarchy = buildFurnitureHierarchy(activePlan.plan);
  const roomHierarchy = furnitureListRoomId
    ? hierarchy.filter(({ furniture }) => furniture.roomId === furnitureListRoomId)
    : hierarchy;
  const priceSummary = furniturePriceSummary(roomHierarchy.map(({ furniture }) => furniture));
  const priceTotal = document.createElement("strong");
  priceTotal.textContent = `登録済み合計 ${priceSummary.totalYen.toLocaleString("ja-JP")}円`;
  const priceMeta = document.createElement("span");
  priceMeta.textContent = `価格登録済み ${priceSummary.registeredCount}点・未登録 ${priceSummary.missingCount}点`;
  elements.furnitureListPriceSummary.replaceChildren(priceTotal, priceMeta);
  const issueById = new Map(roomHierarchy.map(({ furniture }) => {
    const room = activePlan.plan.rooms.find((candidate) => candidate.id === furniture.roomId);
    const curtainAttached = inferFurnitureKind(furniture) === "curtain";
    const outside = curtainAttached ? false : !analyzeFurniturePlacement(furniture, room).inside;
    const overlap = analyzeFurnitureConflicts(furniture, activePlan.plan).length > 0;
    const support = curtainAttached ? false : analyzeFurnitureSupportFit(furniture, activePlan.plan)?.fits === false;
    return [furniture.id, { outside, overlap, support, review: outside || overlap || support }];
  }));
  const matchesIssue = (furniture) => !furnitureListIssue || issueById.get(furniture.id)?.[furnitureListIssue] === true;
  const matchesPrice = (furniture) => !furnitureListPrice || (furnitureListPrice === "missing" && !Number.isInteger(furniture.priceYen));
  const matchingIds = new Set(roomHierarchy.filter(({ furniture }) => matchesIssue(furniture) && matchesPrice(furniture)).map(({ furniture }) => furniture.id));
  const includedIds = new Set(matchingIds);
  const furnitureListFilterActive = Boolean(furnitureListIssue || furnitureListPrice);
  if (furnitureListFilterActive) {
    const furnitureById = new Map(furnitureItems.map((item) => [item.id, item]));
    for (const id of matchingIds) {
      let supportId = furnitureById.get(id)?.supportId;
      const seen = new Set();
      while (furnitureById.has(supportId) && !seen.has(supportId)) {
        seen.add(supportId);
        if (issueById.has(supportId)) includedIds.add(supportId);
        supportId = furnitureById.get(supportId).supportId;
      }
    }
  }
  const filteredHierarchy = furnitureListFilterActive
    ? roomHierarchy.filter(({ furniture }) => includedIds.has(furniture.id))
    : roomHierarchy;
  const resultCount = furnitureListFilterActive ? matchingIds.size : filteredHierarchy.length;
  elements.furnitureListCount.textContent = resultCount === furnitureItems.length
    ? String(furnitureItems.length)
    : `${resultCount} / ${furnitureItems.length}`;
  if (!furnitureItems.length) {
    const empty = document.createElement("p");
    empty.className = "furniture-list-empty";
    empty.textContent = "配置した家具はありません。";
    elements.furnitureList.replaceChildren(empty);
    return;
  }
  if (!filteredHierarchy.length) {
    const empty = document.createElement("p");
    empty.className = "furniture-list-empty";
    empty.textContent = furnitureListFilterActive ? "この条件に該当する家具はありません。" : "この部屋に配置した家具はありません。";
    elements.furnitureList.replaceChildren(empty);
    return;
  }
  const furnitureById = new Map(furnitureItems.map((item) => [item.id, item]));
  const visibleIds = new Set(filteredHierarchy.map(({ furniture }) => furniture.id));
  const childIdsByParent = new Map();
  for (const item of furnitureItems) {
    if (!furnitureById.has(item.supportId) || !visibleIds.has(item.id)) continue;
    if (!childIdsByParent.has(item.supportId)) childIdsByParent.set(item.supportId, []);
    childIdsByParent.get(item.supportId).push(item.id);
  }
  const isHiddenByCollapsedAncestor = (furniture) => {
    let supportId = furniture.supportId;
    const seen = new Set();
    while (furnitureById.has(supportId) && !seen.has(supportId)) {
      if (collapsedFurnitureIds.has(supportId)) return true;
      seen.add(supportId);
      supportId = furnitureById.get(supportId).supportId;
    }
    return false;
  };
  const rows = filteredHierarchy.filter(({ furniture }) => !isHiddenByCollapsedAncestor(furniture)).map(({ furniture, depth }) => {
    const room = activePlan.plan.rooms.find((candidate) => candidate.id === furniture.roomId);
    const curtainAttached = inferFurnitureKind(furniture) === "curtain";
    const placement = curtainAttached ? { inside: true } : analyzeFurniturePlacement(furniture, room);
    const conflicts = analyzeFurnitureConflicts(furniture, activePlan.plan);
    const supportFit = curtainAttached ? null : analyzeFurnitureSupportFit(furniture, activePlan.plan);
    const vertical = resolveFurnitureVerticalRange(activePlan.plan, furniture);
    const wrapper = document.createElement("div");
    wrapper.className = "furniture-list-row";
    wrapper.classList.toggle("is-nested", depth > 0);
    wrapper.style.setProperty("--tree-indent", `${depth * 16}px`);
    const row = document.createElement("button");
    row.type = "button";
    row.className = `furniture-list-item ${!placement.inside ? "danger" : supportFit?.fits === false || conflicts.length ? "warning" : ""}`;
    const name = document.createElement("strong");
    name.textContent = `${depth > 0 ? "↳ " : ""}${furniture.name}`;
    const roomLabel = document.createElement("span");
    const support = findSupportItem(activePlan.plan, furniture.supportId);
    const statuses = [];
    if (furnitureListFilterActive && !matchingIds.has(furniture.id)) statuses.push("関連家具");
    if (!placement.inside) statuses.push("部屋外");
    if (supportFit?.fits === false) statuses.push("設置面からはみ出し");
    if (conflicts.length) statuses.push("重なりあり");
    roomLabel.textContent = `${room?.name ?? "未設定"}${support ? `・${support.name}の上` : ""}${statuses.map((status) => `・${status}`).join("")}`;
    const heightLabel = document.createElement("span");
    heightLabel.className = "furniture-list-height";
    const topLabel = vertical.schematic ? `最上部 約${vertical.topCm} cm（模式）` : `最上部 ${vertical.topCm} cm`;
    heightLabel.textContent = vertical.bottomCm > 0 ? `底面 ${vertical.bottomCm} cm・${topLabel}` : topLabel;
    const priceLabel = document.createElement("span");
    priceLabel.className = `furniture-list-price ${Number.isInteger(furniture.priceYen) ? "registered" : ""}`;
    priceLabel.textContent = Number.isInteger(furniture.priceYen) ? `税込 ${furniture.priceYen.toLocaleString("ja-JP")}円` : "価格未登録";
    const size = document.createElement("span");
    size.className = "furniture-list-size";
    size.textContent = Number.isFinite(furniture.heightCm)
      ? `${furniture.widthCm}×${furniture.depthCm}×高さ${furniture.heightCm} cm`
      : `${furniture.widthCm}×${furniture.depthCm} cm・高さ未登録`;
    const issueDetails = [];
    if (!placement.inside) issueDetails.push(`部屋外: ${placementOverflowSummary(placement)}`);
    if (supportFit?.fits === false) issueDetails.push(`設置面超過: ${supportOverflowSummary(supportFit)}`);
    if (conflicts.length) issueDetails.push(`重なり: ${conflicts.map((conflict) => conflict.name).join("、")}`);
    row.append(name, roomLabel);
    if (issueDetails.length) {
      const issueLabel = document.createElement("span");
      issueLabel.className = "furniture-list-issues";
      issueLabel.textContent = issueDetails.join(" / ");
      row.append(issueLabel);
    }
    row.append(heightLabel, priceLabel, size);
    row.addEventListener("click", () => {
      elements.furnitureListDialog.close();
      setFurnitureVisible(true);
      showDetail("furniture", furniture, { origin: "list" });
    });
    wrapper.append(row);
    const actions = document.createElement("div");
    actions.className = "furniture-list-actions";
    const productUrl = normalizeFurnitureProductUrl(furniture.productUrl);
    if (productUrl) {
      const productLink = document.createElement("a");
      productLink.className = "furniture-list-product-link";
      productLink.href = productUrl;
      productLink.target = "_blank";
      productLink.rel = "noopener noreferrer";
      productLink.textContent = "↗";
      productLink.setAttribute("aria-label", `${furniture.name}の商品ページを開く`);
      actions.append(productLink);
    }
    const childIds = childIdsByParent.get(furniture.id) ?? [];
    if (childIds.length) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "furniture-list-collapse";
      const collapsed = collapsedFurnitureIds.has(furniture.id);
      toggle.textContent = collapsed ? "+" : "−";
      toggle.setAttribute("aria-label", `${furniture.name}の上の家具を${collapsed ? "表示" : "折りたたむ"}`);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.addEventListener("click", () => {
        if (collapsed) collapsedFurnitureIds.delete(furniture.id);
        else collapsedFurnitureIds.add(furniture.id);
        renderFurnitureList();
      });
      actions.append(toggle);
    }
    if (actions.childElementCount) wrapper.append(actions);
    return wrapper;
  });
  elements.furnitureList.replaceChildren(...rows);
}

async function commitFurnitureChange(message) {
  alignSupportedFurniture(activePlan.plan);
  renderer.render(activePlan);
  renderDeliveryView();
  await persistActivePlan();
  elements.detailDialog.close();
  selectedFurnitureId = null;
  renderer.setSelectedFurniture(null);
  showToast(message);
}

function setFurnitureVisible(value) {
  elements.displayFurnitureToggle.checked = value;
  renderer.setFurnitureVisible(value);
}

function closeToolMenus(except = null) {
  for (const [button, menu] of [[elements.displayMenuButton, elements.displayMenu], [elements.selectionMenuButton, elements.selectionMenu], [elements.furnitureMenuButton, elements.furnitureMenu]]) {
    if (menu === except) continue;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
}

function toggleToolMenu(button, menu) {
  const willOpen = menu.hidden;
  closeToolMenus(menu);
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
}

function syncSelectableControls() {
  const mode = locked ? "view" : "edit";
  const selected = selectableByMode[mode];
  elements.selectionModeHint.textContent = locked ? "閲覧モードの設定" : "編集モードの設定";
  document.querySelectorAll("[data-selectable]").forEach((input) => { input.checked = selected.has(input.dataset.selectable); });
  renderer.setSelectableTypes(selected);
}

function setWallDisplayMode(mode) {
  wallDisplayMode = mode;
  const diagramActive = mode === "diagram";
  elements.wallDiagramModeButton.classList.toggle("is-active", diagramActive);
  elements.wallDiagramModeButton.setAttribute("aria-pressed", String(diagramActive));
  elements.wallHeightModeButton.classList.toggle("is-active", !diagramActive);
  elements.wallHeightModeButton.setAttribute("aria-pressed", String(!diagramActive));
  updateWallView();
}

function setWallViewportMode(mode) {
  wallViewportMode = mode === "overview" ? "overview" : "scroll";
  const overviewActive = wallViewportMode === "overview";
  elements.wallSvgScroll.classList.toggle("is-overview", overviewActive);
  elements.wallScrollViewButton.classList.toggle("is-active", !overviewActive);
  elements.wallScrollViewButton.setAttribute("aria-pressed", String(!overviewActive));
  elements.wallOverviewButton.classList.toggle("is-active", overviewActive);
  elements.wallOverviewButton.setAttribute("aria-pressed", String(overviewActive));
  if (overviewActive) elements.wallSvgScroll.scrollLeft = 0;
}

function setOtherView(view) {
  activeOtherView = ["wall", "delivery", "candidates"].includes(view) ? view : "wall";
  document.querySelectorAll(".other-tab").forEach((tab) => {
    const active = tab.dataset.otherView === activeOtherView;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll(".other-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === `${activeOtherView}View`));
  if (activeOtherView === "wall") updateWallView();
  if (activeOtherView === "delivery") renderDeliveryView();
  if (activeOtherView === "candidates") renderCandidateGroups();
}

document.querySelectorAll(".other-tab").forEach((tab) => tab.addEventListener("click", () => setOtherView(tab.dataset.otherView)));

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  if (tab.dataset.view !== "plan" && renderer.measurementMode) setMeasurementMode(false);
  activeView = tab.dataset.view;
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  document.getElementById(`${tab.dataset.view}View`).classList.add("is-active");
  webglThreeView?.setSuspended(document.hidden || activeView !== "three");
  if (tab.dataset.view === "other") setOtherView(activeOtherView);
  if (tab.dataset.view === "three") updateThreeView();
}));

elements.threeCutawayToggle.addEventListener("change", () => { threeCutaway = elements.threeCutawayToggle.checked; updateThreeView(); });
elements.threeLabelsToggle.addEventListener("change", () => { threeShowLabels = elements.threeLabelsToggle.checked; updateThreeView(); });
elements.threeRoomFilter.addEventListener("change", () => { threeRoomId = elements.threeRoomFilter.value; resetThreeViewport(); updateThreeView(); });
elements.threeOverviewMode.addEventListener("click", () => setThreeCameraMode("overview"));
elements.threeIndoorMode.addEventListener("click", () => setThreeCameraMode("indoor"));
elements.threeIndoorViewpoint.addEventListener("change", () => {
  threeViewpointRoomId = elements.threeIndoorViewpoint.value;
  clearThreeSelection();
  webglThreeView?.setIndoorViewpoint(threeViewpointRoomId);
  updateThreeView();
});
for (const [toggle, layer] of [
  [elements.threeWallsToggle, "walls"],
  [elements.threeOpeningsToggle, "openings"],
  [elements.threeFeaturesToggle, "features"],
  [elements.threeFurnitureToggle, "furniture"],
  [elements.threeElectricalToggle, "electrical"],
]) toggle.addEventListener("change", () => { threeLayers[layer] = toggle.checked; updateThreeView(); });

elements.threeZoomOut.addEventListener("click", () => setThreeZoom((webglThreeView?.getZoom() ?? 1) - .25));
elements.threeZoomIn.addEventListener("click", () => setThreeZoom((webglThreeView?.getZoom() ?? 1) + .25));
elements.threeZoomReset.addEventListener("click", resetThreeViewport);

elements.wallDiagramModeButton.addEventListener("click", () => setWallDisplayMode("diagram"));
elements.wallHeightModeButton.addEventListener("click", () => setWallDisplayMode("height"));
elements.wallScrollViewButton.addEventListener("click", () => setWallViewportMode("scroll"));
elements.wallOverviewButton.addEventListener("click", () => setWallViewportMode("overview"));

elements.menuButton.addEventListener("click", () => elements.dataMenu.showModal());
elements.displayMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleToolMenu(elements.displayMenuButton, elements.displayMenu);
});
elements.selectionMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleToolMenu(elements.selectionMenuButton, elements.selectionMenu);
});
elements.measureButton.addEventListener("click", () => setMeasurementMode(!renderer.measurementMode));
elements.measurementClearButton.addEventListener("click", () => renderer.clearMeasurement());
elements.measurementEndButton.addEventListener("click", () => setMeasurementMode(false));
elements.furnitureMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleToolMenu(elements.furnitureMenuButton, elements.furnitureMenu);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".tool-menu")) closeToolMenus();
});
document.querySelectorAll("[data-selectable]").forEach((input) => input.addEventListener("change", () => {
  const selected = selectableByMode[locked ? "view" : "edit"];
  if (input.checked) selected.add(input.dataset.selectable);
  else selected.delete(input.dataset.selectable);
  renderer.setSelectableTypes(selected);
}));
[elements.importButton, elements.emptyImportButton].forEach((button) => button.addEventListener("click", () => elements.fileInput.click()));
elements.fileInput.addEventListener("change", async () => {
  const [file] = elements.fileInput.files;
  if (!file) return;
  try { await importFile(file); } catch (error) { showToast(`読み込み失敗: ${error.message}`); }
  elements.fileInput.value = "";
});
elements.exportButton.addEventListener("click", exportPlan);
elements.sampleButton.addEventListener("click", () => setActivePlan(createSamplePlan()).then(() => showToast("架空サンプルを読み込みました")));
elements.furnitureButton.addEventListener("click", () => {
  closeToolMenus();
  if (!activePlan) return showToast("先に間取りデータを読み込んでください");
  editingFurnitureId = null;
  elements.furnitureRoom.replaceChildren(...activePlan.plan.rooms.map((room) => new Option(room.name, room.id)));
  elements.furnitureWidth.value = "100";
  elements.furnitureDepth.value = "50";
  elements.furnitureHeight.value = "";
  elements.furniturePrice.value = "";
  elements.furnitureProductUrl.value = "";
  elements.furnitureName.value = "家具";
  elements.furniturePreset.value = "custom";
  updateFurnitureSupportOptions();
  updateCurtainFurnitureFields();
  elements.furnitureDialogTitle.textContent = "家具を追加";
  elements.furnitureSubmitButton.textContent = "追加する";
  elements.furnitureDialog.showModal();
});
elements.furnitureListButton.addEventListener("click", () => {
  closeToolMenus();
  if (!activePlan) return showToast("先に間取りデータを読み込んでください");
  renderFurnitureList();
  elements.furnitureListDialog.showModal();
});
elements.addCandidateGroupButton.addEventListener("click", () => {
  if (!activePlan) return showToast("先に間取りデータを読み込んでください");
  openCandidateGroupDialog();
});
elements.cancelCandidateGroupButton.addEventListener("click", () => elements.candidateGroupDialog.close());
elements.cancelCandidateButton.addEventListener("click", () => elements.candidateDialog.close());
elements.candidateGroupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activePlan) return;
  const name = elements.candidateGroupName.value.trim();
  if (!name) return showToast("比較グループ名を入力してください");
  pushHistory();
  const groups = furnitureCandidateGroups();
  const existing = groups.find((group) => group.id === editingCandidateGroupId);
  if (existing) {
    existing.name = name;
    existing.furnitureId = elements.candidateGroupFurniture.value || null;
    existing.updatedAt = new Date().toISOString();
  } else {
    groups.push({
      id: crypto.randomUUID(),
      name,
      furnitureId: elements.candidateGroupFurniture.value || null,
      candidates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  editingCandidateGroupId = null;
  elements.candidateGroupDialog.close();
  clearCandidatePreview();
  renderCandidateGroups();
  await persistActivePlan();
  showToast(existing ? "比較グループを変更しました" : "比較グループを追加しました");
});
elements.candidateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const group = furnitureCandidateGroups().find((item) => item.id === editingCandidateGroupId);
  if (!group) return showToast("比較グループが見つかりません");
  const brand = elements.candidateBrand.value.trim();
  const productName = elements.candidateProductName.value.trim();
  const productUrl = normalizeFurnitureProductUrl(elements.candidateProductUrl.value.trim());
  const widthCm = Number(elements.candidateWidth.value);
  const depthCm = Number(elements.candidateDepth.value);
  const heightCm = Number(elements.candidateHeight.value);
  const priceText = elements.candidatePrice.value.trim();
  const priceYen = priceText === "" ? null : Number(priceText);
  const deliveryTexts = [elements.candidateDeliverySideA.value, elements.candidateDeliverySideB.value, elements.candidateDeliverySideC.value].map((value) => value.trim());
  const deliverySides = deliveryTexts.map(Number);
  if (!brand || !productName) return showToast("ブランドと商品名を入力してください");
  if (!productUrl) return showToast("商品ページURLは http:// または https:// から入力してください");
  if (![widthCm, depthCm, heightCm].every((value) => Number.isFinite(value) && value > 0)) return showToast("商品の幅・奥行・高さを確認してください");
  if (priceYen !== null && (!Number.isInteger(priceYen) || priceYen < 0 || priceYen > 999999999)) return showToast("税込価格を1円単位で確認してください");
  if (deliveryTexts.some(Boolean) && (!deliveryTexts.every(Boolean) || !deliverySides.every((value) => Number.isFinite(value) && value > 0))) return showToast("梱包寸法は3辺すべてを入力してください");
  pushHistory();
  const existing = group.candidates.find((candidate) => candidate.id === editingCandidateId);
  const candidate = existing ?? { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  Object.assign(candidate, {
    brand,
    productName,
    productUrl,
    widthCm,
    depthCm,
    heightCm,
    priceCheckedAt: elements.candidatePriceCheckedAt.value || null,
    variant: elements.candidateVariant.value.trim() || null,
    note: elements.candidateNote.value.trim() || null,
    updatedAt: new Date().toISOString(),
  });
  if (priceYen === null) delete candidate.priceYen;
  else candidate.priceYen = priceYen;
  if (deliveryTexts.every(Boolean)) candidate.deliveryDimensions = { sideACm: deliverySides[0], sideBCm: deliverySides[1], sideCCm: deliverySides[2], basis: "packed" };
  else delete candidate.deliveryDimensions;
  if (!existing) group.candidates.push(candidate);
  const linkedFurniture = candidateLinkedFurniture(group);
  if (existing && linkedFurniture?.appliedCandidateId === candidate.id) {
    applyFurnitureCandidate(linkedFurniture, candidate, group.id);
    if (inferFurnitureKind(linkedFurniture) === "curtain") alignCurtainToOpening(activePlan.plan, linkedFurniture);
    else alignFurnitureToSupport(activePlan.plan, linkedFurniture);
    alignSupportedFurniture(activePlan.plan);
    renderer.render(activePlan);
    renderDeliveryView();
  }
  group.updatedAt = new Date().toISOString();
  editingCandidateId = null;
  elements.candidateDialog.close();
  clearCandidatePreview();
  renderCandidateGroups();
  await persistActivePlan();
  showToast(existing ? "商品候補を変更しました" : "商品候補を追加しました");
});
elements.clearCandidatePreviewButton.addEventListener("click", clearCandidatePreview);
elements.adoptCandidatePreviewButton.addEventListener("click", () => {
  if (!candidatePreview) return;
  const group = furnitureCandidateGroups().find((item) => item.id === candidatePreview.groupId);
  const candidate = group?.candidates?.find((item) => item.id === candidatePreview.candidateId);
  if (group && candidate) adoptCandidate(group, candidate);
});
elements.furnitureListRoomFilter.addEventListener("change", () => {
  furnitureListRoomId = elements.furnitureListRoomFilter.value;
  renderFurnitureList();
});
elements.furnitureListIssueFilter.addEventListener("change", () => {
  furnitureListIssue = elements.furnitureListIssueFilter.value;
  collapsedFurnitureIds.clear();
  renderFurnitureList();
});
elements.furnitureListPriceFilter.addEventListener("change", () => {
  furnitureListPrice = elements.furnitureListPriceFilter.value;
  collapsedFurnitureIds.clear();
  renderFurnitureList();
});
elements.furnitureListExpandAll.addEventListener("click", () => {
  collapsedFurnitureIds.clear();
  renderFurnitureList();
});
elements.furniturePreset.addEventListener("change", () => {
  const preset = FURNITURE_PRESETS[elements.furniturePreset.value];
  if (preset) {
    elements.furnitureName.value = preset.name;
    elements.furnitureWidth.value = String(preset.width);
    elements.furnitureDepth.value = String(preset.depth);
    elements.furnitureHeight.value = String(preset.height);
  }
  updateCurtainFurnitureFields({ applyDefaults: elements.furniturePreset.value === "curtain" });
  updateFurnitureSupportHelp();
});
elements.furnitureRoom.addEventListener("change", () => {
  updateFurnitureSupportOptions();
  updateCurtainFurnitureFields({ applyDefaults: elements.furniturePreset.value === "curtain" });
});
elements.furnitureCurtainOpening.addEventListener("change", () => {
  const opening = activePlan?.plan.openings?.find((item) => item.id === elements.furnitureCurtainOpening.value);
  if (opening) applyCurtainOpeningDefaults(opening);
});
elements.furnitureSupport.addEventListener("change", updateFurnitureSupportHelp);
elements.furnitureWidth.addEventListener("input", updateFurnitureSupportHelp);
elements.furnitureDepth.addEventListener("input", updateFurnitureSupportHelp);
elements.cancelFurnitureButton.addEventListener("click", () => {
  editingFurnitureId = null;
  elements.furnitureDialog.close();
});
elements.cancelDeliveryButton.addEventListener("click", () => {
  deliveryFurnitureId = null;
  elements.deliveryDialog.close();
});
elements.deliveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const furniture = activePlan?.plan.furniture.find((item) => item.id === deliveryFurnitureId);
  if (!furniture) return showToast("対象の家具が見つかりません");
  const sides = [Number(elements.deliverySideA.value), Number(elements.deliverySideB.value), Number(elements.deliverySideC.value)];
  if (!sides.every((value) => Number.isFinite(value) && value > 0)) return showToast("搬入寸法を確認してください");
  pushHistory();
  furniture.deliveryDimensions = {
    sideACm: sides[0],
    sideBCm: sides[1],
    sideCCm: sides[2],
    basis: elements.deliveryBasis.value === "body" ? "body" : "packed",
  };
  await persistActivePlan();
  renderDeliveryView();
  deliveryFurnitureId = null;
  elements.deliveryDialog.close();
  showToast("搬入時の寸法を保存しました");
});
elements.furnitureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const room = activePlan.plan.rooms.find((item) => item.id === elements.furnitureRoom.value) ?? activePlan.plan.rooms[0];
  const widthCm = Number(elements.furnitureWidth.value);
  const depthCm = Number(elements.furnitureDepth.value);
  const heightText = elements.furnitureHeight.value.trim();
  const heightCm = heightText === "" ? null : Number(heightText);
  const priceText = elements.furniturePrice.value.trim();
  const priceYen = priceText === "" ? null : Number(priceText);
  const productUrlText = elements.furnitureProductUrl.value.trim();
  const productUrl = normalizeFurnitureProductUrl(productUrlText);
  if (!Number.isFinite(widthCm) || !Number.isFinite(depthCm) || widthCm <= 0 || depthCm <= 0) return showToast("家具寸法を確認してください");
  if (heightCm !== null && (!Number.isFinite(heightCm) || heightCm <= 0)) return showToast("家具の高さを確認してください");
  if (priceYen !== null && (!Number.isInteger(priceYen) || priceYen < 0 || priceYen > 999999999)) return showToast("家具の税込価格を1円単位で確認してください");
  if (productUrlText && !productUrl) return showToast("商品ページURLは http:// または https:// から入力してください");
  const name = elements.furnitureName.value.trim() || "家具";
  const furnitureKind = elements.furniturePreset.value === "custom" ? null : elements.furniturePreset.value;
  const curtainOpeningId = furnitureKind === "curtain" ? elements.furnitureCurtainOpening.value : null;
  if (furnitureKind === "curtain" && !curtainOpeningId) return showToast("取り付ける窓を選んでください");
  const supportId = furnitureKind === "curtain" ? null : (elements.furnitureSupport.value || null);
  if (editingFurnitureId) {
    const furniture = activePlan.plan.furniture.find((item) => item.id === editingFurnitureId);
    if (!furniture) return showToast("編集する家具が見つかりません");
    pushHistory();
    updateFurniture(furniture, { name, roomId: room.id, widthCm, depthCm, heightCm, priceYen, productUrl, supportId, furnitureKind });
    if (furnitureKind === "curtain") {
      furniture.openingId = curtainOpeningId;
      furniture.curtainColor = elements.furnitureCurtainColor.value;
      alignCurtainToOpening(activePlan.plan, furniture);
    } else {
      delete furniture.openingId;
      delete furniture.curtainColor;
      alignFurnitureToSupport(activePlan.plan, furniture);
    }
    alignSupportedFurniture(activePlan.plan);
    renderer.render(activePlan);
    renderDeliveryView();
    await persistActivePlan();
    if (planSelectedType === "furniture" && planSelectedItem?.id === furniture.id) setPlanSelectionPresentation("furniture", furniture);
    if (threeSelectedType === "furniture" && threeSelectedItem?.id === furniture.id) setThreeSelectionPresentation("furniture", furniture);
    editingFurnitureId = null;
    elements.furnitureDialog.close();
    showToast("家具の内容を変更しました");
    return;
  }
  const anchor = room.label ?? room.points[0];
  pushHistory();
  setFurnitureVisible(true);
  const furniture = {
    id: crypto.randomUUID(),
    name,
    roomId: room.id,
    x: anchor.x - widthCm / 2,
    y: anchor.y - depthCm / 2,
    widthCm,
    depthCm,
    quality: "measured",
  };
  if (furnitureKind) furniture.furnitureKind = furnitureKind;
  if (heightCm !== null) furniture.heightCm = heightCm;
  if (priceYen !== null) furniture.priceYen = priceYen;
  if (productUrl) furniture.productUrl = productUrl;
  if (supportId) furniture.supportId = supportId;
  if (furnitureKind === "curtain") {
    furniture.openingId = curtainOpeningId;
    furniture.curtainColor = elements.furnitureCurtainColor.value;
    alignCurtainToOpening(activePlan.plan, furniture);
  } else alignFurnitureToSupport(activePlan.plan, furniture);
  activePlan.plan.furniture.push(furniture);
  renderer.render(activePlan);
  renderDeliveryView();
  await persistActivePlan();
  elements.furnitureDialog.close();
  showToast(furnitureKind === "curtain" ? "カーテンセットを窓に取り付けました" : "家具を追加しました。編集モードで移動できます");
});
elements.editFurnitureButton.addEventListener("click", () => {
  if (locked) return;
  const furniture = selectedFurniture();
  if (!furniture) return;
  editingFurnitureId = furniture.id;
  elements.furniturePreset.value = inferFurnitureKind(furniture);
  elements.furnitureName.value = furniture.name;
  elements.furnitureWidth.value = String(furniture.widthCm);
  elements.furnitureDepth.value = String(furniture.depthCm);
  elements.furnitureHeight.value = Number.isFinite(furniture.heightCm) ? String(furniture.heightCm) : "";
  elements.furniturePrice.value = Number.isInteger(furniture.priceYen) ? String(furniture.priceYen) : "";
  elements.furnitureProductUrl.value = furniture.productUrl ?? "";
  elements.furnitureRoom.replaceChildren(...activePlan.plan.rooms.map((room) => new Option(room.name, room.id, false, room.id === furniture.roomId)));
  updateFurnitureSupportOptions(furniture.supportId ?? "");
  elements.furnitureCurtainColor.value = furniture.curtainColor ?? "greige";
  updateCurtainFurnitureFields({ selectedOpeningId: furniture.openingId ?? "" });
  elements.furnitureSupport.dispatchEvent(new Event("change"));
  elements.furnitureDialogTitle.textContent = "家具を編集";
  elements.furnitureSubmitButton.textContent = "変更を保存";
  elements.detailDialog.close();
  elements.furnitureDialog.showModal();
});
elements.rotateFurnitureButton.addEventListener("click", async () => {
  if (locked) return;
  const furniture = selectedFurniture();
  if (!furniture) return;
  if (inferFurnitureKind(furniture) === "curtain") return showToast("カーテンは取り付け窓に固定されています");
  pushHistory();
  rotateFurnitureStack(activePlan.plan, furniture);
  const supportedCount = furnitureDescendantIds(furniture.id).size;
  await commitFurnitureChange(supportedCount ? "上に載せた家具と一緒に45°回転しました" : "家具を45°回転しました");
});
elements.duplicateFurnitureButton.addEventListener("click", async () => {
  if (locked) return;
  const furniture = selectedFurniture();
  if (!furniture) return;
  pushHistory();
  const copies = duplicateFurnitureStack(activePlan.plan, furniture, () => crypto.randomUUID());
  activePlan.plan.furniture.push(...copies);
  await commitFurnitureChange(copies.length > 1 ? `家具一式（${copies.length}点）を複製しました` : "家具を複製しました");
});
elements.deleteFurnitureButton.addEventListener("click", async () => {
  if (locked) return;
  const furniture = selectedFurniture();
  if (!furniture) return;
  const descendantIds = furnitureDescendantIds(furniture.id);
  const message = descendantIds.size
    ? `「${furniture.name}」と、その上に載っている家具${descendantIds.size}点をまとめて削除しますか？`
    : `「${furniture.name}」を削除しますか？`;
  if (!confirm(message)) return;
  pushHistory();
  const removedCount = removeFurnitureStack(activePlan.plan, furniture.id);
  await commitFurnitureChange(removedCount > 1 ? `家具一式（${removedCount}点）を削除しました` : "家具を削除しました");
});
elements.furnitureRoomEdit.addEventListener("change", async () => {
  if (locked) return;
  const furniture = selectedFurniture();
  if (!furniture || furniture.roomId === elements.furnitureRoomEdit.value) return;
  pushHistory();
  furniture.roomId = elements.furnitureRoomEdit.value;
  renderer.setSelectedFurniture(furniture.id);
  await persistActivePlan();
  const room = activePlan.plan.rooms.find((candidate) => candidate.id === furniture.roomId);
  const support = findSupportItem(activePlan.plan, furniture.supportId);
  const detailItem = room ? { ...furniture, roomName: room.name, supportName: support?.name, supportFit: analyzeFurnitureSupportFit(furniture, activePlan.plan), vertical: resolveFurnitureVerticalRange(activePlan.plan, furniture), placement: analyzeFurniturePlacement(furniture, room), conflicts: analyzeFurnitureConflicts(furniture, activePlan.plan) } : furniture;
  elements.detailBody.innerHTML = detailMarkup("furniture", detailItem);
  showToast(`設置する部屋を「${room?.name ?? "未設定"}」に変更しました`);
});
elements.undoButton.addEventListener("click", async () => {
  if (!history.length) return;
  clearCandidatePreview();
  activePlan = history.pop();
  renderer.render(activePlan);
  updateSummary();
  updateWallView();
  renderDeliveryView();
  renderCandidateGroups();
  updateUndoButton();
  await persistActivePlan();
  showToast("直前の変更を戻しました");
});
elements.resetButton.addEventListener("click", async () => {
  if (!confirm("この端末に保存した間取りデータを消去しますか？")) return;
  await deleteActivePlan();
  clearCandidatePreview();
  activePlan = null;
  history.length = 0;
  renderer.render(null);
  updateSummary();
  updateWallView();
  renderDeliveryView();
  renderCandidateGroups();
  updateDimensionFilters();
  updateUndoButton();
  elements.dataMenu.close();
  showToast("端末内データを消去しました");
});
elements.lockButton.addEventListener("click", () => {
  locked = !locked;
  elements.lockButton.setAttribute("aria-pressed", String(locked));
  elements.lockButton.classList.toggle("is-active", locked);
  elements.lockButton.textContent = locked ? "🔒 閲覧" : "🔓 編集";
  renderer.setLocked(locked);
  syncSelectableControls();
  closeToolMenus();
  showToast(locked ? "閲覧モードに切り替えました" : "家具などの編集操作ができます");
});
elements.snapToggle.addEventListener("change", () => renderer.setSnapEnabled(elements.snapToggle.checked));
elements.displayRoomLabelsToggle.addEventListener("change", () => renderer.setRoomLabelsVisible(elements.displayRoomLabelsToggle.checked));
elements.displayFeaturesToggle.addEventListener("change", () => renderer.setFeaturesVisible(elements.displayFeaturesToggle.checked));
elements.displayFurnitureToggle.addEventListener("change", () => renderer.setFurnitureVisible(elements.displayFurnitureToggle.checked));
elements.displayElectricalToggle.addEventListener("change", () => renderer.setElectricalVisible(elements.displayElectricalToggle.checked));
elements.displayDimensionsToggle.addEventListener("change", () => {
  renderer.setDimensionsVisible(elements.displayDimensionsToggle.checked);
  elements.dimensionFilters.hidden = !elements.displayDimensionsToggle.checked || !activePlan?.plan.dimensions.length;
});
elements.fitButton.addEventListener("click", () => renderer.fit());
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
document.addEventListener("visibilitychange", () => {
  webglThreeView?.setSuspended(document.hidden || activeView !== "three");
});

updateConnection();
updateDimensionFilters();
syncSelectableControls();
updateUndoButton();
loadActivePlan().then((plan) => {
  if (!plan) return updateSummary();
  const validated = validatePlan(plan);
  const legacySample = validated.meta.title === "架空サンプル住戸"
    && (validated.meta.sampleVersion !== 3
      || !validated.plan.features.some((feature) => feature.kind === "kitchen")
      || !validated.plan.accessRoute
      || buildElevationItems(validated, "sample-room").length === 0);
  return setActivePlan(legacySample ? createSamplePlan() : validated, { persist: legacySample });
}).catch(() => {
  updateSummary();
  showToast("端末内データを開けませんでした");
});

if ("serviceWorker" in navigator) {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", async () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    elements.saveStatus.textContent = "保存を確認して更新中…";
    await waitForPendingSaves();
    window.location.reload();
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js")
    .then((registration) => registration.update())
    .catch(() => showToast("オフライン準備に失敗しました")));
}

