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
} from "zmp-sdk/apis";
import toast from "react-hot-toast";
import { calculateDistance } from "./utils/location";
import { formatDistant } from "./utils/format";
import CONFIG from "./config";

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

export const phoneState = atom(async () => {
  let phone = "";
  try {
    const { token } = await getPhoneNumber({});
    // Phía tích hợp làm theo hướng dẫn tại https://mini.zalo.me/documents/api/getPhoneNumber/ để chuyển đổi token thành số điện thoại người dùng ở server.
    // phone = await decodeToken(token);

    // Các bước bên dưới để demo chức năng, phía tích hợp có thể bỏ đi sau.
    // toast(
    //   "Đã lấy được token chứa số điện thoại người dùng. Phía tích hợp cần decode token này ở server. Giả lập số điện thoại 0912345678...",
    //   {
    //     icon: "ℹ",
    //     duration: 10000,
    //   }
    // );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    phone = "0912345678";
    // End demo
  } catch (error) {
    console.warn(error);
  }
  return phone;
});

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

export const productsState = atom(async (get) => {
  const categories = await get(categoriesState);
  const products = await requestWithFallback<
    (Product & { categoryId: number })[]
  >("/products", []);
  return products.map((product) => ({
    ...product,
    category: categories.find(
      (category) => category.id === product.categoryId
    )!,
  }));
});

export const flashSaleProductsState = atom((get) => get(productsState));

export const recommendedProductsState = atom((get) => get(productsState));

export const productState = atomFamily((id: number) =>
  atom(async (get) => {
    const products = await get(productsState);
    return products.find((product) => product.id === id);
  })
);

export const cartState = atom<Cart>([]);

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

export const ordersState = atomFamily((status: OrderStatus) =>
  atomWithRefresh(async () => {
    // Phía tích hợp thay đổi logic filter server-side nếu cần:
    // const serverSideFilteredData = await requestWithFallback<Order[]>(`/orders?status=${status}`, []);
    const allMockOrders = await requestWithFallback<Order[]>("/orders", []);
    const clientSideFilteredData = allMockOrders.filter(
      (order) => order.status === status
    );
    return clientSideFilteredData;
  })
);

export const deliveryModeState = atomWithStorage<Delivery["type"]>(
  CONFIG.STORAGE_KEYS.DELIVERY,
  "shipping"
);
