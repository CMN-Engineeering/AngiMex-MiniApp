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
import { useEffect, useMemo } from "react";
import { getUserID } from "zmp-sdk";
import { backendRequest } from "@/utils/backend";

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
    </div>
  );
}
