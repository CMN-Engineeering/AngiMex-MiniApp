import HorizontalDivider from "@/components/horizontal-divider";
import Section from "@/components/section";
import { Order } from "@/types";
import { formatPrice } from "@/utils/format";
import CollapsibleOrderItems from "./collapsible-order-items";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button, Icon, Modal } from "zmp-ui";
import toast from "react-hot-toast";
import { backendRequest, getCurrentUserId } from "@/utils/backend";
import { useSetAtom } from "jotai";
import { refreshOrdersState } from "@/state";
const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)
function OrderSummary(props: { order: Order; full?: boolean }) {
  const navigate = useNavigate();
  const refreshOrders = useSetAtom(refreshOrdersState);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
              props.order.paymentStatus === "pending"
                ? "text-danger"
                : "text-primary"
            }`}
          >
            {props.order.paymentStatus === "cash on delivery"
              ? "Thanh toán khi nhận hàng"
              : {
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
      {!props.full && (props.order.status === "waiting for payment" || props.order.status === "cod") && (
        <div className="px-4 pb-3" style={{display:"flex"}}>
          {props.order.status === "waiting for payment" && props.order.paymentStatus === "pending" && (
            <Button
              className="w-full"
              style={{
                backgroundColor:"#52B361",
                marginRight:"5px",
                width:'100%',
                padding:'25px'
              }}
              // onClick={(event) => {
              //   event.stopPropagation();
              //   setConfirmingDelete(true);
              // }}
            >
            Thanh toán
            </Button>
          )}
          <Button
            style={{
              width:'100%',
              padding:0
            }}
            variant="tertiary"
            prefixIcon={<Icon icon="zi-delete" />}
            onClick={(event) => {
              event.stopPropagation();
              setConfirmingDelete(true);
            }}
            disabled={deleting}
          >
            Xóa đơn hàng
          </Button>
        </div>
      )}

      <Modal
        visible={confirmingDelete}
        title="Xóa đơn hàng"
        description="Bạn có chắc muốn xóa đơn hàng đang chờ thanh toán không?"
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
