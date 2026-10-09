async function getVietnameseAddress(lat, lon) {
  const url = new URL(
    "https://nominatim.openstreetmap.org/reverse"
  );

  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    "accept-language": "vi",
    addressdetails: "1",
  });

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AngimexMiniApp/1.0 (contact: YOUR_EMAIL)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    return data.display_name;
  } catch (error) {
    console.error("Reverse geocoding error:", error.message);
    throw error;
  }
}

getVietnameseAddress(10.762622, 106.660172)
  .then((address) => console.log("Address:", address))
  .catch(() => console.log("Could not retrieve address."));