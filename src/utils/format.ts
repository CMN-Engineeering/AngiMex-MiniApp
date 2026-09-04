export function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    currencyDisplay: "code",
  }).format(price);
}

export function formatDistant(value: number) {
  return `${new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)} km`;
}

export function formatShippingAddress(address: {
  detail: string;
  wardName: string;
  provinceName: string;
}) {
  return [address.detail, address.wardName, address.provinceName]
    .filter(Boolean)
    .join(", ");
}
