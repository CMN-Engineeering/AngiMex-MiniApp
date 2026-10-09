export function calculateShippingFee(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("invalid_shipping_distance");
  }

  if (distanceKm <= 3) {
    return 0;
  }

  return Math.ceil((distanceKm - 3) / 20) * 15000;
}
