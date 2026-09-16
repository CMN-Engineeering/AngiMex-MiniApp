import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckoutSDK } from "zmp-sdk/apis";
import { showFunctionButtonWidget } from "zmp-sdk/apis";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { loadable } from "jotai/utils";
import {
  cartState,
  cartTotalState,
  deliveryModeState,
  orderNumState,
  refreshOrdersState,
  selectedStationState,
  shippingAddressState,
  userInfoState,
} from "@/state";
import { formatPrice, formatShippingAddress } from "@/utils/format";
import { Button } from "zmp-ui";
import { getAccessToken } from "zmp-sdk";
import qrImage from "../../../docs/qr.webp";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { createQrUrl, downloadQr, getCurrentUserId } from "@/utils/backend";

const NEW_ORDER_CODE_URL = "https://cmnes.com:4488/new_order_code";
const ORDER_WAIT_FOR_PAYING = "https://cmnes.com:4488/order_paying";
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
  const [orderNum, setOrderNum] = useAtom(orderNumState);
  const [orderCode, setOrderCode] = useState<string | null>(activeOrderCode);
  const refreshOrders = useSetAtom(refreshOrdersState);
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [reserving, setReserving] = useState(false);
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
        showQR();

        const url = new URL(ORDER_WAIT_FOR_PAYING);
        url.searchParams.set("order_code", newOrderCode);
        url.searchParams.set("order_state", "pending");
        url.searchParams.set("amount", String(totalAmount));
        url.searchParams.set("shipping_address", shippingAddressText);
        url.searchParams.set("receiver_name", receiverName);
        url.searchParams.set("phone_number", phoneNumber);
        url.searchParams.set("user_id", userID);
        url.searchParams.set("order", JSON.stringify(orderBreakdown));
        
        console.log("Putting order into database:", newOrderCode);
        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.success) {
          console.log(`Successfully put order ${newOrderCode} to wait for paying`);
        }
    } catch (error) {
      console.warn("Failed to push order to pending:", error);
      toast.error("Không thể tạo mã đơn hàng. Vui lòng thử lại.");
    } finally {
      setReserving(false);
    }
  }

  const showQR = () => {
    lastErrorCodeRef.current = undefined;
    setPaying(true);
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
          setOrderNum(nextOrderNum);
          refreshOrders();

          toast.success(
            "Xác nhận thanh toán thành công. Cảm ơn bạn đã mua hàng!",
            { icon: "🎉", duration: 10000 }
          );
          navigate("/orders", { viewTransition: true });
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
    setOrderNum,
    refreshOrders,
    navigate,
  ]);

  return (
    <>
      <div className="flex-none flex items-center py-3 px-4 space-x-2 bg-section">
        <div className="space-y-1 flex-1">
          <div className="text-xs text-subtitle">Tổng thanh toán</div>
          <div className="text-sm font-medium text-primary">
            {formatPrice(totalAmount)}
          </div>
        </div>
        {/* <div id="orderButton" className="flex-none">Hehe</div> */}
        <Button onClick={setOrdertoWaitforPaying} disabled={paying || reserving}>
          Thanh toán
        </Button>
      </div>
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
            <img src={orderCode ? createQrUrl(totalAmount, orderCode) : undefined} alt="Mã QR thanh toán SePay" />
            <div className="text-2xl font-bold text-center">{formatPrice(totalAmount)}</div>
            <Button style={{width: "100%"}} className="text-l font-bold text-center"  onClick={downloadQR}>
              Tải mã QR xuống
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
