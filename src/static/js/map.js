let markersByGroup = {};

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

        markersByGroup[groupName] = [];

        addGroupLegend(legend, groupName, backgroundColor, textColor, map);

        groupLocations.forEach((location) => {
            if (!location || !location.lat || !location.lng) return;

            const marker = createMarker(location, map, backgroundColor, textColor);
            marker.addListener("click", () => {
                openInfoWindow(infoWindow, marker, location, userLocation, backgroundColor, textColor, map);
            });
            markersByGroup[groupName].push(marker);
        });

        map.controls[google.maps.ControlPosition.LEFT_TOP].push(legend);
    });
};

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

function addGroupLegend(legend, groupName, backgroundColor, textColor, map) {
    const label = document.createElement("label");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => toggleGroup(groupName, checkbox.checked, map));

    const colorBox = document.createElement("span");
    colorBox.style.display = "inline-block";
    colorBox.style.width = "12px";
    colorBox.style.height = "12px";
    colorBox.style.marginRight = "5px";
    colorBox.style.backgroundColor = backgroundColor;

    label.appendChild(checkbox);
    label.appendChild(colorBox);
    label.appendChild(document.createTextNode(" " + groupName));

    legend.appendChild(label);
    legend.appendChild(document.createElement("br"));
}

function createMarker(location, map, backgroundColor, textColor) {
    const latLng = {
        lat: location.lat,
        lng: location.lng
    };

    const wrapper = document.createElement("div");
    wrapper.className = "name-tag-wrapper";
    wrapper.style.setProperty("--bg-color", backgroundColor);

    const nameTag = document.createElement("div");
    nameTag.className = "name-tag";
    nameTag.textContent = location.display_name;
    nameTag.style.setProperty("--tag-bg", backgroundColor);
    nameTag.style.setProperty("--arrow-color", backgroundColor);
    nameTag.style.color = textColor;

    wrapper.appendChild(nameTag);

    return new google.maps.marker.AdvancedMarkerElement({
        position: latLng,
        map,
        content: wrapper,
    });
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
    if (!Array.isArray(parents) || parents.length === 0) {
        return "<p><em>No parent info</em></p>";
    }
    return `<ul>` + parents.map(parent => {
        if (parent.phone) {
            return `<li>${parent.name} - <a href="tel:${parent.phone}">${parent.phone}</a></li>`;
        }
        return `<li>${parent.name}</li>`;
    }).join("") + `</ul>`;
}

function toggleGroup(groupName, visible, map) {
    if (!markersByGroup[groupName]) return;
    markersByGroup[groupName].forEach(marker => {
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