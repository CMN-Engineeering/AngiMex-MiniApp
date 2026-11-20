import { calculateDistance } from "@/utils/location";
import type { Location, Station } from "@/types";

export const SHIPPING_DISTANCE_LIMIT_MESSAGE =
  "Hiện chưa hỗ trợ giao trên 20km, liên hệ bộ phận CSKH để có giá vận chuyển chính xác";

export function getNearestShippingStation(
  stations: Station[],
  destination: Location
) {
  return stations.reduce<
    { station: Station; distanceKm: number } | null
  >((nearest, station) => {
    const distanceKm = calculateDistance(
      station.location.lat,
      station.location.lng,
      destination.lat,
      destination.lng
    );
    if (!Number.isFinite(distanceKm)) {
      throw new Error("invalid_shipping_distance");
    }
    return !nearest || distanceKm < nearest.distanceKm
      ? { station, distanceKm }
      : nearest;
  }, null);
}
