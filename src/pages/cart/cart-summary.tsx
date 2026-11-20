import { useAtomValue } from "jotai";
import { loadable } from "jotai/utils";
import { useMemo } from "react";
import { cartTotalState, shippingFeeState } from "@/state";
import { formatPrice } from "@/utils/format";
import { SHIPPING_DISTANCE_LIMIT_MESSAGE } from "@/utils/shipping";
import Section from "@/components/section";
import HorizontalDivider from "@/components/horizontal-divider";

export default function CartSummary() {
  const { totalAmount } = useAtomValue(cartTotalState);
  const shippingFeeResult = useAtomValue(
    useMemo(() => loadable(shippingFeeState), [])
  );
  const shippingFeeData =
    shippingFeeResult.state === "hasData" ? shippingFeeResult.data : null;
  const shippingFee = shippingFeeData?.fee ?? null;
  const shippingStation = shippingFeeData?.station;

  const shippingFeeMessage =
    shippingFeeData?.errorCode === "distance_over_limit"
      ? SHIPPING_DISTANCE_LIMIT_MESSAGE
      : shippingFeeResult.state === "hasError"
      ? "Không thể tính phí vận chuyển"
      : shippingFeeResult.state === "loading"
      ? "Đang tính phí vận chuyển"
      : "Nhập địa chỉ để tính";

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
              <th>
                <div>Phí vận chuyển</div>
                {shippingStation && (
                  <div className="text-xs text-inactive">
                    Vận chuyển từ {shippingStation.name}
                  </div>
                )}
              </th>
              <td>
                {shippingFee === null
                  ? shippingFeeMessage
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
