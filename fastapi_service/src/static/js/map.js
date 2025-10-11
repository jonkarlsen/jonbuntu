let markersByGroup = {};
let currentZIndex = 1;
window.initMap = async function() {
    const {
        Map
    } = await google.maps.importLibrary("maps");
    const {
        AdvancedMarkerElement
    } = await google.maps.importLibrary("marker");

    const mapCenter = {
        lat: 58.8138,
        lng: 5.75
    };
    const map = new Map(document.getElementById("map"), {
        zoom: 14,
        center: mapCenter,
        mapId: googleMapId,
    });

    let userLocation = await getUserLocation(map);
    const infoWindow = new google.maps.InfoWindow();
    const legend = document.getElementById("legend");
    Object.entries(allLocations).forEach(([groupName, groupData]) => {
        const {
            students: groupLocations = [],
            legend: legendColors = {}
        } = groupData;
        const backgroundColor = legendColors.background || "#000";
        const textColor = legendColors.text || "#fff";

        // Create collapsible legend section
        addGroupLegend(legend, groupName, backgroundColor, textColor, map);

        groupLocations
            .slice() // make a copy so you don’t mutate the original
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
            .forEach((location) => {
                if (!location || !location.lat || !location.lng) return;

                const marker = createMarker(location, map, backgroundColor, textColor);
                marker.addListener("click", () => {
                    focusMarker(marker, location, userLocation, infoWindow, backgroundColor, textColor, map);
                });

                // Store marker in the group object
                markersByGroup[groupName].markers.push(marker);

                // Add clickable legend entry
                const entry = document.createElement("div");
                entry.textContent = location.display_name;
                entry.className = "marker-entry";
                entry.style.cursor = "pointer";
                entry.addEventListener("click", () => {
                    focusMarker(marker, location, userLocation, infoWindow, backgroundColor, textColor, map);
                });
                markersByGroup[groupName].container.appendChild(entry);
            });


    });
    map.controls[google.maps.ControlPosition.LEFT_TOP].push(legend);
    if (xplora && xplora.latitude && xplora.longitude) {
        const xploraLocation = {
            display_name: `Xplora Watch\n${xplora.last_tracking}` || "Xplora Watch",
            name: xplora.user || "Xplora Watch",
            lat: xplora.latitude,
            lng: xplora.longitude,
            address: xplora.address || "Unknown location",
            battery: xplora.battery_level,
            accuracy: xplora.gps_accuracy,
            last_tracking: xplora.last_tracking,
            parents: [], // optional — keeps `getParentsHtml()` happy
        };

        const backgroundColor = "#800080"; // purple
        const textColor = "#FFFF00"; // yellow

        const xploraMarker = createMarker(
            xploraLocation,
            map,
            backgroundColor,
            textColor
        );

        xploraMarker.addListener("click", () => {
            focusMarker(
                xploraMarker,
                xploraLocation,
                userLocation,
                infoWindow,
                backgroundColor,
                textColor,
                map
            );
        });
    } else {
        console.warn("Xplora data missing or incomplete:", xplora);
    }
};

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
    smoothPanTo(map, marker.position);
    map.setZoom(16);

    openInfoWindow(infoWindow, marker, location, userLocation, backgroundColor, textColor, map);

    marker.zIndex = currentZIndex++;

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
                new google.maps.marker.AdvancedMarkerElement({
                    position: userLoc,
                    map,
                });
                resolve(userLoc);
            },
            () => {
                console.warn("Geolocation permission denied or unavailable.");
                resolve(null);
            }
        );
    });
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

function createMarker(location, map, backgroundColor, textColor) {
    const latLng = {
        lat: location.lat,
        lng: location.lng
    };

    const wrapper = document.createElement("div");
    wrapper.className = "name-tag-wrapper";
    wrapper.style.setProperty("--bg-color", backgroundColor);

    const scalable = document.createElement("div");
    scalable.className = "scalable";

    const nameTag = document.createElement("div");
    nameTag.className = "name-tag";
    nameTag.textContent = location.display_name;
    nameTag.style.setProperty("--tag-bg", backgroundColor);
    nameTag.style.setProperty("--arrow-color", backgroundColor);
    nameTag.style.color = textColor;

    scalable.appendChild(nameTag);
    wrapper.appendChild(scalable);

    const marker = new google.maps.marker.AdvancedMarkerElement({
        position: latLng,
        map,
        content: wrapper,
        zIndex: 0,
    });
    marker.nameTag = nameTag;
    marker.scalableElement = scalable;
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