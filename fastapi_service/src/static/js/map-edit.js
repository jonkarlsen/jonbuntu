"use strict";

const VALIDATION_MAX_DISTANCE_M = 150;
const GEOCODE_INTERVAL_MS = 1100;
const EDITOR_MAX_CLASS_Z_INDEX = 100;
const AUTO_SCROLL_EDGE_PX = 100;
const AUTO_SCROLL_MAX_SPEED = 28;

let editorData = {};
let editorInitialized = false;
let validationResults = new Map();
let validationBadges = new Map();
let studentCards = new Map();
let classSwatches = new Map();
let validationRunId = 0;
let isValidating = false;
let mapUpdateTimeout = null;
let statusTimer = null;
let saving = false;
let mapInitializationStarted = false;
let dragState = null;
let autoScrollFrame = null;
let autoScrollDirection = 0;
let autoScrollSpeed = 0;
let autoScrollLastTime = 0;

let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;
const geocodeCache = new Map();

const elements = {};

function setStatus(message, kind = "") {
    const statusEl = document.getElementById("status");
    if (!statusEl) return;
    if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
    }
    statusEl.textContent = message;
    statusEl.className = kind;
    if (kind === "success") {
        statusTimer = setTimeout(() => {
            if (statusEl.textContent === message) {
                statusEl.textContent = "";
                statusEl.className = "";
            }
        }, 5000);
    }
}

function normalizeHex(value, fallback) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ?
        value :
        fallback;
}

function normalizeZIndex(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(
        EDITOR_MAX_CLASS_Z_INDEX,
        Math.max(0, Math.trunc(number))
    );
}

function toCoordinate(value) {
    if (value === null || value === undefined || value === "") return null;
    const normalized =
        typeof value === "string" ? value.trim().replace(",", ".") : value;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function normalizeStudent(raw) {
    const student = raw && typeof raw === "object" ? {
        ...raw
    } : {};
    const parents = Array.isArray(student.parents) ? student.parents : [];
    return {
        ...student,
        display_name: typeof student.display_name === "string" ? student.display_name : "",
        name: typeof student.name === "string" ? student.name : "",
        address: typeof student.address === "string" ? student.address : "",
        lat: toCoordinate(student.lat),
        lng: toCoordinate(student.lng),
        old: student.old === true,
        parents: [0, 1].map((index) => {
            const parent =
                parents[index] && typeof parents[index] === "object" ?
                parents[index] : {};
            return {
                ...parent,
                name: typeof parent.name === "string" ? parent.name : "",
                phone: typeof parent.phone === "string" ? parent.phone : "",
            };
        }),
    };
}

function normalizeData(raw) {
    const result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;

    let nextZIndex = 0;
    Object.entries(raw).forEach(([classKey, classData]) => {
        if (!classData || typeof classData !== "object" || Array.isArray(classData)) {
            return;
        }
        const students = Array.isArray(classData.students) ?
            classData.students : [];
        const legend =
            classData.legend && typeof classData.legend === "object" ?
            classData.legend : {};
        result[classKey] = {
            ...classData,
            zIndex: normalizeZIndex(classData.zIndex, nextZIndex),
            legend: {
                ...legend,
                background: normalizeHex(legend.background, "#000000"),
                text: normalizeHex(legend.text, "#ffffff"),
            },
            students: students.map(normalizeStudent),
        };
        nextZIndex += 1;
    });
    return result;
}

function validationKey(classKey, studentIndex) {
    return `${classKey}\u0000${studentIndex}`;
}

function createEmptyStudent() {
    return {
        display_name: "",
        name: "",
        address: "",
        lat: null,
        lng: null,
        old: false,
        parents: [{
            name: "",
            phone: ""
        }, {
            name: "",
            phone: ""
        }, ],
    };
}

function createButton(text, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    if (action) button.dataset.action = action;
    return button;
}

function createInput(options) {
    const input = document.createElement("input");
    input.type = options.type || "text";
    input.value = options.value ?? "";
    input.dataset.field = options.field;
    if (options.classKey !== undefined) input.dataset.class = options.classKey;
    if (options.studentIndex !== undefined) {
        input.dataset.student = String(options.studentIndex);
    }
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.step) input.step = options.step;
    if (options.className) input.className = options.className;
    if (options.autocomplete) input.autocomplete = options.autocomplete;
    return input;
}

function createField(labelText, control, full = false) {
    const label = document.createElement("label");
    label.className = `field${full ? " full" : ""}`;
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(text, control);
    return label;
}

function createColorControl(labelText, classKey, field, value) {
    const label = document.createElement("label");
    label.className = "legend-control";

    const text = document.createElement("span");
    text.textContent = labelText;

    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = value;
    picker.dataset.class = classKey;
    picker.dataset.field = field;
    picker.dataset.role = "color";
    picker.setAttribute("aria-label", `${labelText} colour`);

    const hex = document.createElement("input");
    hex.type = "text";
    hex.value = value;
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.className = "hex";
    hex.dataset.class = classKey;
    hex.dataset.field = field;
    hex.dataset.role = "hex";
    hex.setAttribute("aria-label", `${labelText} hex value`);

    label.append(text, picker, hex);
    return label;
}

function renderEditor() {
    const container = elements.classes;
    const previousScroll = container.scrollTop;
    validationBadges.clear();
    studentCards.clear();
    classSwatches.clear();
    container.replaceChildren();

    const entries = Object.entries(editorData);
    if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent =
            'No classes yet. Click "Add class" to create the first one.';
        container.appendChild(empty);
        return;
    }

    entries.forEach(([classKey, classData]) => {
        container.appendChild(renderClass(classKey, classData));
    });
    container.scrollTop = previousScroll;
}

function renderClass(classKey, classData) {
    const card = document.createElement("section");
    card.className = "class-card";
    card.dataset.class = classKey;

    const header = document.createElement("header");
    header.className = "class-header";

    const title = document.createElement("div");
    title.className = "class-title";
    const swatch = document.createElement("span");
    swatch.className = "class-swatch";
    swatch.style.backgroundColor = classData.legend.background;
    classSwatches.set(classKey, swatch);
    const key = document.createElement("span");
    key.className = "class-key";
    key.textContent = classKey;
    title.append(swatch, key);

    const legend = document.createElement("div");
    legend.className = "legend-controls";
    legend.append(
        createColorControl(
            "Background",
            classKey,
            "legend.background",
            classData.legend.background
        ),
        createColorControl("Text", classKey, "legend.text", classData.legend.text)
    );

    const zIndexControl = document.createElement("label");
    zIndexControl.className = "legend-control z-index-control";
    const zIndexLabel = document.createElement("span");
    zIndexLabel.textContent = "Z-index";
    const zIndexInput = document.createElement("input");
    zIndexInput.type = "number";
    zIndexInput.min = "0";
    zIndexInput.max = String(EDITOR_MAX_CLASS_Z_INDEX);
    zIndexInput.step = "1";
    zIndexInput.value = String(classData.zIndex);
    zIndexInput.className = "z-index-input";
    zIndexInput.dataset.class = classKey;
    zIndexInput.dataset.field = "zIndex";
    zIndexInput.title =
        `0 = bottom, ${EDITOR_MAX_CLASS_Z_INDEX} = top. ` +
        "Markers always stay below the info window.";
    zIndexControl.append(zIndexLabel, zIndexInput);
    legend.appendChild(zIndexControl);

    const actions = document.createElement("div");
    actions.className = "class-actions";
    const addStudent = createButton(
        "Add student",
        "btn btn-secondary btn-small",
        "add-student"
    );
    addStudent.dataset.class = classKey;
    const removeClass = createButton(
        "Remove class",
        "btn btn-danger btn-small",
        "remove-class"
    );
    removeClass.dataset.class = classKey;
    actions.append(addStudent, removeClass);

    header.append(title, legend, actions);

    const students = document.createElement("div");
    students.className = "students";
    if (classData.students.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No students in this class yet.";
        students.appendChild(empty);
    } else {
        classData.students.forEach((student, index) => {
            students.appendChild(renderStudent(classKey, student, index));
        });
    }

    card.append(header, students);
    return card;
}

function renderStudent(classKey, student, index) {
    const card = document.createElement("article");
    card.className = "student-card";
    card.dataset.class = classKey;
    card.dataset.student = String(index);
    studentCards.set(validationKey(classKey, index), card);

    const top = document.createElement("div");
    top.className = "student-top";

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "drag-handle";
    dragHandle.draggable = true;
    dragHandle.title = "Drag to reorder";
    dragHandle.setAttribute("aria-label", "Drag to reorder");
    dragHandle.textContent = "⋮⋮";
    dragHandle.dataset.class = classKey;
    dragHandle.dataset.student = String(index);

    const displayName = createInput({
        field: "display_name",
        classKey,
        studentIndex: index,
        value: student.display_name,
        placeholder: "Display name",
        className: "display-name-input",
    });
    displayName.setAttribute("aria-label", "Display name");

    const oldToggle = document.createElement("label");
    oldToggle.className = "old-toggle";
    const oldCheckbox = document.createElement("input");
    oldCheckbox.type = "checkbox";
    oldCheckbox.checked = Boolean(student.old);
    oldCheckbox.dataset.class = classKey;
    oldCheckbox.dataset.student = String(index);
    oldCheckbox.dataset.field = "old";
    const oldText = document.createElement("span");
    oldText.textContent = "Old";
    oldToggle.append(oldCheckbox, oldText);

    const badge = document.createElement("span");
    badge.className = "validation-badge";
    badge.hidden = true;
    validationBadges.set(validationKey(classKey, index), badge);

    const remove = createButton(
        "Remove",
        "btn btn-danger btn-small",
        "remove-student"
    );
    remove.dataset.class = classKey;
    remove.dataset.student = String(index);

    top.append(dragHandle, displayName, oldToggle, badge, remove);

    const fields = document.createElement("div");
    fields.className = "student-fields";

    const name = createInput({
        field: "name",
        classKey,
        studentIndex: index,
        value: student.name,
        placeholder: "Full name",
        autocomplete: "off",
    });

    const address = createInput({
        field: "address",
        classKey,
        studentIndex: index,
        value: student.address,
        placeholder: "Street, postcode, city",
        autocomplete: "off",
    });
    const addressRow = document.createElement("div");
    addressRow.className = "address-row";
    const geocode = createButton(
        "Update coordinates",
        "btn btn-secondary btn-small",
        "geocode"
    );
    geocode.dataset.class = classKey;
    geocode.dataset.student = String(index);
    addressRow.append(address, geocode);

    const lat = createInput({
        field: "lat",
        classKey,
        studentIndex: index,
        value: student.lat,
        type: "number",
        step: "any",
        placeholder: "Latitude",
    });
    const lng = createInput({
        field: "lng",
        classKey,
        studentIndex: index,
        value: student.lng,
        type: "number",
        step: "any",
        placeholder: "Longitude",
    });

    fields.append(
        createField("Name", name, true),
        createField("Address", addressRow, true),
        createField("Latitude", lat),
        createField("Longitude", lng)
    );

    const parents = document.createElement("div");
    parents.className = "parents";
    [0, 1].forEach((parentIndex) => {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "parent-card";
        const legend = document.createElement("legend");
        legend.textContent = `Parent ${parentIndex + 1}`;
        const parent = student.parents[parentIndex];
        const parentName = createInput({
            field: `parents.${parentIndex}.name`,
            classKey,
            studentIndex: index,
            value: parent.name,
            placeholder: "Name",
            autocomplete: "off",
        });
        const parentPhone = createInput({
            field: `parents.${parentIndex}.phone`,
            classKey,
            studentIndex: index,
            value: parent.phone,
            type: "tel",
            placeholder: "Phone",
            autocomplete: "off",
        });
        fieldset.append(
            legend,
            createField("Name", parentName),
            createField("Phone", parentPhone)
        );
        parents.appendChild(fieldset);
    });

    card.append(top, fields, parents);
    renderValidationBadge(classKey, index);
    return card;
}

function statusText(result) {
    switch (result.status) {
        case "ok":
            return `OK · ${Math.round(result.distance_m)} m`;
        case "mismatch":
            return `Needs update · ${Math.round(result.distance_m)} m`;
        case "missing":
            return "Missing coordinates";
        case "missing_address":
            return "Missing address";
        case "no_result":
            return "No geocode result";
        case "error":
            return "Geocode error";
        case "fixed":
            return "Updated from suggestion";
        default:
            return result.status;
    }
}

function renderValidationBadge(classKey, index) {
    const key = validationKey(classKey, index);
    const badge = validationBadges.get(key);
    const card = studentCards.get(key);
    if (!badge) return;

    badge.replaceChildren();
    badge.removeAttribute("title");
    badge.className = "validation-badge";

    if (card) {
        card.classList.remove("has-ok", "has-mismatch", "has-missing");
    }

    const result = validationResults.get(key);
    if (!result) {
        badge.hidden = true;
        return;
    }

    badge.hidden = false;
    badge.classList.add(result.status);
    badge.append(document.createTextNode(statusText(result)));

    if (result.error) {
        badge.title = result.error;
    } else if (result.suggested) {
        badge.title = `Suggested: ${result.suggested.lat}, ${result.suggested.lng}`;
    }

    if (card) {
        if (result.status === "mismatch") {
            card.classList.add("has-mismatch");
        } else if (
            ["missing", "missing_address", "no_result", "error"].includes(
                result.status
            )
        ) {
            card.classList.add("has-missing");
        } else if (["ok", "fixed"].includes(result.status)) {
            card.classList.add("has-ok");
        }
    }

    if (result.suggested) {
        const use = createButton(
            "Use coordinates",
            "btn btn-small btn-inline",
            "use-suggested"
        );
        use.dataset.class = classKey;
        use.dataset.student = String(index);
        badge.appendChild(use);
    }
}

function clearValidation() {
    if (isValidating) {
        validationRunId += 1;
        isValidating = false;
        const button = document.getElementById("validate-btn");
        if (button) button.textContent = "Validate coordinates";
    }

    validationResults.clear();
    validationBadges.forEach((badge) => {
        badge.hidden = true;
        badge.replaceChildren();
        badge.className = "validation-badge";
    });
    studentCards.forEach((card) => {
        card.classList.remove("has-ok", "has-mismatch", "has-missing");
    });
}

function clearStudentValidation(classKey, index) {
    validationResults.delete(validationKey(classKey, index));
    renderValidationBadge(classKey, index);
}

function updateMap() {
    if (typeof window.updateMapLocations === "function") {
        window.updateMapLocations(editorData);
    }
}

function scheduleMapUpdate() {
    if (mapUpdateTimeout) clearTimeout(mapUpdateTimeout);
    mapUpdateTimeout = setTimeout(updateMap, 180);
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postJson(url, data) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
    });

    const contentType = response.headers.get("content-type") || "";
    let result = null;
    if (contentType.includes("application/json")) {
        result = await response.json();
    } else {
        const text = await response.text();
        result = {
            detail: text.slice(0, 300)
        };
    }

    if (!response.ok || !result || result.success !== true) {
        const detail = result && (result.detail || result.message);
        throw new Error(
            (Array.isArray(detail) ? detail.map(String).join("; ") : detail) ||
            `Request failed (${response.status})`
        );
    }
    return result;
}

function geocodeAddress(address) {
    const cacheKey = address.trim().toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached;

    const task = geocodeQueue.then(async () => {
        const wait = Math.max(
            0,
            GEOCODE_INTERVAL_MS - (Date.now() - lastGeocodeAt)
        );
        if (wait > 0) await sleep(wait);
        lastGeocodeAt = Date.now();
        return postJson("/api/geocode", {
            address
        });
    });
    geocodeQueue = task.catch(() => {});
    geocodeCache.set(cacheKey, task);
    task.catch(() => {
        if (geocodeCache.get(cacheKey) === task) {
            geocodeCache.delete(cacheKey);
        }
    });
    return task;
}

async function updateStudentCoordinates(classKey, index, button) {
    const student = editorData[classKey]?.students[index];
    if (!student) return;

    const address = student.address.trim();
    if (!address) {
        setStatus("Enter an address first.", "error");
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Updating...";
    setStatus("Looking up address...");

    try {
        const result = await geocodeAddress(address);
        student.lat = result.lat;
        student.lng = result.lng;

        const card = studentCards.get(validationKey(classKey, index));
        const latInput = card?.querySelector('[data-field="lat"]');
        const lngInput = card?.querySelector('[data-field="lng"]');
        if (latInput) latInput.value = student.lat;
        if (lngInput) lngInput.value = student.lng;

        clearStudentValidation(classKey, index);
        scheduleMapUpdate();
        setStatus(
            `Updated coordinates for ${student.display_name || student.name || "student"}.`,
            "success"
        );
    } catch (error) {
        setStatus(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function handleEditorInput(event) {
    const input = event.target;
    const classKey = input.dataset.class;
    const field = input.dataset.field;
    if (!classKey || !field || !editorData[classKey]) return;

    const classData = editorData[classKey];

    if (field === "legend.background" || field === "legend.text") {
        const legendKey = field.slice("legend.".length);
        let value = input.value;

        if (input.dataset.role === "hex") {
            const trimmed = value.trim();
            if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
                input.classList.add("invalid");
                return;
            }
            input.classList.remove("invalid");
            value = trimmed;
            const picker = input
                .closest(".legend-control")
                ?.querySelector('input[type="color"]');
            if (picker) picker.value = value;
        } else {
            const hex = input
                .closest(".legend-control")
                ?.querySelector("input.hex");
            if (hex) {
                hex.value = value;
                hex.classList.remove("invalid");
            }
        }

        classData.legend[legendKey] = value;
        const swatch = classSwatches.get(classKey);
        if (swatch) swatch.style.backgroundColor = classData.legend.background;
        scheduleMapUpdate();
        return;
    }

    if (field === "zIndex") {
        const value = normalizeZIndex(input.value, classData.zIndex ?? 0);
        classData.zIndex = value;
        input.value = String(value);
        scheduleMapUpdate();
        return;
    }

    const studentIndex = Number(input.dataset.student);
    const student = classData.students[studentIndex];
    if (!student) return;

    if (field === "old") {
        student.old = input.checked === true;
        scheduleMapUpdate();
        return;
    }

    if (field.startsWith("parents.")) {
        const [, parentIndexText, parentField] = field.split(".");
        const parent = student.parents[Number(parentIndexText)];
        if (!parent) return;
        parent[parentField] = input.value;
        return;
    }

    if (field === "lat" || field === "lng") {
        student[field] = toCoordinate(input.value);
        clearStudentValidation(classKey, studentIndex);
        scheduleMapUpdate();
        return;
    }

    student[field] = input.value;
    if (field === "address") {
        clearStudentValidation(classKey, studentIndex);
    }
    if (field === "display_name" || field === "name") {
        scheduleMapUpdate();
    }
}

function handleEditorChange(event) {
    const input = event.target;
    if (input.dataset.role !== "hex") return;

    const classKey = input.dataset.class;
    const classData = editorData[classKey];
    if (!classData) return;

    const legendKey = input.dataset.field.slice("legend.".length);
    input.value = classData.legend[legendKey];
    input.classList.remove("invalid");
}

function clearDropIndicators() {
    document
        .querySelectorAll(".student-card.drop-before, .student-card.drop-after")
        .forEach((card) => {
            card.classList.remove("drop-before", "drop-after");
        });
}

function stopAutoScroll() {
    autoScrollDirection = 0;
    autoScrollSpeed = 0;
    autoScrollLastTime = 0;
    if (autoScrollFrame) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
    }
}

function autoScrollStep(timestamp) {
    autoScrollFrame = null;
    if (!dragState || autoScrollDirection === 0) return;

    const now = typeof timestamp === "number" ? timestamp : performance.now();
    const delta = autoScrollLastTime ?
        Math.min(64, Math.max(1, now - autoScrollLastTime)) :
        16;
    autoScrollLastTime = now;

    const container = elements.classes;
    const before = container.scrollTop;
    const pixels = Math.max(
        1,
        Math.round(autoScrollSpeed * (delta / 16))
    );
    container.scrollTop = before + autoScrollDirection * pixels;

    if (container.scrollTop !== before) {
        autoScrollFrame = requestAnimationFrame(autoScrollStep);
    }
}

function handleDragAutoScroll(event) {
    if (!dragState) return;

    // Allow dropping anywhere in the list, and scroll when near an edge.
    event.preventDefault();

    const container = elements.classes;
    const rect = container.getBoundingClientRect();
    const y = event.clientY;
    let direction = 0;

    if (y < rect.top + AUTO_SCROLL_EDGE_PX) {
        direction = -1;
    } else if (y > rect.bottom - AUTO_SCROLL_EDGE_PX) {
        direction = 1;
    }

    if (direction === 0) {
        stopAutoScroll();
        return;
    }

    const distance =
        direction < 0 ? y - rect.top : rect.bottom - y;
    const ratio = 1 - Math.min(1, Math.max(0, distance) / AUTO_SCROLL_EDGE_PX);
    autoScrollDirection = direction;
    autoScrollSpeed = Math.max(
        3,
        Math.round(AUTO_SCROLL_MAX_SPEED * ratio)
    );

    if (!autoScrollFrame) {
        autoScrollFrame = requestAnimationFrame(autoScrollStep);
    }
}

function handleDragStart(event) {
    const handle = event.target.closest(".drag-handle");
    if (!handle) return;

    const card = handle.closest(".student-card");
    const classKey = handle.dataset.class;
    const index = Number(handle.dataset.student);
    if (!card || !editorData[classKey]?.students[index]) return;

    dragState = {
        classKey,
        index,
        card
    };
    card.classList.add("dragging");

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `${classKey}:${index}`);
        try {
            event.dataTransfer.setDragImage(card, 24, 24);
        } catch (error) {
            // Some browsers do not allow a custom drag image.
        }
    }
}

function handleDragOver(event) {
    if (!dragState) return;

    const card = event.target.closest(".student-card");
    if (!card || card === dragState.card) return;
    if (card.dataset.class !== dragState.classKey) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

    const rect = card.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    clearDropIndicators();
    card.classList.add(after ? "drop-after" : "drop-before");
}

function handleDragLeave(event) {
    const related = event.relatedTarget;
    if (!related || !elements.classes.contains(related)) {
        stopAutoScroll();
    }

    const card = event.target.closest(".student-card");
    if (!card) return;
    if (related && card.contains(related)) return;
    card.classList.remove("drop-before", "drop-after");
}

function cleanupDrag() {
    if (dragState?.card) {
        dragState.card.classList.remove("dragging");
    }
    dragState = null;
    stopAutoScroll();
    clearDropIndicators();
}

function handleDrop(event) {
    if (!dragState) return;

    const card = event.target.closest(".student-card");
    if (!card || card.dataset.class !== dragState.classKey) {
        cleanupDrag();
        return;
    }

    event.preventDefault();

    const targetIndex = Number(card.dataset.student);
    const rect = card.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    let insertIndex = targetIndex + (after ? 1 : 0);
    const sourceIndex = dragState.index;
    if (insertIndex > sourceIndex) insertIndex -= 1;

    if (insertIndex !== sourceIndex) {
        const {
            classKey
        } = dragState;
        const classData = editorData[classKey];
        const [student] = classData.students.splice(sourceIndex, 1);
        classData.students.splice(insertIndex, 0, student);
        clearValidation();
        renderEditor();
        scheduleMapUpdate();
        setStatus(
            `Moved ${student.display_name || student.name || "student"} in class ${classKey}.`,
            "success"
        );
    }

    cleanupDrag();
}

function handleDragEnd() {
    cleanupDrag();
}

async function handleEditorClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const classKey = button.dataset.class;
    const studentIndex =
        button.dataset.student !== undefined ?
        Number(button.dataset.student) :
        null;

    if (action === "add-student") {
        addStudent(classKey);
    } else if (action === "remove-student") {
        removeStudent(classKey, studentIndex);
    } else if (action === "remove-class") {
        removeClass(classKey);
    } else if (action === "geocode") {
        await updateStudentCoordinates(classKey, studentIndex, button);
    } else if (action === "use-suggested") {
        applySuggestedCoordinates(classKey, studentIndex);
    }
}

function nextClassZIndex() {
    const values = Object.values(editorData).map((classData) =>
        normalizeZIndex(classData.zIndex, 0)
    );
    if (values.length === 0) return 0;
    return Math.min(EDITOR_MAX_CLASS_Z_INDEX, Math.max(...values) + 1);
}

function addClass() {
    const value = window.prompt("New class key:");
    if (value === null) return;
    const classKey = value.trim();
    if (!classKey) {
        setStatus("Class key cannot be empty.", "error");
        return;
    }
    if (Object.prototype.hasOwnProperty.call(editorData, classKey)) {
        setStatus(`Class ${classKey} already exists.`, "error");
        return;
    }

    const palette = [
        ["#FFD700", "#000000"],
        ["#4285F4", "#FFFFFF"],
        ["#FF0000", "#FFFFFF"],
        ["#10B981", "#FFFFFF"],
        ["#8B5CF6", "#FFFFFF"],
        ["#F97316", "#FFFFFF"],
    ];
    const [background, text] =
    palette[Object.keys(editorData).length % palette.length];
    editorData[classKey] = {
        zIndex: nextClassZIndex(),
        legend: {
            background,
            text
        },
        students: [],
    };

    clearValidation();
    renderEditor();
    scheduleMapUpdate();
    setStatus(`Added class ${classKey}.`, "success");
}

function removeClass(classKey) {
    const classData = editorData[classKey];
    if (!classData) return;
    const count = classData.students.length;
    if (
        !window.confirm(
            `Remove class ${classKey} and its ${count} student(s)?`
        )
    ) {
        return;
    }
    delete editorData[classKey];
    clearValidation();
    renderEditor();
    scheduleMapUpdate();
    setStatus(`Removed class ${classKey}.`, "success");
}

function addStudent(classKey) {
    const classData = editorData[classKey];
    if (!classData) return;
    classData.students.push(createEmptyStudent());
    clearValidation();
    renderEditor();

    const index = classData.students.length - 1;
    const card = studentCards.get(validationKey(classKey, index));
    card?.querySelector('[data-field="display_name"]')?.focus();
    scheduleMapUpdate();
    setStatus(`Added a student to class ${classKey}.`, "success");
}

function removeStudent(classKey, index) {
    const classData = editorData[classKey];
    const student = classData?.students[index];
    if (!student) return;

    const label =
        student.display_name || student.name || `student ${index + 1}`;
    if (!window.confirm(`Remove ${label}?`)) return;

    classData.students.splice(index, 1);
    clearValidation();
    renderEditor();
    scheduleMapUpdate();
    setStatus(`Removed ${label}.`, "success");
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRadians = (value) => (value * Math.PI) / 180;
    const radius = 6371000;
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const deltaPhi = toRadians(lat2 - lat1);
    const deltaLambda = toRadians(lon2 - lon1);
    const a =
        Math.sin(deltaPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applySuggestedCoordinates(classKey, index) {
    const key = validationKey(classKey, index);
    const result = validationResults.get(key);
    const student = editorData[classKey]?.students[index];
    if (!result?.suggested || !student) return;

    student.lat = result.suggested.lat;
    student.lng = result.suggested.lng;

    const card = studentCards.get(key);
    const latInput = card?.querySelector('[data-field="lat"]');
    const lngInput = card?.querySelector('[data-field="lng"]');
    if (latInput) latInput.value = student.lat;
    if (lngInput) lngInput.value = student.lng;

    validationResults.set(key, {
        status: "fixed"
    });
    renderValidationBadge(classKey, index);
    scheduleMapUpdate();
    setStatus(
        `Updated coordinates for ${student.display_name || student.name || "student"}.`,
        "success"
    );
}

async function validateAllCoordinates() {
    const button = document.getElementById("validate-btn");

    if (isValidating) {
        validationRunId += 1;
        isValidating = false;
        button.textContent = "Validate coordinates";
        setStatus("Validation stopped.");
        return;
    }

    const tasks = [];
    Object.entries(editorData).forEach(([classKey, classData]) => {
        classData.students.forEach((student, index) => {
            tasks.push({
                classKey,
                index,
                student
            });
        });
    });

    if (tasks.length === 0) {
        setStatus("There are no students to validate.", "error");
        return;
    }

    clearValidation();
    const runId = (validationRunId += 1);
    isValidating = true;
    button.textContent = "Stop validation";

    let ok = 0;
    let mismatch = 0;
    let missing = 0;
    let missingAddress = 0;
    let noResult = 0;
    let errors = 0;

    for (let position = 0; position < tasks.length; position += 1) {
        if (!isValidating || runId !== validationRunId) break;

        const {
            classKey,
            index,
            student
        } = tasks[position];
        const name =
            student.display_name || student.name || `student ${index + 1}`;
        setStatus(
            `Validating ${position + 1}/${tasks.length}: ${name}...`
        );

        const key = validationKey(classKey, index);

        if (!student.address || !student.address.trim()) {
            validationResults.set(key, {
                status: "missing_address"
            });
            missingAddress += 1;
            renderValidationBadge(classKey, index);
            continue;
        }

        try {
            const geocoded = await geocodeAddress(student.address.trim());
            if (runId !== validationRunId) break;

            const hasCoordinates =
                Number.isFinite(student.lat) &&
                Number.isFinite(student.lng);

            if (!hasCoordinates) {
                validationResults.set(key, {
                    status: "missing",
                    suggested: {
                        lat: geocoded.lat,
                        lng: geocoded.lng
                    },
                });
                missing += 1;
            } else {
                const distance = haversineMeters(
                    student.lat,
                    student.lng,
                    geocoded.lat,
                    geocoded.lng
                );
                if (distance <= VALIDATION_MAX_DISTANCE_M) {
                    validationResults.set(key, {
                        status: "ok",
                        distance_m: distance,
                    });
                    ok += 1;
                } else {
                    validationResults.set(key, {
                        status: "mismatch",
                        distance_m: distance,
                        suggested: {
                            lat: geocoded.lat,
                            lng: geocoded.lng
                        },
                    });
                    mismatch += 1;
                }
            }
            renderValidationBadge(classKey, index);
        } catch (error) {
            if (runId !== validationRunId) break;
            const message = error.message || String(error);
            const status = message.toLowerCase().includes("no coordinates") ?
                "no_result" :
                "error";
            validationResults.set(key, {
                status,
                error: message
            });
            if (status === "no_result") {
                noResult += 1;
            } else {
                errors += 1;
            }
            renderValidationBadge(classKey, index);
        }
    }

    if (runId === validationRunId) {
        isValidating = false;
        button.textContent = "Validate coordinates";
        setStatus(
            `Validation done: ${ok} OK, ${mismatch} need update, ` +
            `${missing} missing, ${missingAddress} missing address, ` +
            `${noResult} no result, ${errors} error(s).`
        );

        const issues =
            mismatch + missing + missingAddress + noResult + errors;
        if (issues > 0) {
            const firstIssue = document.querySelector(
                ".student-card.has-mismatch, .student-card.has-missing"
            );
            firstIssue?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }
    }
}

async function saveLocations() {
    if (saving) return;
    saving = true;
    setStatus("Saving locations.json...");
    try {
        const result = await postJson("/api/save-locations", editorData);
        updateMap();
        setStatus(result.message || "Saved locations.json.", "success");
    } catch (error) {
        setStatus(error.message, "error");
    } finally {
        saving = false;
    }
}

async function uploadToSSM() {
    if (saving) return;
    if (
        !window.confirm(
            "Save and upload these locations to AWS SSM? This overwrites the stored class parameters."
        )
    ) {
        return;
    }

    saving = true;
    setStatus("Saving locations.json...");
    try {
        await postJson("/api/save-locations", editorData);
        setStatus("Uploading to AWS SSM...");
        const result = await postJson("/api/upload-ssm", editorData);
        updateMap();
        setStatus(result.message || "Uploaded to AWS SSM.", "success");
    } catch (error) {
        setStatus(error.message, "error");
    } finally {
        saving = false;
    }
}

function initEditor() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initEditor, {
            once: true,
        });
        return;
    }

    if (editorInitialized) return;
    editorInitialized = true;

    elements.classes = document.getElementById("classes-container");

    editorData = normalizeData(
        typeof allLocations !== "undefined" ? allLocations : {}
    );
    renderEditor();
    updateMap();

    elements.classes.addEventListener("input", handleEditorInput);
    elements.classes.addEventListener("change", handleEditorChange);
    elements.classes.addEventListener("click", handleEditorClick);
    elements.classes.addEventListener("dragstart", handleDragStart);
    elements.classes.addEventListener("dragover", handleDragOver);
    elements.classes.addEventListener("dragover", handleDragAutoScroll);
    elements.classes.addEventListener("dragleave", handleDragLeave);
    elements.classes.addEventListener("drop", handleDrop);
    elements.classes.addEventListener("dragend", handleDragEnd);

    document
        .getElementById("add-class-btn")
        .addEventListener("click", addClass);
    document
        .getElementById("validate-btn")
        .addEventListener("click", validateAllCoordinates);
    document
        .getElementById("save-btn")
        .addEventListener("click", saveLocations);
    document
        .getElementById("upload-btn")
        .addEventListener("click", uploadToSSM);
}

function initMapEditor() {
    initEditor();
    if (mapInitializationStarted) return;
    mapInitializationStarted = true;

    if (typeof window.initMap !== "function") {
        console.error("initMap is not available");
        setStatus("Map failed to load.", "error");
        return;
    }

    Promise.resolve()
        .then(() => window.initMap())
        .catch((error) => {
            console.error("Map initialization failed", error);
            setStatus(`Map failed to load: ${error.message}`, "error");
        });
}

window.initMapEditor = initMapEditor;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEditor, {
        once: true
    });
} else {
    initEditor();
}