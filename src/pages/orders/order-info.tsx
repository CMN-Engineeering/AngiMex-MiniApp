import { HomeIcon, LocationMarkerLineIcon } from "@/components/vectors";
import { Order } from "@/types";
import { formatShippingAddress } from "@/utils/format";
import { Icon, List } from "zmp-ui";
import DeliverySummary from "../cart/delivery-summary";

function OrderInfo(props: { order: Order; editable?: boolean }) {
  return (
    <List noSpacing className="bg-section rounded-lg">
      <List.Item prefix={<Icon icon="zi-note" />} title="Mã đơn hàng">
        <span className="text-xs text-inactive">{props.order.id}</span>
      </List.Item>
      {props.order.delivery.type === "pickup" ? (
        <DeliverySummary
          icon={<HomeIcon />}
          title="Giao đến"
          subtitle={props.order.delivery.stationName ?? ""}
          description={
            props.order.delivery.stationAddress ??
            `Điểm nhận hàng ${props.order.delivery.stationId}`
          }
          linkTo={props.editable ? "/shipping-address" : undefined}
          linkState={props.editable ? { order: props.order } : undefined}
        />
      ) : (
        <DeliverySummary
          icon={<LocationMarkerLineIcon />}
          title="Giao đến"
          subtitle={`${props.order.delivery.name} - ${props.order.delivery.phone}`}
          description={formatShippingAddress(props.order.delivery)}
          linkTo={props.editable ? "/shipping-address" : undefined}
          linkState={props.editable ? { order: props.order } : undefined}
        />
      )}
      {props.order.note && (
        <List.Item prefix={<Icon icon="zi-note" />} title="Ghi chú">
          <span className="text-xs text-inactive">{props.order.note}</span>
        </List.Item>
      )}
    </List>
  );
}

export default OrderInfo;
