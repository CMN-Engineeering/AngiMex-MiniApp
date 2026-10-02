import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { events, EventName, CheckoutSDK } from "zmp-sdk/apis";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { loadable } from "jotai/utils";
import {
  cartState,
  cartNoteState,
  cartTotalState,
  deliveryModeState,
  orderNumState,
  refreshOrdersState,
  selectedStationState,
  shippingAddressState,
  userInfoState,
} from "@/state";
import { formatPrice, formatShippingAddress } from "@/utils/format";
import { Button, Modal } from "zmp-ui";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { createQrUrl, downloadQr, getCurrentUserId } from "@/utils/backend";

const ZALO_CHECKOUT_SECRET_KEY = ""
const NEW_ORDER_CODE_URL = "https://cmnes.com:4488/new_order_code";
const GET_MAC_URL = "https://cmnes.com:4488/get_mac";
const CHECKOUT_ORDER_LINK_URL = "https://cmnes.com:4488/checkout_order_link";
const ORDER_WAIT_FOR_PAYING = "https://cmnes.com:4488/order_paying";
const ORDER_COD = "https://cmnes.com:4488/order_cod";
const ORDER_CONFIRM_URL = "https://cmnes.com:4488/order_confirm";
const ORDER_CONFIRM_POLL_INTERVAL_MS = 3000;

// This runtime-only value is cleared when the app is closed or reloaded.
let activeOrderCode: string | null = null;
let activeOrderCodeRequest: Promise<string> | null = null;

// order_not_found just means the transfer hasn't arrived yet, not a real error.
const SILENT_PAYMENT_ERROR_CODES = new Set(["order_not_found"]);

const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  wrong_payment_amount:
    "Số tiền chuyển khoản không đúng. Vui lòng kiểm tra lại và chuyển khoản đúng số tiền.",
};

function normalizeErrorCode(code?: string) {
  return code?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}

function getPaymentErrorMessage(code?: string) {
  if (!code) {
    return "Xác nhận thanh toán thất bại. Vui lòng thử lại.";
  }
  return (
    PAYMENT_ERROR_MESSAGES[normalizeErrorCode(code)] ??
    `Xác nhận thanh toán thất bại (mã lỗi: ${code}).`
  );
}

function reserveOrderCode(userID: string) {
  if (activeOrderCode) {
    return Promise.resolve(activeOrderCode);
  }

  if (!activeOrderCodeRequest) {
    const request = (async () => {
      const codeUrl = new URL(NEW_ORDER_CODE_URL);
      codeUrl.searchParams.set("user_id", userID);
      const codeResponse = await fetch(codeUrl.toString());
      const codeData = await codeResponse.json();
      if (!codeResponse.ok || !codeData.success || !codeData.order_code) {
        throw new Error(codeData.error_code ?? "new_order_code_failed");
      }

      const reservedCode: string = codeData.order_code;
      activeOrderCode = reservedCode;
      return reservedCode;
    })();
    activeOrderCodeRequest = request.then(
      (code) => {
        activeOrderCodeRequest = null;
        return code;
      },
      (error) => {
        activeOrderCodeRequest = null;
        throw error;
      }
    );
  }

  return activeOrderCodeRequest;
}

export default function Pay() {
  const { totalAmount } = useAtomValue(cartTotalState);
  const [cart, setCart] = useAtom(cartState);
  const [, setNote] = useAtom(cartNoteState);
  const note = useAtomValue(cartNoteState);
  const [orderNum, setOrderNum] = useAtom(orderNumState);
  const [orderCode, setOrderCode] = useState<string | null>(activeOrderCode);
  const refreshOrders = useSetAtom(refreshOrdersState);
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [checkingCheckoutPayment, setCheckingCheckoutPayment] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"qr" | "cod">("qr");
  const [selectedMethodName, setSelectedMethodName] = useState<string>("Chuyển khoản ngân hàng");
  const lastErrorCodeRef = useRef<string | undefined>(undefined);
  const finalizedOrderCodeRef = useRef<string | null>(null);

  const deliveryMode = useAtomValue(deliveryModeState);
  const shippingAddress = useAtomValue(shippingAddressState);
  const selectedStation = useAtomValue(
    useMemo(() => loadable(selectedStationState), [])
  );
  const userInfo = useAtomValue(useMemo(() => loadable(userInfoState), []));

  const shippingAddressText =
    deliveryMode === "shipping"
      ? shippingAddress
        ? formatShippingAddress(shippingAddress)
        : ""
      : selectedStation.state === "hasData"
      ? `${selectedStation.data.name} - ${selectedStation.data.address}`
      : "";

  const receiverName =
    deliveryMode === "shipping"
      ? shippingAddress?.name ?? ""
      : userInfo.state === "hasData"
      ? userInfo.data?.name ?? ""
      : "";

  const phoneNumber =
    deliveryMode === "shipping"
      ? shippingAddress?.phone ?? ""
      : userInfo.state === "hasData"
      ? userInfo.data?.phone ?? ""
      : "";

  const setOrdertoWaitforPaying = async () => {
    if (reserving || paying) return;

    if (
      !receiverName.trim() ||
      !/^0\d{9}$/.test(phoneNumber.trim()) ||
      !shippingAddressText.trim()
    ) {
      toast.error(
        "Vui lòng kiểm tra tên, số điện thoại và địa chỉ giao hàng trước khi gửi.",
        { duration: 5000 }
      );
      return;
    }

    setReserving(true);
    try {
      const orderBreakdown: Record<string, number> = {};
      for (const item of cart) {
        orderBreakdown[item.product.name] =
          (orderBreakdown[item.product.name] ?? 0) + item.quantity;
      }
      const userID = await getCurrentUserId();

      const newOrderCode = await reserveOrderCode(userID);
      setOrderCode(newOrderCode);

      const url = new URL(ORDER_WAIT_FOR_PAYING);
      url.searchParams.set("order_code", newOrderCode);
      url.searchParams.set("order_state", "pending");
      url.searchParams.set("amount", String(totalAmount));
      url.searchParams.set("shipping_address", shippingAddressText);
      url.searchParams.set("receiver_name", receiverName);
      url.searchParams.set("phone_number", phoneNumber);
      url.searchParams.set("note", note.slice(0, 100));
      url.searchParams.set("user_id", userID);
      url.searchParams.set("order", JSON.stringify(orderBreakdown));

      console.log("Putting order into database:", newOrderCode);
      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.success) {
        console.log(`Successfully put order ${newOrderCode} to wait for paying`);
        showQR();
      }
    } catch (error) {
      console.warn("Failed to push order to pending:", error);
      toast.error("Không thể tạo mã đơn hàng. Vui lòng thử lại.");
    } finally {
      setReserving(false);
    }
  };

  const setOrdertoCOD = async () => {
    if (reserving || paying) return;

    if (
      !receiverName.trim() ||
      !/^0\d{9}$/.test(phoneNumber.trim()) ||
      !shippingAddressText.trim()
    ) {
      toast.error(
        "Vui lòng kiểm tra tên, số điện thoại và địa chỉ giao hàng trước khi gửi.",
        { duration: 5000 }
      );
      return;
    }

    setReserving(true);
    try {
      const orderBreakdown: Record<string, number> = {};
      for (const item of cart) {
        orderBreakdown[item.product.name] =
          (orderBreakdown[item.product.name] ?? 0) + item.quantity;
      }
      const userID = await getCurrentUserId();

      const url = new URL(ORDER_COD);
      url.searchParams.set("order_state", "cod");
      url.searchParams.set("amount", String(totalAmount));
      url.searchParams.set("shipping_address", shippingAddressText);
      url.searchParams.set("receiver_name", receiverName);
      url.searchParams.set("phone_number", phoneNumber);
      url.searchParams.set("note", note.slice(0, 100));
      url.searchParams.set("user_id", userID);
      url.searchParams.set("order", JSON.stringify(orderBreakdown));

      console.log("Putting COD order into database");
      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`Server trả về lỗi: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const savedOrderCode = String(data.order_code ?? "");
        setOrderCode(savedOrderCode || null);
        console.log(`Successfully put order ${savedOrderCode} to COD`);

        finalizeSuccessfulOrder("cod");
      } else {
        toast.error("Không thể tạo đơn hàng. Vui lòng thử lại.");
      }
    } catch (error) {
      console.warn("Failed to push order to pending:", error);
      toast.error("Không thể tạo mã đơn hàng. Vui lòng thử lại.");
    } finally {
      setReserving(false);
    }
  };

  const handleSelectPaymentMethod = () => {
    CheckoutSDK.selectPaymentMethod({
      channels: [
        { method: "BANK" },
        { method: "COD" },
      ],
      success: (data) => {
        const { method, displayName } = data;
        if (method === "COD") {
          setPaymentMethod("cod");
          setSelectedMethodName(displayName || "Thanh toán khi nhận hàng (COD)");
        } else {
          setPaymentMethod("qr");
          setSelectedMethodName(displayName || "Chuyển khoản ngân hàng");
        }
      },
      fail: (err) => {
        console.log("Select payment method cancelled or failed:", err);
      },
    });
  };

  const getMac = async (body: any) => {
    try {
      const url = new URL(GET_MAC_URL);
      url.searchParams.set("body", JSON.stringify(body));
      
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch MAC");
      
      const data = await response.json(); 
      return data.mac; 
    } catch (error) {
      console.error("Error getting MAC:", error);
      toast.error("Lấy mã giao dịch thất bại.");
      return null;
    }
  }

  const createOrder = async () => {
    if (reserving || paying) return;
    if (
      !cart.length ||
      !receiverName.trim() ||
      !/^0\d{9}$/.test(phoneNumber.trim()) ||
      !shippingAddressText.trim()
    ) {
      toast.error(
        "Vui lòng kiểm tra tên, số điện thoại và địa chỉ giao hàng trước khi gửi.",
        { duration: 5000 }
      );
      return;
    }

    setReserving(true);

    let currentOrderCode = orderCode;

    try {
      if (!currentOrderCode) {
        const userID = await getCurrentUserId();
        currentOrderCode = await reserveOrderCode(userID);
        setOrderCode(currentOrderCode);
      }

      const userID = await getCurrentUserId();
      const orderBreakdown: Record<string, number> = {};
      for (const item of cart) {
        orderBreakdown[item.product.name] =
          (orderBreakdown[item.product.name] ?? 0) + item.quantity;
      }

      const prepareUrl = new URL(ORDER_WAIT_FOR_PAYING);
      prepareUrl.searchParams.set("order_code", currentOrderCode);
      prepareUrl.searchParams.set("order_state", "pending");
      prepareUrl.searchParams.set("amount", String(totalAmount));
      prepareUrl.searchParams.set("shipping_address", shippingAddressText);
      prepareUrl.searchParams.set("receiver_name", receiverName);
      prepareUrl.searchParams.set("phone_number", phoneNumber);
      prepareUrl.searchParams.set("note", note.slice(0, 100));
      prepareUrl.searchParams.set("user_id", userID);
      prepareUrl.searchParams.set("order", JSON.stringify(orderBreakdown));

      const prepareResponse = await fetch(prepareUrl.toString());
      const prepareData = await prepareResponse.json();
      if (!prepareResponse.ok || !prepareData.success) {
        throw new Error(prepareData.error_code ?? "order_prepare_failed");
      }

      const items = cart.map((cartItem) => ({
        id: String(cartItem.product.id),
        amount: cartItem.product.price * cartItem.quantity,
      }));

      const body = {
        desc: `Thanh toán đơn hàng ${currentOrderCode}`,
        item: items,
        amount: totalAmount,
        method: JSON.stringify({
          id: paymentMethod === "cod" ? "COD" : "BANK",
          isCustom: false,
        }),
      };

      const mac = await getMac(body);
      if (!mac) return;

      await CheckoutSDK.createOrder({
        desc: body.desc,
        item: body.item,
        amount: body.amount,
        method: body.method,
        mac: String(mac),
        success: async (data) => {
          const linkUrl = new URL(CHECKOUT_ORDER_LINK_URL);
          const linkResponse = await fetch(linkUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_code: currentOrderCode,
              checkout_order_id: data.orderId,
              method: paymentMethod === "cod" ? "COD" : "BANK",
            }),
          });
          const linkData = await linkResponse.json();
          if (!linkResponse.ok || !linkData.success) {
            toast.error("Không thể liên kết mã đơn hàng Checkout. Vui lòng liên hệ hỗ trợ.");
            return;
          }
          console.log("Tạo đơn hàng trên Zalo thành công", data);
          if (paymentMethod === "cod") {
            finalizeSuccessfulOrder("cod", currentOrderCode);
          }
        },
        fail: (err) => {
          console.error("Tạo đơn hàng thất bại", err);
          toast.error("Không thể tạo đơn hàng.");
        },
      });
    } catch (error) {
      console.error("Failed to create Checkout SDK order:", error);
      toast.error("Không thể tạo đơn hàng. Vui lòng thử lại.");
    } finally {
      setReserving(false);
    }
  };

  const requestOrderConfirmation = () => {
    if (paying || reserving) return;
    setConfirmingOrder(true);
  };

  const confirmOrder = () => {
    setConfirmingOrder(false);
    if (paymentMethod === "qr") {
      void setOrdertoWaitforPaying();
      return;
    }
    void setOrdertoCOD();
  };

  const showQR = () => {
    lastErrorCodeRef.current = undefined;
    setPaying(true);
  };

  const requestCloseQR = () => {
    setConfirmingClose(true);
  };

  const closeQR = () => {
    setConfirmingClose(false);
    setPaying(false);
    setCart([]);
    setNote("");
    activeOrderCode = null;
    refreshOrders();
    navigate("/orders/waiting for payment", { viewTransition: true });
  };

  const downloadQR = async () => {
    if (!orderCode) return;

    try {
      await downloadQr(totalAmount, orderCode);
    } catch (error) {
      console.warn("Failed to download QR:", error);
      toast.error("Không thể tải mã QR. Vui lòng thử lại.");
    }
  };

  const finalizeSuccessfulOrder = useCallback(
    (orderState: "cod" | "confirmed", completedOrderCode = orderCode) => {
      if (
        completedOrderCode &&
        finalizedOrderCodeRef.current === completedOrderCode
      ) {
        return;
      }
      if (completedOrderCode) {
        finalizedOrderCodeRef.current = completedOrderCode;
      }

      activeOrderCode = null;
      setCart([]);
      setNote("");
      setOrderNum((currentOrderNum) => currentOrderNum + 1);
      refreshOrders();

      if (orderState === "cod") {
        toast.success("Đặt hàng thành công. Cảm ơn bạn đã mua hàng!", {
          icon: "🎉",
          duration: 3000,
        });
        navigate("/orders/cod", { viewTransition: true });
        
      } else {
        toast.success("Xác nhận thanh toán thành công. Cảm ơn bạn đã mua hàng!", {
          icon: "🎉",
          duration: 10000,
        });
        navigate("/orders/confirmed", { viewTransition: true });
      }
    },
    [navigate, orderCode, refreshOrders, setCart, setNote, setOrderNum]
  );

  const handlePaymentDone = useCallback(async (data: unknown) => {
    if (
      typeof data !== "string" &&
      (typeof data !== "object" || data === null || Array.isArray(data))
    ) {
      setCheckingCheckoutPayment(true);
      toast.error("Không nhận được thông tin giao dịch từ Checkout.");
      return;
    }

    try {
      const result = await CheckoutSDK.checkTransaction({
        data: data as string | Record<string, string | null | undefined>,
      });

      switch (result.resultCode) {
        case 1:
          if (result.method === "COD") {
            setPaying(false);
            setCheckingCheckoutPayment(false);
            finalizeSuccessfulOrder("cod");
            break;
          }
          setCheckingCheckoutPayment(true);
          break;
        case 0:
          setCheckingCheckoutPayment(true);
          if (result.resultCode === 0) {
            // toast("Giao dịch đang được xử lý.");
          }
          break;
        case -1:
          toast.error("Thanh toán thất bại. Vui lòng thử lại.");
          break;
        case -2:
          toast("Vui lòng chọn phương thức thanh toán.");
          break;
        default:
          console.error("Checkout transaction is invalid:", result);
          toast.error(result.msg || "Đã xảy ra lỗi, vui lòng thử lại sau.");
          break;
      }
    } catch (error) {
      console.warn("Failed to check Checkout transaction:", error);
      setCheckingCheckoutPayment(true);
      toast.error("Không thể kiểm tra giao dịch. Đang chờ hệ thống xác nhận.");
    }
  }, [finalizeSuccessfulOrder]);

  useEffect(() => {
    events.on(EventName.PaymentDone, handlePaymentDone);
    return () => {
      events.off(EventName.PaymentDone, handlePaymentDone);
    };
  }, [handlePaymentDone]);

  // Vẫn giữ cơ chế polling phòng trường hợp dùng ảnh QR code rời (không qua CheckoutSDK)
  useEffect(() => {
    if (!paying && !checkingCheckoutPayment) return;

    let cancelled = false;

    const checkPayment = async () => {
      if (cancelled) return;

      try {
        const url = new URL(ORDER_CONFIRM_URL);
        if (!orderCode) return;
        url.searchParams.set("order_code", orderCode);
        const response = await fetch(url.toString());
        const data = await response.json();

        if (cancelled) return;

        if (data.success) {
          cancelled = true;
          setPaying(false);
          setCheckingCheckoutPayment(false);
          finalizeSuccessfulOrder("confirmed");
        } else {
          const errorCode: string | undefined = data.error_code ?? data.error;
          if (errorCode !== lastErrorCodeRef.current) {
            lastErrorCodeRef.current = errorCode;
            if (errorCode && !SILENT_PAYMENT_ERROR_CODES.has(normalizeErrorCode(errorCode))) {
              toast.error(getPaymentErrorMessage(errorCode));
            }
          }
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
  }, [
    paying,
    checkingCheckoutPayment,
    orderCode,
    orderNum,
    setCart,
    setNote,
    setOrderNum,
    refreshOrders,
    navigate,
  ]);

  return (
    <>
      <div
        style={{
          display: "flex",
          fontSize: "20px",
          padding: "10px",
        }}
      >
        <span>Tổng thanh toán</span>
        <span
          style={{
            marginLeft: "auto",
            fontWeight: "650",
            color: "green",
          }}
        >
          {formatPrice(totalAmount)}
        </span>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm text-subtitle">Hình thức thanh toán</div>
          <div className="font-medium text-base">{selectedMethodName}</div>
        </div>
        <Button size="small" variant="secondary" onClick={handleSelectPaymentMethod}>
          Thay đổi
        </Button>
      </div>

      <div className="px-4 py-3">
        <Button
          className="w-full"
          onClick={createOrder}
          disabled={paying || reserving}
        >
          Xác nhận đặt hàng
        </Button>
      </div>

      {paying && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={requestCloseQR}
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
              onClick={requestCloseQR}
            >
              &times;
            </button>
            <img
              src={orderCode ? createQrUrl(totalAmount, orderCode) : undefined}
              alt="Mã QR thanh toán SePay"
            />
            <div className="text-2xl font-bold text-center">
              {formatPrice(totalAmount)}
            </div>
            <Button
              style={{ width: "100%" }}
              className="text-l font-bold text-center"
              onClick={downloadQR}
            >
              Tải mã QR xuống
            </Button>
          </div>
        </div>
      )}

      <Modal
        visible={confirmingOrder}
        title="Xác nhận đặt hàng"
        description={`Bạn có chắc muốn đặt hàng với hình thức: ${selectedMethodName}?`}
        maskClosable={!reserving}
        onClose={() => setConfirmingOrder(false)}
        actions={[
          {
            text: "Hủy",
            close: true,
            onClick: () => setConfirmingOrder(false),
          },
          {
            text: "Xác nhận",
            disabled: reserving,
            onClick: confirmOrder,
          },
        ]}
      />

      <Modal
        visible={confirmingClose}
        title="Đóng mã QR"
        description="Đơn hàng chưa thanh toán sẽ tự động xóa sau 24h. Tiếp tục đóng mã và lưu đơn hàng?"
        onClose={() => setConfirmingClose(false)}
        actions={[
          {
            text: "Hủy",
            close: true,
            onClick: () => setConfirmingClose(false),
          },
          {
            text: "Đóng mã QR",
            danger: true,
            onClick: closeQR,
          },
        ]}
      />
    </>
  );
}