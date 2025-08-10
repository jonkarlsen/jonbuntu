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
        lng: 5.75,
    };
    const map = new Map(document.getElementById("map"), {
        zoom: 14,
        center: mapCenter,
        mapId: googleMapId,
    });

    const infoWindow = new google.maps.InfoWindow();
    const legend = document.getElementById("legend");

    Object.entries(allLocations).forEach(([groupName, groupData]) => {
        const groupLocations = groupData.students || [];
        const legendColors = groupData.legend || {};
        const backgroundColor = legendColors.background || "#000";
        const textColor = legendColors.text || "#fff";

        markersByGroup[groupName] = [];

        const label = document.createElement("label");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.addEventListener("change", () =>
            toggleGroup(groupName, checkbox.checked, map)
        );

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

        groupLocations.forEach((location) => {
            if (!location || !location.lat || !location.lng) return;

            const latLng = {
                lat: location.lat,
                lng: location.lng,
            };

            const contentString = `
        <div>
          <h3>${location.name}</h3>
          <ul>
            ${location.description
              .map((line) => `<li>${line}</li>`)
              .join("")}
          </ul>
        </div>
      `;

            const wrapper = document.createElement("div");
            wrapper.className = "name-tag-wrapper";
            wrapper.style.setProperty("--bg-color", backgroundColor);

            const nameTag = document.createElement("div");
            nameTag.className = "name-tag";
            nameTag.textContent = location.display_name;
            nameTag.style.setProperty("--tag-bg", backgroundColor);
            nameTag.style.setProperty("--arrow-color", backgroundColor);

            wrapper.appendChild(nameTag);

            const marker = new AdvancedMarkerElement({
                position: latLng,
                map: map,
                content: wrapper,
            });

            marker.addListener("click", () => {
                infoWindow.close();
                infoWindow.setContent(contentString);
                infoWindow.open(map, marker);
            });

            markersByGroup[groupName].push(marker);
        });

        map.controls[google.maps.ControlPosition.LEFT_TOP].push(legend);
    });
};

function toggleGroup(groupName, visible, map) {
    markersByGroup[groupName].forEach((marker) => {
        marker.map = visible ? map : null;
    });
}