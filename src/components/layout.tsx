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
import { useEffect, useMemo, useRef, useState } from "react";
import { openChat } from "zmp-sdk/apis";
import { Button } from "zmp-ui";
import { backendPost, backendRequest, getCurrentUserId } from "@/utils/backend";
import { getConfig } from "@/utils/template";

function CartInitializer() {
  const [cart, setCart] = useAtom(cartState);
  const products = useAtomValue(useMemo(() => loadable(productsState), []));
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const hasLoadedCart = useRef(false);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  useEffect(() => {
    if (products.state !== "hasData" || hasLoadedCart.current) {
      return;
    }

    let cancelled = false;
    const loadCart = async () => {
      try {
        const userId = await getCurrentUserId();
        const data = await backendRequest<{
          success: boolean;
          items: { item_id: number; amount: number }[];
        }>(`/save_cart?user_id=${encodeURIComponent(userId)}`);
        if (!data.success) {
          throw new Error("cart_load_failed");
        }
        if (cancelled) return;

        const loadedCart: typeof cart = [];
        for (const item of data.items) {
          const product = products.data.find(
            (candidate) => candidate.id === Number(item.item_id)
          );
          const quantity = Number(item.amount);
          const availableQuantity = Math.min(quantity, product?.stock ?? 0);
          if (product && Number.isSafeInteger(quantity) && availableQuantity > 0) {
            loadedCart.push({
              product,
              quantity: availableQuantity,
            });
          }
        }

        const mergedCart = [...loadedCart];
        for (const localItem of cartRef.current) {
          const currentItemIndex = mergedCart.findIndex(
            (item) => item.product.id === localItem.product.id
          );
          const currentItem =
            currentItemIndex === -1 ? undefined : mergedCart[currentItemIndex];
          const quantity = Math.min(
            localItem.product.stock,
            (currentItem?.quantity ?? 0) + localItem.quantity
          );
          if (quantity <= 0) {
            if (currentItemIndex !== -1) {
              mergedCart.splice(currentItemIndex, 1);
            }
            continue;
          }
          const mergedItem = {
            product: localItem.product,
            quantity,
          };
          if (currentItemIndex === -1) {
            mergedCart.push(mergedItem);
          } else {
            mergedCart[currentItemIndex] = mergedItem;
          }
        }
        setCart(mergedCart);
        hasLoadedCart.current = true;
        setLoadedUserId(userId);
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load cart:", error);
        }
      }
    };

    void loadCart();
    return () => {
      cancelled = true;
    };
  }, [products, setCart]);

  useEffect(() => {
    if (!loadedUserId) return;

    const timeoutId = window.setTimeout(() => {
      const items = cart.map(({ product, quantity }) => ({
        item_id: product.id,
        amount: quantity,
      }));
      saveQueue.current = saveQueue.current
        .then(async () => {
          const result = await backendPost<
            {
              user_id: string;
              items: { item_id: number; amount: number }[];
            },
            { success: boolean }
          >("/save_cart", { user_id: loadedUserId, items });
          if (!result.success) {
            throw new Error("cart_save_failed");
          }
        })
        .catch((error) => {
          console.warn("Failed to save cart:", error);
        });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [cart, loadedUserId]);

  return null;
}

function MaintenancePage() {
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

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-section p-4 text-foreground"
      role="main"
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
  const [appStatus, setAppStatus] = useState<
    "checking" | "healthy" | "maintenance"
  >("checking");

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
          setAppStatus(health.isHealthy === false ? "maintenance" : "healthy");
        }
      } catch (error) {
        console.warn("Failed to check app maintenance status:", error);
        if (!cancelled) {
          setAppStatus("maintenance");
        }
      }
    };

    void checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  if (appStatus === "maintenance") {
    return <MaintenancePage />;
  }

  if (appStatus === "checking") {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-background">
        <PageSkeleton />
      </div>
    );
  }

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
    </div>
  );
}
