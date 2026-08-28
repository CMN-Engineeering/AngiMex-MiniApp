import Layout from "@/components/layout";
import CartPage from "@/pages/cart";
import CategoryDetailPage from "@/pages/catalog/category-detail";
import CategoryListPage from "@/pages/catalog/category-list";
import ProductDetailPage from "@/pages/catalog/product-detail";
import HomePage from "@/pages/home";
import ProfilePage from "@/pages/profile";
import SearchPage from "@/pages/search";
import { createBrowserRouter } from "react-router-dom";
import { getBasePath } from "@/utils/zma";
import OrdersPage from "./pages/orders";
import ShippingAddressPage from "./pages/cart/shipping-address";
import StationsPage from "./pages/cart/stations";
import OrderDetailPage from "./pages/orders/detail";
import ProfileEditorPage from "./pages/profile/editor";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        {
          path: "/",
          element: <HomePage />,
          handle: {
            logo: true,
            search: true,
          },
        },
        {
          path: "/categories",
          element: <CategoryListPage />,
          handle: {
            title: "Danh mục",
            noBack: true,
          },
        },
        {
          path: "/orders/:status?",
          element: <OrdersPage />,
          handle: {
            title: "Đơn hàng",
          },
        },
        {
          path: "/order/:id",
          element: <OrderDetailPage />,
          handle: {
            title: "Thông tin đơn hàng",
          },
        },
        {
          path: "/cart",
          element: <CartPage />,
          handle: {
            title: "Giỏ hàng",
            noBack: true,
            noFloatingCart: true,
          },
        },
        {
          path: "/shipping-address",
          element: <ShippingAddressPage />,
          handle: {
            title: "Địa chỉ nhận hàng",
            noFooter: true,
            noFloatingCart: true,
          },
        },
        {
          path: "/stations",
          element: <StationsPage />,
          handle: {
            title: "Điểm nhận hàng",
            noFooter: true,
          },
        },
        {
          path: "/profile",
          element: <ProfilePage />,
          handle: {
            logo: true,
          },
        },
        {
          path: "/profile/edit",
          element: <ProfileEditorPage />,
          handle: {
            title: "Thông tin tài khoản",
            noFooter: true,
            noFloatingCart: true,
          },
        },
        {
          path: "/category/:id",
          element: <CategoryDetailPage />,
          handle: {
            search: true,
            title: ({ categories, params }) =>
              categories.find((c) => String(c.id) === params.id)?.name,
          },
        },
        {
          path: "/product/:id",
          element: <ProductDetailPage />,
          handle: {
            scrollRestoration: 0, // when user selects another product in related products, scroll to the top of the page
            noFloatingCart: true,
          },
        },
        {
          path: "/search",
          element: <SearchPage />,
          handle: {
            search: true,
            title: "Tìm kiếm",
            noFooter: true,
          },
        },
      ],
    },
  ],
  { basename: getBasePath() }
);

export default router;
