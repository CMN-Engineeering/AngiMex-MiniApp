import { Tabs } from "zmp-ui";
import OrderList from "./order-list";
import { ordersState } from "@/state";
import { useNavigate, useParams } from "react-router-dom";

function OrdersPage() {
  const { status } = useParams();
  const navigate = useNavigate();
  const activeKey = [
    "waiting for payment",
    "cod",
    "confirmed",
    "completed",
  ].includes(status ?? "")
    ? status
    : "waiting for payment";

  return (
    <Tabs
      activeKey={activeKey}
      onChange={(nextStatus) => navigate(`/orders/${nextStatus}`)}
    >
      <Tabs.Tab key="cod" label="Thanh toán khi nhận hàng">
        <OrderList ordersState={ordersState("cod")} />
      </Tabs.Tab>
      <Tabs.Tab key="waiting for payment" label="Chờ thanh toán">
        <OrderList ordersState={ordersState("waiting for payment")} />
      </Tabs.Tab>
      <Tabs.Tab key="confirmed" label="Thanh toán thành công">
        <OrderList ordersState={ordersState("confirmed")} />
      </Tabs.Tab>
      <Tabs.Tab key="completed" label="Đã hoàn thành">
        <OrderList ordersState={ordersState("completed")} />
      </Tabs.Tab>
    </Tabs>
  );
}

export default OrdersPage;
