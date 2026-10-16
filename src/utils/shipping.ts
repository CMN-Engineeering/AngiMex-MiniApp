export function calculateShippingFee(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("invalid_shipping_distance");
  }

  if (distanceKm <= 3) {
    return 0;
  }
  if (distanceKm < 5) {
    return 10000;
  }
  if (distanceKm < 10) {
    return 15000;
  }
  if (distanceKm < 15) {
    return 20000;
  }
  return 30000;
}
