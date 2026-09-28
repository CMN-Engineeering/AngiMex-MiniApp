import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckoutSDK } from "zmp-sdk/apis";
import { showFunctionButtonWidget } from "zmp-sdk/apis";
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
import { Button, Modal, Select } from "zmp-ui";
import { getAccessToken } from "zmp-sdk";
import qrImage from "../../../docs/qr.webp";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { createQrUrl, downloadQr, getCurrentUserId } from "@/utils/backend";

const NEW_ORDER_CODE_URL = "https://cmnes.com:4488/new_order_code";
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
  const [reserving, setReserving] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"qr" | "cod">("qr");
  const lastErrorCodeRef = useRef<string | undefined>(undefined);

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
        {duration: 5000 }
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
  }

  const setOrdertoCOD = async () => {
    if (reserving || paying) return;

    if (
      !receiverName.trim() ||
      !/^0\d{9}$/.test(phoneNumber.trim()) ||
      !shippingAddressText.trim()
    ) {
      toast.error(
        "Vui lòng kiểm tra tên, số điện thoại và địa chỉ giao hàng trước khi gửi.",
        {duration: 5000 }
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
        
        // Tránh lỗi parse JSON nếu server trả về trang lỗi HTML (404, 500...)
        if (!response.ok) {
          throw new Error(`Server trả về lỗi: ${response.status}`);
        }
        
        const data = await response.json();

        if (data.success) {
          const savedOrderCode = String(data.order_code ?? "");
          setOrderCode(savedOrderCode || null);
          console.log(`Successfully put order ${savedOrderCode} to COD`);
          
          // Hoàn tất đơn, xoá giỏ hàng và chuyển hướng
          activeOrderCode = null;
          setCart([]);
          setNote("");
          setOrderNum(orderNum + 1);
          refreshOrders();

          toast.success(
            "Đặt hàng thành công. Cảm ơn bạn đã mua hàng!",
            { icon: "🎉", duration: 3000 }
          );
          // Điều hướng về trang danh sách đơn hàng (tuỳ chỉnh đường dẫn nếu cần)
          navigate("/orders/cod", { viewTransition: true });
        } else {
          toast.error("Không thể tạo đơn hàng. Vui lòng thử lại.");
        }
    } catch (error) {
      console.warn("Failed to push order to pending:", error);
      toast.error("Không thể tạo mã đơn hàng. Vui lòng thử lại.");
    } finally {
      setReserving(false);
    }
  }

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
  useEffect(() => {
    if (!paying) return;

    let cancelled = false;

    // 2. Check payment status continuously
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
          cancelled = true; // Stop polling
          
          const nextOrderNum = orderNum + 1;
          activeOrderCode = null;
          setPaying(false);
          setCart([]);
          setNote("");
          setOrderNum(nextOrderNum);
          refreshOrders();

          toast.success(
            "Xác nhận thanh toán thành công. Cảm ơn bạn đã mua hàng!",
            { icon: "🎉", duration: 10000 }
          );
          navigate("/orders/confirmed", { viewTransition: true });
        } else {
          // Handle silent errors vs real errors
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

    // Run immediately, then poll
    checkPayment();
    const intervalId = setInterval(checkPayment, ORDER_CONFIRM_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    paying,
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
      <div style={{
            display: 'flex',
            fontSize:'20px',
            padding:'10px'
          }}>
          <span>Tổng thanh toán</span>
          <span style={{
            marginLeft:'auto',
            fontWeight:'650',
            color:'green'
            }}
            >{formatPrice(totalAmount)}
          </span>
      </div>
      <div className="px-4 py-3" style={{}}>
        <span>
          Hình thức thanh toán</span>
        <Select
          name="payment-method"
          value={paymentMethod}
          onChange={(value) => {
            if (value === "qr" || value === "cod") {
              setPaymentMethod(value);
            }
          }}
          placeholder="Chọn hình thức thanh toán"
          closeOnSelect
        >
          <Select.Option value="qr" title="Thanh toán bằng QR">
            Thanh toán bằng QR
          </Select.Option>
          <Select.Option value="cod" title="Thanh toán khi nhận hàng">
            Thanh toán khi nhận hàng
          </Select.Option>
        </Select>
      </div>
      <div className="px-4 py-3">
        <Button
          className="w-full"
          onClick={requestOrderConfirmation}
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
            <img src={orderCode ? createQrUrl(totalAmount, orderCode) : undefined} alt="Mã QR thanh toán SePay" />
            <div className="text-2xl font-bold text-center">{formatPrice(totalAmount)}</div>
            <Button style={{width: "100%"}} className="text-l font-bold text-center"  onClick={downloadQR}>
              Tải mã QR xuống
            </Button>
          </div>
        </div>
      )}
      <Modal
        visible={confirmingOrder}
        title="Xác nhận đặt hàng"
        description={`Bạn có chắc muốn đặt hàng với hình thức ${paymentMethod === "qr" ? "thanh toán bằng QR" : "thanh toán khi nhận hàng"}?`}
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
