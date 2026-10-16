import { Outlet } from "react-router-dom";
import Header from "./header";
import Footer from "./footer";
import { Suspense } from "react";
import { PageSkeleton } from "./skeleton";
import { Toaster } from "react-hot-toast";
import { ScrollRestoration } from "./scroll-restoration";
import FloatingCartPreview from "./floating-cart-preview";
import { useAtom, useAtomValue } from "jotai";
import { cartState, productsState } from "@/state";
import { loadable } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { getUserID } from "zmp-sdk";
import { openChat } from "zmp-sdk/apis";
import { Button } from "zmp-ui";
import { backendRequest } from "@/utils/backend";
import { getConfig } from "@/utils/template";

function CartInitializer() {
  const [cart, setCart] = useAtom(cartState);
  const products = useAtomValue(useMemo(() => loadable(productsState), []));

  useEffect(() => {
    if (products.state !== "hasData") {
      return;
    }

    let cancelled = false;
    const loadCart = async () => {
      try {
        const userId = await getUserID({});
        const data = await backendRequest<{
          success: boolean;
          items: { item_id: number; amount: number }[];
        }>(`/get_card_by_id?user_id=${encodeURIComponent(userId)}`);
        if (cancelled || !data.success) {
          return;
        }
        setCart(
          data.items
            .map((item) => ({
              product: products.data.find(
                (product) => product.id === Number(item.item_id)
              ),
              quantity: Number(item.amount),
            }))
            .filter(
              (item): item is { product: (typeof products.data)[number]; quantity: number } =>
                Boolean(item.product) && item.quantity > 0
            )
        );
      } catch (error) {
        console.warn("Failed to load cart:", error);
      }
    };

    loadCart();
    return () => {
      cancelled = true;
    };
  }, [products, setCart]);

  return null;
}

function MaintenanceNotice() {
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const health = await backendRequest<{
          success: boolean;
          isHealthy: boolean | null;
        }>("/get_app_health");
        if (!health.success) {
          throw new Error("app_health_check_failed");
        }
        if (!cancelled) {
          setMaintenance(health.isHealthy === false);
        }
      } catch (error) {
        console.warn("Failed to check app maintenance status:", error);
      }
    };

    void checkHealth();
    const intervalId = setInterval(() => void checkHealth(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const contactSupport = async () => {
    try {
      await openChat({
        type: "oa",
        id: getConfig((config) => config.template.oaIDtoOpenChat),
        message: "Xin chào, tôi cần hỗ trợ!",
      });
    } catch (error) {
      console.warn("Failed to open support chat:", error);
    }
  };

  if (!maintenance) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 p-4"
      style={{ zIndex: 1000 }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-description"
    >
      <div className="w-full max-w-sm rounded-lg bg-section p-6 text-center shadow-lg">
        <h2 id="maintenance-title" className="text-lg font-semibold">
          Thông báo bảo trì
        </h2>
        <p id="maintenance-description" className="mt-2 text-sm text-subtitle">
          Ứng dụng đang được bảo trì. Vui lòng quay lại sau.
        </p>
        <Button className="mt-5 w-full" onClick={() => void contactSupport()}>
          Liên hệ hỗ trợ
        </Button>
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <div className="w-screen h-screen flex flex-col bg-section text-foreground">
      <CartInitializer />
      <Header />
      <div className="flex-1 overflow-y-auto bg-background">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
      <Footer />
      <Toaster
        containerClassName="toast-container"
        containerStyle={{
          top: "calc(50% - 24px)",
        }}
      />
      <FloatingCartPreview />
      <ScrollRestoration />
      <MaintenanceNotice />
    </div>
  );
}
