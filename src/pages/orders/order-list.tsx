import { Order } from "@/types";
import { Atom, useAtomValue, useSetAtom } from "jotai";
import { loadable } from "jotai/utils";
import { useEffect, useMemo } from "react";
import { EmptyOrder } from "@/components/empty";
import OrderSummary from "./order-summary";
import { OrderSummarySkeleton } from "@/components/skeleton";
import { refreshOrdersState } from "@/state";

function OrderList(props: { ordersState: Atom<Promise<Order[]>> }) {
  const orderList = useAtomValue(
    useMemo(() => loadable(props.ordersState), [props.ordersState])
  );
  const refreshOrders = useSetAtom(refreshOrdersState);

  useEffect(() => {
    if (
      orderList.state !== "hasData" ||
      !orderList.data.some((order) => order.paymentStatus === "waiting")
    ) {
      return;
    }

    const intervalId = setInterval(refreshOrders, 5000);
    return () => clearInterval(intervalId);
  }, [orderList, refreshOrders]);

  if (orderList.state === "hasData" && orderList.data.length === 0) {
    return <EmptyOrder />;
  }

  return (
    <div className="space-y-2 p-4">
      {orderList.state !== "hasData" ? (
        <>
          <OrderSummarySkeleton />
          <OrderSummarySkeleton />
          <OrderSummarySkeleton />
        </>
      ) : (
        orderList.data.map((order) => (
          <OrderSummary key={order.id} order={order} />
        ))
      )}
    </div>
  );
}

export default OrderList;
