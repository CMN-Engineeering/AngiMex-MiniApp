import { useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useMemo } from "react";
import {
  cartTotalState,
  deliveryModeState,
  selectedStationState,
  shippingAddressState,
} from "@/state";
import { formatPrice } from "@/utils/format";
import { calculateDistance } from "@/utils/location";
import { calculateShippingFee } from "@/utils/shipping";
import Section from "@/components/section";
import HorizontalDivider from "@/components/horizontal-divider";

export default function CartSummary() {
  const { totalAmount } = useAtomValue(cartTotalState);
  const deliveryMode = useAtomValue(deliveryModeState);
  const shippingAddress = useAtomValue(shippingAddressState);
  const selectedStation = useAtomValue(
    useMemo(() => loadable(selectedStationState), [])
  );
  const shippingFee =
    deliveryMode === "pickup"
      ? 0
      : shippingAddress?.location &&
        selectedStation.state === "hasData" &&
        selectedStation.data
      ? calculateShippingFee(
          calculateDistance(
            selectedStation.data.location.lat,
            selectedStation.data.location.lng,
            shippingAddress.location.lat,
            shippingAddress.location.lng
          )
        )
      : null;

  return (
    <Section title="Thanh toán" className="rounded-lg">
      <div className="px-4 py-2 space-y-4">
        <table className="table w-full text-sm [&_th]:text-left [&_th]:text-xs [&_th]:text-inactive [&_th]:font-medium [&_td]:text-right">
          <tbody>
            <tr>
              <th>Tạm tính</th>
              <td>{formatPrice(totalAmount)}</td>
            </tr>
            <tr>
              <th>Phí vận chuyển</th>
              <td>
                {shippingFee === null
                  ? "Nhập địa chỉ để tính"
                  : formatPrice(shippingFee)}
              </td>
            </tr>
          </tbody>
        </table>
        <HorizontalDivider />
        <div className="flex justify-between font-medium text-sm">
          <div>Tổng thanh toán</div>
          <div>
            {shippingFee === null
              ? "—"
              : formatPrice(totalAmount + shippingFee)}
          </div>
        </div>
      </div>
    </Section>
  );
}
