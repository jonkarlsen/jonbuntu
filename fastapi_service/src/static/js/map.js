let markersByGroup = {};
let _mapState = null;

// Class markers are kept in their own z-index bands so a class can be put
// above another.  Google's InfoWindow is rendered in a higher map pane
// (float pane) than AdvancedMarkerElement, so these values cannot cover it.
const MAX_CLASS_Z_INDEX = 100;
const CLASS_Z_INDEX_SCALE = 1000;

function normalizeClassZIndex(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(MAX_CLASS_Z_INDEX, Math.max(0, Math.trunc(number)));
}

function _ensureMapState() {
    if (_mapState) return _mapState;
    _mapState = {
        map: null,
        infoWindow: null,
        userLocation: null,
        legend: document.getElementById("legend"),
        currentLocations: typeof allLocations !== "undefined" ? allLocations : {},
        showOld: false,
        initialized: false
    };
    return _mapState;
}

window.updateMapLocations = function(locations) {
    const state = _ensureMapState();
    state.currentLocations = locations && typeof locations === "object" ? locations : state.currentLocations;
    if (state.map && state.infoWindow) {
        renderLocationsOnMap(state, state.currentLocations);
    }
};

window.initMap = async function() {
    const {
        Map
    } = await google.maps.importLibrary("maps");
    await google.maps.importLibrary("marker");

    const mapCenter = {
        lat: 58.8138,
        lng: 5.75
    };
    const mapElement = document.getElementById("map");
    if (!mapElement) {
        console.error("No #map element found");
        return;
    }

    const state = _ensureMapState();
    const mapOptions = {
        zoom: 14,
        center: mapCenter,
        mapId: typeof googleMapId !== "undefined" ? googleMapId : undefined
    };
    const map = new Map(mapElement, mapOptions);
    const infoWindow = new google.maps.InfoWindow();
    const legend = document.getElementById("legend") || state.legend;

    state.map = map;
    state.infoWindow = infoWindow;
    state.legend = legend;
    state.initialized = true;

    if (legend && typeof map.controls !== "undefined") {
        map.controls[google.maps.ControlPosition.LEFT_TOP].push(legend);
    }

    renderLocationsOnMap(state, state.currentLocations);
    fitMapToLocations(state);

    getUserLocation(map).then((loc) => {
        state.userLocation = loc;
    });
};

function fitMapToLocations(state) {
    const map = state.map;
    if (!map) return;

    const bounds = new google.maps.LatLngBounds();
    let count = 0;

    Object.values(state.currentLocations || {}).forEach((groupData) => {
        if (!groupData || typeof groupData !== "object") return;
        const students = Array.isArray(groupData.students) ? groupData.students : [];
        students.forEach((student) => {
            if (!student || student.lat == null || student.lng == null) return;
            if (student.old && !state.showOld) return;

            const lat = Number(student.lat);
            const lng = Number(student.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            bounds.extend({
                lat,
                lng
            });
            count += 1;
        });
    });

    if (count === 0) return;

    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const latSpan = Math.abs(northEast.lat() - southWest.lat());
    const lngSpan = Math.abs(northEast.lng() - southWest.lng());

    if (latSpan < 1e-7 && lngSpan < 1e-7) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
        return;
    }

    const legend = state.legend;
    const mapWidth = map.getDiv().clientWidth || 800;
    const legendWidth = legend ? legend.offsetWidth + 24 : 0;
    const leftPadding = Math.max(
        50,
        Math.min(legendWidth, Math.max(50, mapWidth * 0.35))
    );

    map.fitBounds(bounds, {
        top: 50,
        right: 50,
        bottom: 50,
        left: leftPadding
    });

    if (map.getZoom() > 16) {
        map.setZoom(16);
    }
    google.maps.event.addListenerOnce(map, "idle", () => {
        if (map.getZoom() > 16) {
            map.setZoom(16);
        }
    });
}

function renderLocationsOnMap(state, locations) {
    const map = state.map;
    const infoWindow = state.infoWindow;
    const legend = state.legend;
    const userLocation = state.userLocation;

    state.currentLocations = locations && typeof locations === "object" ? locations : state.currentLocations;

    Object.values(markersByGroup).forEach((group) => {
        if (group && Array.isArray(group.markers)) {
            group.markers.forEach((marker) => {
                if (marker) {
                    try {
                        marker.map = null;
                    } catch (e) {
                        // ignore
                    }
                }
            });
        }
    });
    markersByGroup = {};
    if (legend) {
        legend.innerHTML = "<h3>Klasser</h3>";
        addShowOldToggle(legend, state);
    }

    Object.entries(state.currentLocations || {}).forEach(([groupName, groupData]) => {
        if (!groupData || typeof groupData !== "object") return;
        const groupLocations = Array.isArray(groupData.students) ? groupData.students : [];
        const legendColors = groupData.legend && typeof groupData.legend === "object" ? groupData.legend : {};
        const backgroundColor = legendColors.background || "#000";
        const textColor = legendColors.text || "#fff";
        const classZIndex = normalizeClassZIndex(groupData.zIndex);

        if (legend) {
            addGroupLegend(legend, groupName, backgroundColor, textColor, map);
        }

        groupLocations
            .slice()
            .sort((a, b) => (a.display_name || a.name || "").localeCompare(b.display_name || b.name || ""))
            .forEach((location) => {
                if (!location || location.lat == null || location.lng == null) return;
                if (location.old && !state.showOld) return;

                const marker = createMarker(location, map, backgroundColor, textColor, classZIndex);
                marker.locationData = location;
                if (typeof marker.addListener === "function") {
                    marker.addListener("click", () => {
                        focusMarker(marker, marker.locationData || location, userLocation, infoWindow, backgroundColor, textColor, map);
                    });
                } else if (typeof marker.addEventListener === "function") {
                    marker.addEventListener("gmp-click", () => {
                        focusMarker(marker, marker.locationData || location, userLocation, infoWindow, backgroundColor, textColor, map);
                    });
                }

                if (markersByGroup[groupName]) {
                    markersByGroup[groupName].markers.push(marker);

                    const entry = document.createElement("div");
                    entry.textContent = location.display_name || location.name || "";
                    entry.className = "marker-entry";
                    if (location.old) entry.classList.add("is-old");
                    entry.style.cursor = "pointer";
                    entry.addEventListener("click", () => {
                        focusMarker(marker, marker.locationData || location, userLocation, infoWindow, backgroundColor, textColor, map);
                    });
                    markersByGroup[groupName].container.appendChild(entry);
                }
            });
    });
}

function smoothPanTo(map, targetLatLng, steps = 30, duration = 250) {
    const start = map.getCenter();
    const startLat = start.lat();
    const startLng = start.lng();
    const endLat = targetLatLng.lat;
    const endLng = targetLatLng.lng;

    let step = 0;
    const stepLat = (endLat - startLat) / steps;
    const stepLng = (endLng - startLng) / steps;

    function pan() {
        step++;
        const lat = startLat + stepLat * step;
        const lng = startLng + stepLng * step;
        map.setCenter({
            lat,
            lng
        });
        if (step < steps) {
            requestAnimationFrame(pan);
        }
    }

    pan();
}

function focusMarker(marker, location, userLocation, infoWindow, backgroundColor, textColor, map) {
    const pos = marker.position;
    if (pos) {
        if (typeof pos.lat === "function") {
            smoothPanTo(map, {
                lat: pos.lat(),
                lng: pos.lng()
            });
        } else {
            smoothPanTo(map, pos);
        }
    }
    openInfoWindow(infoWindow, marker, location, userLocation, backgroundColor, textColor, map);

    marker.zIndex = (marker.baseZIndex || 0) + 1;

    if (marker.nameTag) {
        marker.nameTag.style.fontWeight = "bold";
    }
    // animate only the scalable part
    if (marker.scalableElement && marker.nameTag) {
        marker.scalableElement.style.transition = "transform 0.3s";
        marker.scalableElement.style.transform = "scale(1.3)";
        setTimeout(() => {
            marker.scalableElement.style.transform = "scale(1)";
            marker.nameTag.style.fontWeight = "normal";
        }, 1000);
    }
}

function getUserLocation(map) {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn("Geolocation not supported by this browser.");
            resolve(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLoc = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                try {
                    const userMarker = new google.maps.marker.AdvancedMarkerElement({
                        position: userLoc,
                        map,
                    });
                    if (typeof userMarker.addListener === "function") {
                        // keep as is
                    } else if (typeof userMarker.addEventListener === "function") {
                        // noop
                    }
                } catch (e) {
                    // ignore
                }
                resolve(userLoc);
            },
            () => {
                console.warn("Geolocation permission denied or unavailable.");
                resolve(null);
            }
        );
    });
}

// Global filter for students/addresses that are no longer current.
function addShowOldToggle(legend, state) {
    const label = document.createElement("label");
    label.className = "show-old-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(state.showOld);
    checkbox.addEventListener("change", () => {
        state.showOld = checkbox.checked;
        renderLocationsOnMap(state, state.currentLocations);
    });

    const text = document.createElement("span");
    text.textContent = "Show old";

    label.append(checkbox, text);
    legend.appendChild(label);
}

// Collapsible legend with checkbox
function addGroupLegend(legend, groupName, backgroundColor, textColor, map) {
    const details = document.createElement("details");
    //details.open = true;

    const summary = document.createElement("summary");
    summary.style.display = "flex";
    summary.style.alignItems = "center";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => toggleGroup(groupName, checkbox.checked, map));

    const colorBox = document.createElement("span");
    colorBox.style.display = "inline-block";
    colorBox.style.width = "14px";
    colorBox.style.height = "14px";
    colorBox.style.marginRight = "6px";
    colorBox.style.borderRadius = "3px";
    colorBox.style.border = "1px solid #888";
    colorBox.style.backgroundColor = backgroundColor;

    summary.appendChild(checkbox);
    summary.appendChild(colorBox);
    summary.appendChild(document.createTextNode(" " + groupName));
    details.appendChild(summary);

    const markerList = document.createElement("div");
    markerList.style.paddingLeft = "20px";
    markerList.style.fontSize = "0.9em";
    markerList.style.display = "none"; // hide by default
    details.appendChild(markerList);
    details.addEventListener("toggle", () => {
        markerList.style.display = details.open ? "block" : "none";
    });
    markersByGroup[groupName] = {
        markers: [],
        container: markerList
    };

    legend.appendChild(details);
}

function createMarker(location, map, backgroundColor, textColor, classZIndex) {
    const latLng = {
        lat: location.lat,
        lng: location.lng
    };

    const wrapper = document.createElement("div");
    wrapper.className = "name-tag-wrapper";
    if (location.old) wrapper.classList.add("is-old");
    wrapper.style.setProperty("--bg-color", backgroundColor);

    const scalable = document.createElement("div");
    scalable.className = "scalable";

    const nameTag = document.createElement("div");
    nameTag.className = "name-tag";
    nameTag.textContent = location.display_name || location.name || "";
    nameTag.style.setProperty("--tag-bg", backgroundColor);
    nameTag.style.setProperty("--arrow-color", backgroundColor);
    nameTag.style.color = textColor;

    scalable.appendChild(nameTag);
    wrapper.appendChild(scalable);

    const baseZIndex =
        normalizeClassZIndex(classZIndex) * CLASS_Z_INDEX_SCALE;
    const marker = new google.maps.marker.AdvancedMarkerElement({
        position: latLng,
        map,
        content: wrapper,
        zIndex: baseZIndex,
    });
    marker.baseZIndex = baseZIndex;
    marker.nameTag = nameTag;
    marker.scalableElement = scalable;
    marker.locationData = location;
    return marker;
}

function openInfoWindow(infoWindow, marker, location, userLocation, backgroundColor, textColor, map) {
    infoWindow.close();
    const googleMapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location.address)}&travelmode=driving`;
    let content = `
    <div>
      <h3>${location.name}</h3>
      <p><strong>Address:</strong> <a href="${googleMapsLink}" target="_blank" rel="noopener noreferrer">${location.address || "No address provided"}</a></p>
      <p><strong>Parents:</strong></p>
      ${getParentsHtml(location.parents)}
    </div>
  `;

    if (userLocation) {
        const distKm = haversineDistance(userLocation, {
            lat: location.lat,
            lng: location.lng
        }).toFixed(2);
        content += `<p><strong>Distance from you:</strong> ${distKm} km</p>`;
    }

    infoWindow.setContent(content);
    infoWindow.open(map, marker);
}

function getParentsHtml(parents) {
    if (!Array.isArray(parents) || parents.length === 0) return "<p><em>No parent info</em></p>";
    return `<ul>` + parents.map(parent => {
        if (parent.phone) return `<li>${parent.name} - <a href="tel:${parent.phone}">${parent.phone}</a></li>`;
        return `<li>${parent.name}</li>`;
    }).join("") + `</ul>`;
}

// Toggle all markers in a group
function toggleGroup(groupName, visible, map) {
    const group = markersByGroup[groupName];
    if (!group) return;
    group.markers.forEach(marker => {
        marker.map = visible ? map : null;
    });
}


function haversineDistance(latLng1, latLng2) {
    const toRad = x => (x * Math.PI) / 180;
    const R = 6371; // km

    const dLat = toRad(latLng2.lat - latLng1.lat);
    const dLng = toRad(latLng2.lng - latLng1.lng);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latLng1.lat)) *
        Math.cos(toRad(latLng2.lat)) *
        Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}