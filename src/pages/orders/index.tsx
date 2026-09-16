import { Tabs } from "zmp-ui";
import OrderList from "./order-list";
import { ordersState } from "@/state";
import { useNavigate, useParams } from "react-router-dom";

function OrdersPage() {
  const { status } = useParams();
  const navigate = useNavigate();

  return (
    <Tabs
      className="h-full flex flex-col"
      activeKey={status}
      onChange={(status) => navigate(`/orders/${status}`)}
    >
      <Tabs.Tab key="waiting for payment" label="Đang chờ thanh toán">
        <OrderList ordersState={ordersState("waiting for payment")} />
      </Tabs.Tab>
      <Tabs.Tab key="confirmed" label="Thanh toán thành công">
        <OrderList ordersState={ordersState("confirmed")} />
      </Tabs.Tab>
      <Tabs.Tab key="completed" label="Lịch sử">
        <OrderList ordersState={ordersState("completed")} />
      </Tabs.Tab>
    </Tabs>
  );
}

export default OrdersPage;
