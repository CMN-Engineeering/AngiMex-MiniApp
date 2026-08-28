import ProductItem from "@/components/product-item";
import Section from "@/components/section";
import { ProductItemSkeleton } from "@/components/skeleton";
import { useAtomValue } from "jotai";
import { HTMLAttributes, Suspense } from "react";
import {
  keywordState,
  recommendedProductsState,
  searchResultState,
} from "@/state";
import ProductGrid from "@/components/product-grid";
import { EmptySearchResult } from "@/components/empty";

export function SearchResult() {
  const searchResult = useAtomValue(searchResultState);

  return (
    <div className="w-full h-full space-y-2 bg-background">
      <Section
        title={`Kết quả (${searchResult.length})`}
        className="h-full flex flex-col overflow-y-auto pb-16"
      >
        {searchResult.length ? (
          <ProductGrid products={searchResult} />
        ) : (
          <EmptySearchResult />
        )}
      </Section>
    </div>
  );
}

export function SearchResultSkeleton() {
  return (
    <Section title={`Kết quả`}>
      <ProductGridSkeleton />
    </Section>
  );
}

export function ProductGridSkeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={"grid grid-cols-2 px-4 pt-2 pb-8 gap-4 ".concat(
        className ?? ""
      )}
      {...props}
    >
      <ProductItemSkeleton />
      <ProductItemSkeleton />
      <ProductItemSkeleton />
      <ProductItemSkeleton />
    </div>
  );
}

export function RecommendedProducts() {
  const recommendedProducts = useAtomValue(recommendedProductsState);

  return (
    <Section title="Gợi ý sản phẩm">
      <div className="py-2 px-4 pb-6 flex space-x-2 overflow-x-auto">
        {recommendedProducts.map((product) => (
          <div
            key={product.id}
            className="flex-none"
            style={{ flexBasis: "calc((100vw - 48px) / 2)" }}
          >
            <ProductItem key={product.id} product={product} />
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function SearchPage() {
  const keyword = useAtomValue(keywordState);

  if (keyword) {
    return (
      <Suspense fallback={<SearchResultSkeleton />}>
        <SearchResult />
      </Suspense>
    );
  }
  return <RecommendedProducts />;
}
