import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Order } from "@/types";
import OrderSummary from "./order-summary";
import OrderInfo from "./order-info";
import { Button } from "zmp-ui";
import { formatPrice } from "@/utils/format";
import { createQrUrl, downloadQr } from "@/utils/backend";
import { useSetAtom } from "jotai";
import { refreshOrdersState } from "@/state";
import toast from "react-hot-toast";

const ORDER_CONFIRM_URL = "https://cmnes.com:4488/order_confirm";
const ORDER_CONFIRM_POLL_INTERVAL_MS = 3000;

function OrderDetailPage() {
  // Phía tích hợp có thể lấy id từ query params, từ đó gọi API đến server để lấy thông tin chi tiết đơn hàng.
  // Tham khảo logic tương tự ở ProductDetailPage (src/pages/catalog/product-detail.tsx)
  // const { id } = useParams();
  // const order = useAtomValue(orderState(Number(id)));

  // Hoặc đơn giản hơn, lấy thông tin đơn hàng từ router state.
  // Điểm khác biệt lớn nhất là phương án này bắt buộc phải truy cập trang chi tiết đơn hàng từ trang danh sách đơn hàng,
  // chứ không thể truy cập trực tiếp từ deeplink như phương án trên.
  const { state } = useLocation();
  const order = state as Order;
  const navigate = useNavigate();
  const refreshOrders = useSetAtom(refreshOrdersState);
  const [paying, setPaying] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);

  const handleDownloadQr = async () => {
    if (downloadingQr) return;

    setDownloadingQr(true);
    try {
      await downloadQr(order.total, order.id);
    } catch (error) {
      console.warn("Failed to download QR:", error);
      toast.error("Không thể tải mã QR. Vui lòng thử lại.");
    } finally {
      setDownloadingQr(false);
    }
  };

  useEffect(() => {
    if (!paying || order.status !== "waiting for payment") return;

    let cancelled = false;
    const checkPayment = async () => {
      try {
        const url = new URL(ORDER_CONFIRM_URL);
        url.searchParams.set("order_code", String(order.id));
        const response = await fetch(url.toString());
        const data = await response.json();

        if (cancelled) return;
        if (data.success) {
          cancelled = true;
          setPaying(false);
          refreshOrders();
          toast.success("Xác nhận thanh toán thành công. Cảm ơn bạn đã mua hàng!", {
            icon: "🎉",
            duration: 10000,
          });
          navigate("/orders/confirmed", { viewTransition: true });
        } else if (data.error_code === "wrong_payment_amount") {
          toast.error("Số tiền chuyển khoản không đúng. Vui lòng kiểm tra lại.");
        }
      } catch (error) {
        console.warn("Failed to confirm order:", error);
      }
    };

    checkPayment();
    const intervalId = setInterval(checkPayment, ORDER_CONFIRM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [navigate, order.id, order.status, paying, refreshOrders]);

  return (
    <div className="w-full p-4 space-y-2">
      <OrderInfo
        order={order}
        editable={
          order.status === "waiting for payment" &&
          order.delivery.type === "shipping"
        }
      />
      <OrderSummary full order={order} showCancel />
      {order.status === "waiting for payment" &&
        order.paymentStatus === "pending" && (
        <Button className="w-full" onClick={() => setPaying(true)} disabled={paying}>
          Thanh toán
        </Button>
      )}
      {paying && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => setPaying(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-lg bg-section p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Mã QR thanh toán"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-2 text-2xl leading-none text-subtitle"
              aria-label="Đóng mã QR"
              onClick={() => setPaying(false)}
            >
              &times;
            </button>
            <img
              src={createQrUrl(order.total, order.id)}
              alt="Mã QR thanh toán SePay"
            />
            <div className="text-2xl font-bold text-center">
              {formatPrice(order.total)}
            </div>
            <Button onClick={handleDownloadQr} disabled={downloadingQr} className="w-full">
              Tải mã QR xuống
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderDetailPage;
