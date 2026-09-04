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
  ordersState,
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

const ORDER_CONFIRM_URL = "https://cmnes.com:4488/order_confirm";
const ORDER_CONFIRM_POLL_INTERVAL_MS = 3000;

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

export default function Pay() {
  const { totalAmount } = useAtomValue(cartTotalState);
  const [cart, setCart] = useAtom(cartState);
  const [orderNum, setOrderNum] = useAtom(orderNumState);
  const orderCode = `TT${orderNum.toString().padStart(8, "0")}`;
  const refreshPendingOrders = useSetAtom(ordersState("pending"));
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
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

  const showQR = () => {
    lastErrorCodeRef.current = undefined;
    setPaying(true);
  };

  useEffect(() => {
    showFunctionButtonWidget({
      id: "orderButton",
      type: "ORDER",
      text: "Đặt hàng",
      color: "#0068FF",
      textColor: "#FFFFFF",
      borderRadius: "48px",
      disabled: false,
      onDataReceived: (interactToken) => {
        console.log("Interact Token:", interactToken);
      },
      onError: (error) => {
        console.error("onError:", error.code, error.message);
      },
    });
  }, []);

  useEffect(() => {
    if (!paying) {
      return;
    }

    let cancelled = false;

    const checkPayment = async () => {
      try {
        const orderBreakdown: Record<string, number> = {};
        for (const item of cart) {
          orderBreakdown[item.product.name] =
            (orderBreakdown[item.product.name] ?? 0) + item.quantity;
        }

        const url = new URL(ORDER_CONFIRM_URL);
        url.searchParams.set("order_code", orderCode);
        url.searchParams.set("amount", String(totalAmount));
        url.searchParams.set("shipping_address", shippingAddressText);
        url.searchParams.set("receiver_name", receiverName);
        url.searchParams.set("phone_number", phoneNumber);
        url.searchParams.set("order", JSON.stringify(orderBreakdown));
        console.log("Checking payment status for order:", orderCode, "amount:", totalAmount);
        const response = await fetch(url.toString());
        const data = await response.json();
        if (cancelled) {
          return;
        }

        if (data.success) {
          const nextOrderNum = orderNum + 1;
          const nextOrderCode = `TT${nextOrderNum.toString().padStart(8, "0")}`;
          setPaying(false);
          setCart([]);
          setOrderNum(nextOrderNum);
          refreshPendingOrders();
          toast.success(
            "Xác nhận thanh toán thành công. Cảm ơn bạn đã mua hàng!",
            { icon: "🎉", duration: 10000 }
          );
          navigate("/orders", { viewTransition: true });
        } else {
          const errorCode: string | undefined = data.error_code ?? data.error;
          if (errorCode !== lastErrorCodeRef.current) {
            lastErrorCodeRef.current = errorCode;
            if (!SILENT_PAYMENT_ERROR_CODES.has(normalizeErrorCode(errorCode))) {
              toast.error(getPaymentErrorMessage(errorCode));
            }
          }
        }
      } catch (error) {
        console.warn("Failed to confirm payment:", error);
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
    orderCode,
    orderNum,
    totalAmount,
    shippingAddressText,
    receiverName,
    phoneNumber,
    cart,
    setCart,
    setOrderNum,
    refreshPendingOrders,
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
        <Button onClick={showQR} disabled={paying}>
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
            
            <img src={`https://vietqr.app/img?acc=0766992331&bank=MBBank&amount=${totalAmount}&des=Thanh+toan+don+hang+${orderCode}&template=compact`} alt='Mã QR thanh toán SePay' />

          </div>
        </div>
      )}
    </>
  );
}
