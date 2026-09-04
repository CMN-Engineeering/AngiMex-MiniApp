import React, { useEffect } from "react";
import { CheckoutSDK } from "zmp-sdk/apis";
import { showFunctionButtonWidget } from "zmp-sdk/apis";
import { useCheckout } from "@/hooks";
import { useAtomValue } from "jotai";
import { cartTotalState } from "@/state";
import { formatPrice } from "@/utils/format";
import { Button } from "zmp-ui";
import { useState } from "react";
import { getAccessToken } from "zmp-sdk";
import qrImage from "../../../docs/qr.webp";

export default function Pay() {
  const { totalAmount } = useAtomValue(cartTotalState);
  const checkout = useCheckout();
  const [paying, setPaying] = useState(false);
  const showQR = () => setPaying(true);
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
            <img src={`https://vietqr.app/img?acc=0766992331&bank=MBBank&amount=${totalAmount}&des=thanh%20toan%20don%20hang&template=compact`} alt='Mã QR thanh toán SePay' />

          </div>
        </div>
      )}
    </>
  );
}
