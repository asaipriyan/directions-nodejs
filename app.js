const express = require("express");
const axios = require("axios");
const geolib = require("geolib");
const fs = require("fs");

const app = express();
const port = 3000; // Choose your desired port number

app.get("/directions", async (req, res) => {
  const pickupAddress = req.query.pickup;
  const dropAddress = req.query.drop;

  const point = [12.910639780322974, 79.4011570899276];

  try {
    // Step 1: Geocode the pickup and drop locations
    const pickupCoordinates = await geocodeAddress(pickupAddress);
    const dropCoordinates = await geocodeAddress(dropAddress);

    // Step 2: Get the directions between the pickup and drop locations
    const directions = await getDirections(pickupCoordinates, dropCoordinates);

    const polyline = directions.map((x) => x.polyline.points);
    const coordinates = polyline.map((x) => decodePolyline(x));

    const result = coordinates
      .map((coort) => {
        return coort.map((x) => ({ lat: x[0], lng: x[1] }));
      })
      .flat();

    // const tolls = [
    //   { lat: 12.905885217669995, lng: 78.95206340118442 },
    //   { lat: 12.905845157966446, lng: 78.95167979488009 },
    //   { lat: 12.910953506850573, lng: 79.40135021315359 },
    // ];
    const tolls = [[12.905746754512412, 78.95171616258091]].map((x) => ({
      lat: x[0],
      lng: x[1],
    }));

    const crossing = crossCheckInPoint(result, tolls);

    fs.writeFileSync("coordinates.json", JSON.stringify(result));

    // Step 3: Check if the directions cross the geofence
    // const crossing = checkGeofenceCrossing(directions, geofence);

    res.json({ crossing, directions });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});

function crossCheckInPoint(coordinates, tolls) {
  let passToll = [];
  for (let toll of tolls) {
    for (let i = 0; i < coordinates.length; i++) {
      const start = coordinates[i];
      const end = coordinates[i + 1];
      if (!end) {
        continue;
      }

      if (
        geolib.isPointNearLine(
          toll,
          { lat: start.lat, lng: start.lng },
          { lat: end.lat, lng: end.lng },
          15
        )
      ) {
        console.log(toll);
        passToll.push(toll);
        break;
      }
    }
  }
  return passToll;
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

async function geocodeAddress(address) {
  const apiKey = "AIzaSyCdLX8AflVYmDYxCpSyNPGZtg3g8Qn1xw8";
  const apiUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${apiKey}`;

  const response = await axios.get(apiUrl);
  const result = response.data.results[0];

  if (result) {
    const { lat, lng } = result.geometry.location;
    return { lat, lng };
  } else {
    throw new Error("Geocoding failed");
  }
}

async function getDirections(origin, destination) {
  const apiKey = "AIzaSyCdLX8AflVYmDYxCpSyNPGZtg3g8Qn1xw8";
  const apiUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&key=${apiKey}`;

  const response = await axios.get(apiUrl);
  const result = response.data;

  if (result.status === "OK") {
    return result.routes[0].legs[0].steps; // Extract the steps of the route
  } else {
    throw new Error("Directions not found");
  }
}

function checkGeofenceCrossing(directions, geofence) {
  // Perform your geofence crossing check here
  // Example logic: Check if any step of the directions is within the geofence

  for (const step of directions) {
    const { lat, lng } = step.start_location;
    if (isInsideGeofence(lat, lng, geofence)) {
      return true;
    }
  }

  return false;
}

function isInsideGeofence(lat, lng, geofence) {
  return geolib.isPointInPolygon({ lat, lng }, geofence);
}

function decodePolyline(encoded) {
  let index = 0,
    lat = 0,
    lng = 0,
    coordinates = [];

  while (index < encoded.length) {
    let shift = 0,
      result = 0,
      byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lat * 1e-5, lng * 1e-5]);
  }

  return coordinates;
}
