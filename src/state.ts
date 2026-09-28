import { atom } from "jotai";
import {
  atomFamily,
  atomWithRefresh,
  atomWithStorage,
  loadable,
  unwrap,
} from "jotai/utils";
import {
  Cart,
  Category,
  Delivery,
  Location,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  ShippingAddress,
  Station,
  UserInfo,
} from "@/types";
import { requestWithFallback } from "@/utils/request";
import {
  getLocation,
  getPhoneNumber,
  getSetting,
  getUserInfo,
  getAccessToken,
  authorize,
} from "zmp-sdk/apis";
import toast from "react-hot-toast";
import { calculateDistance } from "./utils/location";
import { formatDistant } from "./utils/format";
import CONFIG from "./config";
import { backendRequest, getCurrentUserId } from "@/utils/backend";
export const userInfoKeyState = atom(0);

export const userInfoState = atom<Promise<UserInfo>>(async (get) => {
  get(userInfoKeyState);

  // Nếu người dùng đã chỉnh sửa thông tin tài khoản trước đó, sử dụng thông tin đã lưu trữ
  const savedUserInfo = localStorage.getItem(CONFIG.STORAGE_KEYS.USER_INFO);
  // Phía tích hợp có thể thay đổi logic này thành fetch từ server
  // const savedUserInfo = await fetchUserInfo({ token: await getAccessToken() });
  if (savedUserInfo) {
    return JSON.parse(savedUserInfo);
  }

  const {
    authSetting: {
      "scope.userInfo": grantedUserInfo,
      "scope.userPhonenumber": grantedPhoneNumber,
    },
  } = await getSetting({});
  const isDev = !window.ZJSBridge;
  if (grantedUserInfo || isDev) {
    // Người dùng cho phép truy cập tên và ảnh đại diện
    const { userInfo } = await getUserInfo({});
    const phone =
      grantedPhoneNumber || isDev // Người dùng cho phép truy cập số điện thoại
        ? await get(phoneState)
        : "";
    return {
      id: userInfo.id,
      name: userInfo.name,
      avatar: userInfo.avatar,
      phone,
      email: "",
      address: "",
    };
  }
});

export const loadableUserInfoState = loadable(userInfoState);

export async function getUserPhoneNumber() {
  let phone = "";
  const GET_PHONE_NUM_URL = "https://cmnes.com:4488/get_phone_num"
  try {
    const { authSetting } = await getSetting({});
    if (!authSetting["scope.userPhonenumber"]) {
      await authorize({ scopes: ["scope.userPhonenumber"] });
    }

    const url = new URL(GET_PHONE_NUM_URL);
    const access_token = await getAccessToken();
    const { token: code } = await getPhoneNumber();
    if (!code) {
      throw new Error("get_phone_number_token_missing");
    }
    url.searchParams.set("access_token", access_token);
    url.searchParams.set("code", code);

    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error ?? "get_phone_number_failed");
    }
    phone =
      data.data?.data?.number ?? data.data?.number ?? data.number ?? "";
    if (phone && phone.startsWith("84")) {
      phone = `0${phone.slice(2)}`;
    }
  } catch (error) {
    console.warn(error);
  }
  return phone;
}

export async function getUserName() {
  await authorize({ scopes: ["scope.userInfo"] });
  const { userInfo } = await getUserInfo({});
  return userInfo.name;
}
let authorized = false;
export async function getUserContactInfo() {
  if (!authorized){
    const data = await authorize({ scopes: ["scope.userInfo", "scope.userPhonenumber"] });
    if (data) authorized = true;
  }
  const { userInfo } = await getUserInfo({});
  const { token: code } = await getPhoneNumber();
  if (!code) {
    throw new Error("get_phone_number_token_missing");
  }

  const url = new URL("https://cmnes.com:4488/get_phone_num");
  const access_token = await getAccessToken();
  url.searchParams.set("access_token", access_token);
  url.searchParams.set("code", code);
  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? "get_phone_number_failed");
  }

  let phone =
    data.data?.data?.number ?? data.data?.number ?? data.number ?? "";
  if (phone && phone.startsWith("84")) {
    phone = `0${phone.slice(2)}`;
  }
  return { name: userInfo.name, phone };
}

export const phoneState = atom(getUserPhoneNumber);

export const bannersState = atom(() =>
  requestWithFallback<string[]>("/banners", [])
);

export const tabsState = atom(["Tất cả", "Nam", "Nữ", "Trẻ em"]);

export const selectedTabIndexState = atom(0);

export const categoriesState = atom(() =>
  requestWithFallback<Category[]>("/categories", [])
);

export const categoriesStateUpwrapped = unwrap(
  categoriesState,
  (prev) => prev ?? []
);

export const allProductsState = atom(async (get) => {
  const categories = await get(categoriesState);
  const products = await backendRequest<(Product & { categoryId: number })[]>(
    "/get_product_details"
  );
  return products.map((product) => ({
    ...product,
    category: categories.find(
      (category) => category.id === product.categoryId
    )!,
  }));
});

export const productsState = atom(async (get) => {
  const products = await get(allProductsState);
  return products.filter((product) => product.isHidden !== true);
});

export const flashSaleProductsState = atom((get) => get(productsState));

export const recommendedProductsState = atom((get) => get(productsState));

export const productState = atomFamily((id: number) =>
  atom(async (get) => {
    const products = await get(allProductsState);
    return products.find((product) => product.id === id);
  })
);

export const cartState = atom<Cart>([]);

export const cartNoteState = atom("");

export const selectedCartItemIdsState = atom<number[]>([]);

export const cartTotalState = atom((get) => {
  const items = get(cartState);
  return {
    totalItems: items.length,
    totalAmount: items.reduce(
      (total, item) => total + item.product.price * item.quantity,
      0
    ),
  };
});

export const keywordState = atom("");

export const searchResultState = atom(async (get) => {
  const keyword = get(keywordState);
  const products = await get(productsState);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return products.filter((product) =>
    product.name.toLowerCase().includes(keyword.toLowerCase())
  );
});

export const productsByCategoryState = atomFamily((id: String) =>
  atom(async (get) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const products = await get(productsState);
    return products.filter((product) => String(product.categoryId) === id);
  })
);

export const stationsState = atom(async () => {
  let location: Location | undefined;
  try {
    const { token } = await getLocation({});
    // Phía tích hợp làm theo hướng dẫn tại https://mini.zalo.me/documents/api/getLocation/ để chuyển đổi token thành thông tin vị trí người dùng ở server.
    // location = await decodeToken(token);

    // Các bước bên dưới để demo chức năng, phía tích hợp có thể bỏ đi sau.
    // toast(
    //   "Đã lấy được token chứa thông tin vị trí người dùng. Phía tích hợp cần decode token này ở server. Giả lập vị trí tại VNG Campus...",
    //   {
    //     icon: "ℹ",
    //     duration: 10000,
    //   }
    // );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    location = {
      lat: 10.773756,
      lng: 106.689247,
    };
    // End demo
  } catch (error) {
    console.warn(error);
  }

  const stations = await requestWithFallback<Station[]>("/stations", []);
  const stationsWithDistance = stations.map((station) => ({
    ...station,
    distance: location
      ? formatDistant(
          calculateDistance(
            location.lat,
            location.lng,
            station.location.lat,
            station.location.lng
          )
        )
      : undefined,
  }));

  return stationsWithDistance;
});

export const selectedStationIndexState = atom(0);

export const selectedStationState = atom(async (get) => {
  const index = get(selectedStationIndexState);
  const stations = await get(stationsState);
  return stations[index];
});

export const shippingAddressState = atomWithStorage<
  ShippingAddress | undefined
>(CONFIG.STORAGE_KEYS.SHIPPING_ADDRESS, undefined);

const allOrdersState = atomWithRefresh(async (get) => {
  const userId = await getCurrentUserId();
    const products = await get(productsState);
    const data = await backendRequest<{
      success: boolean;
      orders: Array<Record<string, any>>;
    }>(`/get_orders_by_user_id?user_id=${encodeURIComponent(userId)}`);

    return data.orders.map((order, index) => {
      const details = order.order_details ?? {};
      const status: OrderStatus =
        order.order_state === "cod" || order.order_state === "pay on delivery"
          ? "cod"
          : order.order_state === "waiting for payment"
          ? "waiting for payment"
          : order.order_state === "confirmed"
          ? "confirmed"
          : "completed";
      const paymentStatus: PaymentStatus =
        order.order_state === "cod" || order.order_state === "pay on delivery"
          ? "cash on delivery"
          : status === "waiting for payment"
          ? "pending"
          : "success";
      return {
        id: order.order_code ?? index,
        status,
        paymentStatus,
        createdAt: new Date(order.created_at),
        receivedAt: new Date(order.created_at),
        items: Object.entries(details)
          .map(([name, quantity]) => ({
            product: products.find((product) => product.name === name),
            quantity: Number(quantity),
          }))
          .filter((item) => item.product && item.quantity > 0),
        delivery: {
          type: order.delivery_type === "pickup" ? "pickup" : "shipping",
          ...(order.delivery_type === "pickup"
            ? {
                stationId: Number(order.station_id),
                stationName: String(order.station_name ?? ""),
                stationAddress: String(order.shipping_address ?? ""),
              }
            : {}),
          detail: order.shipping_address ?? "",
          name: order.receiver_name ?? "",
          phone: order.phone_number ?? "",
          provinceCode: "",
          provinceName: "",
          wardCode: "",
          wardName: "",
        },
        total: Number(order.amount),
        note: String(order.note ?? "").slice(0, 100),
      };
    });
  });

export const ordersState = atomFamily((status: OrderStatus) =>
  atom(async (get) => {
    const orders = await get(allOrdersState);
    return orders.filter((order) => order.status === status);
  })
);

export const refreshOrdersState = allOrdersState;

export const deliveryModeState = atomWithStorage<Delivery["type"]>(
  CONFIG.STORAGE_KEYS.DELIVERY,
  "shipping"
);

export const orderNumState = atomWithStorage<number>(
  CONFIG.STORAGE_KEYS.ORDER_NUM,
  0
);
