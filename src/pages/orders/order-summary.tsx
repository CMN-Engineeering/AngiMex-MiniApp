import HorizontalDivider from "@/components/horizontal-divider";
import Section from "@/components/section";
import { Order } from "@/types";
import { formatPrice } from "@/utils/format";
import CollapsibleOrderItems from "./collapsible-order-items";
import { useNavigate } from "react-router-dom";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Modal } from "zmp-ui";
import toast from "react-hot-toast";
import { backendRequest, getCurrentUserId } from "@/utils/backend";
import { useSetAtom } from "jotai";
import { refreshOrdersState } from "@/state";
import { CheckoutSDK, events, EventName } from "zmp-sdk/apis";
const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)
const GET_MAC_URL = "https://cmnes.com:4488/get_mac";
const CHECKOUT_ORDER_LINK_URL = "https://cmnes.com:4488/checkout_order_link";
const CONFIRM_CHECKOUT_PAYMENT_URL = "https://cmnes.com:4488/confirm_checkout_payment";
function OrderSummary(props: {
  order: Order;
  full?: boolean;
  showCancel?: boolean;
}) {
  const navigate = useNavigate();
  const refreshOrders = useSetAtom(refreshOrdersState);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const activeCheckoutRef = useRef(false);
  const checkoutOrderIdRef = useRef<string | null>(null);
  const paymentLockRef = useRef(false);
  const canPay =
    props.order.paymentStatus === "waiting" ||
    (props.order.status === "waiting for payment" &&
      props.order.paymentStatus === "pending");

  const handlePaymentDone = useCallback(async (data: unknown) => {
    if (!activeCheckoutRef.current || paymentLockRef.current) return;
    if (
      typeof data !== "string" &&
      (typeof data !== "object" || data === null || Array.isArray(data))
    ) {
      activeCheckoutRef.current = false;
      setCreatingPayment(false);
      toast.error("Không nhận được kết quả thanh toán từ Checkout.");
      return;
    }

    paymentLockRef.current = true;
    try {
      const result = await CheckoutSDK.checkTransaction({
        data: data as string | Record<string, string | null | undefined>,
      });
      if (result.resultCode !== 1) {
        activeCheckoutRef.current = false;
        setCreatingPayment(false);
        if (result.resultCode === 0) {
          toast("Thanh toán chưa hoàn tất. Đơn hàng vẫn đang chờ thanh toán.");
        } else if (result.resultCode === -1) {
          toast.error("Thanh toán thất bại. Vui lòng thử lại.");
        }
        return;
      }

      const checkoutOrderId = checkoutOrderIdRef.current;
      if (!checkoutOrderId) {
        throw new Error("checkout_order_id_missing");
      }
      const userId = await getCurrentUserId();
      const response = await fetch(CONFIRM_CHECKOUT_PAYMENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_code: String(props.order.id),
          checkout_order_id: checkoutOrderId,
          user_id: userId,
        }),
      });
      const confirmation = await response.json();
      if (!response.ok || !confirmation.success) {
        throw new Error(confirmation.error_code ?? "checkout_confirmation_failed");
      }

      activeCheckoutRef.current = false;
      setCreatingPayment(false);
      refreshOrders();
      navigate("/orders/confirmed", { viewTransition: true });
      toast.success("Thanh toán thành công. Đơn hàng đã được xác nhận!", {
        icon: "🎉",
      });
    } catch (error) {
      console.error("Failed to confirm Checkout payment:", error);
      activeCheckoutRef.current = false;
      setCreatingPayment(false);
      toast.error("Không thể xác nhận thanh toán. Vui lòng thử lại.");
    } finally {
      paymentLockRef.current = false;
    }
  }, [navigate, props.order.id, refreshOrders]);

  useEffect(() => {
    events.on(EventName.PaymentDone, handlePaymentDone);
    return () => {
      events.off(EventName.PaymentDone, handlePaymentDone);
    };
  }, [handlePaymentDone]);

  const handlePay = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (creatingPayment) return;

    setCreatingPayment(true);
    try {
      const items = props.order.items.map((item) => ({
        id: String(item.product.id),
        amount: item.product.price * item.quantity,
      }));
      const body = {
        desc: `Thanh toán đơn hàng ${props.order.id}`,
        item: items,
        amount: props.order.total,
        method: JSON.stringify({ id: "BANK", isCustom: false }),
      };
      const macUrl = new URL(GET_MAC_URL);
      macUrl.searchParams.set("body", JSON.stringify(body));
      const macResponse = await fetch(macUrl.toString());
      const macData = await macResponse.json();
      if (!macResponse.ok || !macData.success || !macData.mac) {
        throw new Error(macData.error ?? "checkout_mac_failed");
      }

      await CheckoutSDK.createOrder({
        ...body,
        mac: String(macData.mac),
        success: async (data) => {
          try {
            const linkResponse = await fetch(CHECKOUT_ORDER_LINK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_code: String(props.order.id),
                checkout_order_id: data.orderId,
                method: "BANK",
              }),
            });
            const linkData = await linkResponse.json();
            if (!linkResponse.ok || !linkData.success) {
              throw new Error(linkData.error ?? "checkout_order_link_failed");
            }
            checkoutOrderIdRef.current = String(data.orderId);
            activeCheckoutRef.current = true;
          } catch (error) {
            console.error("Failed to link Checkout order:", error);
            setCreatingPayment(false);
          }
        },
        fail: (error) => {
          console.error("Checkout order creation failed:", error);
          setCreatingPayment(false);
        },
      });
    } catch (error) {
      console.error("Failed to create Checkout payment:", error);
      setCreatingPayment(false);
    }
  };

  const returnToOrders = () => {
    setConfirmingDelete(false);
    navigate(`/orders/${props.order.status}`);
  };

  const handleDelete = async () => {
    if (deleting) return;

    setDeleting(true);
    try {
      const userId = await getCurrentUserId();
      const data = await backendRequest<{ success: boolean; error?: string }>(
        `/delete_order?order_code=${encodeURIComponent(String(props.order.id))}&user_id=${encodeURIComponent(userId)}`
      );
      if (!data.success) {
        throw new Error(data.error ?? "delete_order_failed");
      }
      refreshOrders();
      toast.success("Đã xóa đơn hàng");
    } catch (error) {
      console.warn("Failed to delete order:", error);
      toast.error("Không thể xóa đơn hàng. Vui lòng thử lại.");
    } finally {
      setDeleting(false);
      returnToOrders();
    }
  };

  return (
    <Section
      title={
        
        <div className="w-full flex justify-between items-center space-x-2 font-normal">
          {/* <span className="text-xs truncate bold">
            Trạng thái giao dịch:
          </span> */}
          <span style={{marginLeft:'auto'}}
            className={`text-xs ${
              props.order.paymentStatus === "pending" ||
              props.order.paymentStatus === "waiting"
                ? "text-danger"
                : "text-primary"
            }`}
          >
            {props.order.paymentStatus === "cash on delivery"
              ? "Thanh toán khi nhận hàng"
              : {
                  waiting: "Chờ thanh toán",
                  pending: `Cần thanh toán trước ngày ${tomorrow.getDate()}/${tomorrow.getMonth()}/${tomorrow.getFullYear()}`,
                  success: "Đã thanh toán",
                  failed: "Thanh toán thất bại",
                }[props.order.paymentStatus]}
          </span>
          
        </div>
      }
      className="flex-1 overflow-y-auto rounded-lg"
      onClick={() => {
        if (!props.full) {
          navigate(`/order/${props.order.id}`, {
            state: props.order,
            viewTransition: true,
          });
        }
      }}
    >
      <div className="w-full">
        <CollapsibleOrderItems
          items={props.order.items}
          defaultExpanded={props.full}
        />
      </div>
      <HorizontalDivider />
      <div className="flex justify-between items-center px-4 py-2 space-x-4">
        <div className="text-xs">Tổng tiền hàng</div>
        <div className="text-sm font-medium">
          {formatPrice(props.order.total)}
        </div>
      </div>
      {(canPay ||
        (props.showCancel &&
          (props.order.status === "waiting for payment" ||
            props.order.status === "cod"))) && (
        <div className="px-4 pb-3" style={{display:"flex"}}>
          {canPay && (
            <Button
              className="w-full"
              style={{
                backgroundColor: "#235d2f",
                marginRight:"5px",
                width:'100%',
                padding:'25px'
              }}
              onClick={handlePay}
              disabled={creatingPayment}
            >
            {creatingPayment ? "Đang xử lý..." : "Thanh toán"}
            </Button>
          )}
          {props.showCancel &&
            (props.order.status === "waiting for payment" ||
              props.order.status === "cod") && (
              <Button
                style={{
                  width: "100%",
                  padding: 0,
                  backgroundColor: "#E11A45",
                  color: "white",
                }}
                variant="tertiary"
                prefixIcon={<Icon icon="zi-delete" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmingDelete(true);
                }}
                disabled={deleting}
              >
                Hủy đơn hàng
              </Button>
            )}
        </div>
      )}

      <Modal
        visible={confirmingDelete}
        title="Hủy đơn hàng"
        description="Bạn có chắc chắn muốn hủy đơn hàng không?"
        maskClosable={!deleting}
        onClose={returnToOrders}
        actions={[
          {
            text: "Hủy",
            close: true,
            onClick: returnToOrders,
          },
          {
            text: "Xóa",
            danger: true,
            disabled: deleting,
            onClick: () => {
              setConfirmingDelete(false);
              void handleDelete();
            },
          },
        ]}
      />
    </Section>
  );
}

export default OrderSummary;
