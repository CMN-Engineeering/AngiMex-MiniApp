import HorizontalDivider from "@/components/horizontal-divider";
import ProductGrid from "@/components/product-grid";
import { useAtomValue } from "jotai";
import { productsByCategoryState, productsState } from "@/state";
import CategorySlider from "@/components/category-slider";
import { Suspense } from "react";
import { ProductGridSkeleton } from "../search";
import { EmptyCategory } from "@/components/empty";
import { useParams } from "react-router-dom";

function ProductList() {
  const { id } = useParams();
  const products = useAtomValue(productsByCategoryState(id));

  if (!products.length) {
    return <EmptyCategory />;
  }

  return <ProductGrid products={products} className="pt-4" />;
}

export default function CategoryDetailPage() {
  return (
    <div className="h-full flex flex-col bg-section">
      <CategorySlider />
      <HorizontalDivider />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<ProductGridSkeleton className="pt-4" />}>
          <ProductList />
        </Suspense>
      </div>
    </div>
  );
}
