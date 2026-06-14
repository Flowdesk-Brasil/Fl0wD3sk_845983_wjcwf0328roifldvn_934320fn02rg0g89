"use client";

import { useEffect, useMemo, useState } from "react";
import { Barcode, CheckCircle2, Eraser, PackageSearch, Printer, RotateCcw, ScanBarcode, Search, Tag } from "lucide-react";
import { getProducts } from "@/lib/api";
import {
  LABEL_SIZES,
  code128SvgMarkup,
  formatLabelCurrency,
  getLabelProductMeta,
  getProductPrintCode,
  makeLabelPrintDocument,
  normalizeProductText,
  type ProductLabelPrintItem,
} from "@/lib/product-labels";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge } from "@/components/ui";

type QuantityMap = Record<string, number>;

type MatrixRow = {
  color: string;
  cells: Partial<Record<(typeof LABEL_SIZES)[number], Product>>;
};

const EMPTY_ROWS = Array.from({ length: 4 }, (_, index) => index);

function productHaystack(product: Product) {
  return normalizeProductText([
    product.name,
    product.barcode,
    product.sku,
    product.internal_code,
    product.category,
    product.subcategory,
    product.brand,
  ].filter(Boolean).join(" "));
}

function searchScore(product: Product, rawTerm: string) {
  const term = rawTerm.trim();
  const normalized = normalizeProductText(term);
  if (product.barcode === term) return 0;
  if (product.sku?.toLowerCase() === term.toLowerCase()) return 1;
  if (product.internal_code?.toLowerCase() === term.toLowerCase()) return 2;
  if (normalizeProductText(product.name).startsWith(normalized)) return 3;
  return 10;
}

function compareProducts(a: Product, b: Product) {
  const metaA = getLabelProductMeta(a);
  const metaB = getLabelProductMeta(b);
  return (
    metaA.color.localeCompare(metaB.color, "pt-BR") ||
    (metaA.size ?? "").localeCompare(metaB.size ?? "", "pt-BR") ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}

function toMatrixRows(products: Product[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>();
  for (const product of products) {
    const meta = getLabelProductMeta(product);
    const row = rows.get(meta.color) ?? { color: meta.color, cells: {} };
    if (meta.size && LABEL_SIZES.includes(meta.size as (typeof LABEL_SIZES)[number])) {
      row.cells[meta.size as (typeof LABEL_SIZES)[number]] = product;
    }
    rows.set(meta.color, row);
  }
  return [...rows.values()].sort((a, b) => a.color.localeCompare(b.color, "pt-BR"));
}

function inputQuantity(value: number | undefined) {
  return Number.isFinite(value) ? String(value) : "0";
}

export default function ReimpressaoEtiquetasPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProducts()
      .then((data) => setProducts(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Nao foi possivel carregar os produtos."))
      .finally(() => setLoading(false));
  }, []);

  const activeProducts = useMemo(() => products.filter((product) => product.active !== false), [products]);

  const searchResults = useMemo(() => {
    const raw = query.trim();
    if (!raw) return [];
    const normalized = normalizeProductText(raw);
    return activeProducts
      .filter((product) => productHaystack(product).includes(normalized))
      .sort((a, b) => searchScore(a, raw) - searchScore(b, raw) || compareProducts(a, b))
      .slice(0, 40);
  }, [activeProducts, query]);

  useEffect(() => {
    if (!query.trim()) {
      setSelectedId(null);
      return;
    }
    if (!searchResults.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (current && searchResults.some((product) => product.id === current)) return current;
      const exact = searchResults.find((product) => product.barcode === query.trim());
      return (exact ?? searchResults[0]).id;
    });
  }, [query, searchResults]);

  const selectedProduct = useMemo(
    () => activeProducts.find((product) => product.id === selectedId) ?? null,
    [activeProducts, selectedId],
  );

  const groupedProducts = useMemo(() => {
    if (!selectedProduct) return searchResults;
    const selectedMeta = getLabelProductMeta(selectedProduct);
    const sameBase = activeProducts.filter((product) => getLabelProductMeta(product).baseName === selectedMeta.baseName);
    const group = sameBase.length > 1 ? sameBase : searchResults.length ? searchResults : [selectedProduct];
    return [...new Map(group.map((product) => [product.id, product])).values()].sort(compareProducts);
  }, [activeProducts, searchResults, selectedProduct]);

  const matrixRows = useMemo(() => toMatrixRows(groupedProducts), [groupedProducts]);

  const selectedItems = useMemo<ProductLabelPrintItem[]>(() => {
    return groupedProducts
      .map((product) => ({
        product,
        quantity: quantities[product.id] ?? 0,
        meta: getLabelProductMeta(product),
      }))
      .filter((item) => item.quantity > 0);
  }, [groupedProducts, quantities]);

  const totalLabels = selectedItems.reduce((total, item) => total + item.quantity, 0);
  const previewProduct = selectedItems[0]?.product ?? selectedProduct ?? groupedProducts[0] ?? null;
  const previewMeta = previewProduct ? getLabelProductMeta(previewProduct) : null;
  const previewCode = previewProduct ? getProductPrintCode(previewProduct) : "";

  function setProductQuantity(productId: string, value: string) {
    const next = Math.max(0, Math.min(999, Number.parseInt(value || "0", 10) || 0));
    setQuantities((current) => ({ ...current, [productId]: next }));
    setMessage(null);
  }

  function clearQuantities() {
    setQuantities({});
    setMessage(null);
  }

  function resetSearch() {
    setQuery("");
    setSelectedId(null);
    setQuantities({});
    setMessage(null);
    setError(null);
  }

  function printLabels() {
    setError(null);
    setMessage(null);

    if (!selectedItems.length) {
      setError("Informe pelo menos uma quantidade antes de imprimir.");
      return;
    }

    const popup = window.open("", "corpo-evolucao-etiquetas", "width=520,height=720");
    if (!popup) {
      setError("O navegador bloqueou a janela de impressao. Libere pop-ups para imprimir as etiquetas.");
      return;
    }

    popup.document.open();
    popup.document.write(makeLabelPrintDocument(selectedItems, { templateUrl: `${window.location.origin}/Etiq-model.svg` }));
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      popup.print();
      setMessage(`${totalLabels} etiqueta(s) enviada(s) para a fila de impressao 40x30.`);
    }, 350);
  }

  if (loading) return <LoadingState label="Carregando produtos da loja..." />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Logistica & Loja"
        title="Reimpressao de Etiquetas"
        description="Busque por codigo de barras, SKU, codigo interno ou nome e imprima etiquetas 40x30 em lote para produtos e variacoes."
        action={
          <button className="btn btn-primary" type="button" onClick={printLabels} disabled={!totalLabels}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      />

      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2>Busca rapida por produto</h2>
            <p>Use o leitor de codigo de barras ou digite manualmente. O primeiro resultado exato ja fica selecionado.</p>
          </div>
          <StatusBadge tone={totalLabels ? "blue" : "gray"}>{totalLabels} etiquetas</StatusBadge>
        </div>
        <div className="card-body grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative block min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#8d97aa]" />
                <input
                  className="field w-full pl-10"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Insira o code bar, SKU ou nome do produto"
                  autoFocus
                />
              </label>
              <button className="btn btn-secondary" type="button" onClick={clearQuantities} disabled={!Object.keys(quantities).length}>
                <Eraser className="h-4 w-4" /> Zerar
              </button>
              <button className="btn btn-secondary" type="button" onClick={resetSearch}>
                <RotateCcw className="h-4 w-4" /> Limpar
              </button>
            </div>

            <ErrorBanner message={error} />
            {message && (
              <div className="success-banner">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            {!query.trim() ? (
              <div className="rounded-2xl border border-dashed border-[#cfd7e4] bg-[#f8fafc] p-8 text-center">
                <ScanBarcode className="mx-auto h-10 w-10 text-[#8d97aa]" />
                <h3 className="mt-4 text-sm font-black text-[#172033]">Pronto para bipar o produto</h3>
                <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-[#657085]">
                  Aponte o leitor para o codigo de barras ou digite o codigo. Depois ajuste as quantidades na grade e envie para a etiquetadora 40x30.
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="Nenhum produto encontrado"
                description="Confira o codigo de barras, SKU ou cadastro do produto antes de tentar imprimir."
              />
            ) : (
              <>
                <div className="rounded-2xl border border-[#e3e8f0] bg-[#fbfcfe] p-4">
                  <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-blue-600">Produto selecionado</p>
                      <h3 className="mt-1 text-lg font-black tracking-[-.03em] text-[#172033]">
                        {selectedProduct?.name ?? "Selecione um produto"}
                      </h3>
                      {selectedProduct && (
                        <p className="mt-1 text-xs text-[#657085]">
                          {getProductPrintCode(selectedProduct)} | {groupedProducts.length} variacao(oes) localizadas
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchResults.slice(0, 4).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => setSelectedId(product.id)}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-left text-[11px] font-bold transition",
                            selectedId === product.id
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-[#e3e8f0] bg-white text-[#657085] hover:border-blue-200 hover:text-[#172033]",
                          )}
                        >
                          {product.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="table-wrap rounded-xl border border-[#e3e8f0] bg-white">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="min-w-[220px]">Variacao do mesmo produto</th>
                          {LABEL_SIZES.map((size) => <th key={size} className="text-center">{size}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixRows.length ? matrixRows.map((row) => (
                          <tr key={row.color}>
                            <td>
                              <strong className="text-xs text-[#172033]">{row.color}</strong>
                            </td>
                            {LABEL_SIZES.map((size) => {
                              const product = row.cells[size];
                              return (
                                <td key={size} className="text-center">
                                  {product ? (
                                    <input
                                      aria-label={`Quantidade ${product.name}`}
                                      className="mx-auto h-10 w-16 rounded-xl border border-[#cfd7e4] bg-white text-center text-sm font-black text-[#172033] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                      type="number"
                                      min={0}
                                      max={999}
                                      value={inputQuantity(quantities[product.id])}
                                      onChange={(event) => setProductQuantity(product.id, event.target.value)}
                                    />
                                  ) : (
                                    <span className="mx-auto block h-10 w-16 rounded-xl bg-[#f1f4f9]" />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )) : EMPTY_ROWS.map((row) => (
                          <tr key={row}>
                            <td><span className="block h-10 rounded-xl bg-[#f1f4f9]" /></td>
                            {LABEL_SIZES.map((size) => <td key={size}><span className="mx-auto block h-10 w-16 rounded-xl bg-[#f1f4f9]" /></td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e3e8f0] bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-[#e3e8f0] px-4 py-3">
                    <div>
                      <h3 className="text-sm font-black text-[#172033]">Produtos encontrados</h3>
                      <p className="text-xs text-[#657085]">Use esta lista para variacoes sem tamanho padrao ou cadastros soltos.</p>
                    </div>
                    <StatusBadge tone="blue">{groupedProducts.length} itens</StatusBadge>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Codigo</th>
                          <th>Variacao</th>
                          <th className="text-right">Estoque</th>
                          <th className="text-right">Qtd.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedProducts.map((product) => {
                          const meta = getLabelProductMeta(product);
                          return (
                            <tr key={product.id}>
                              <td>
                                <div className="flex items-center gap-3">
                                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                                    <Tag className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0">
                                    <strong className="block truncate text-xs text-[#172033]">{product.name}</strong>
                                    <small className="mt-1 block truncate text-[10px] text-[#8d97aa]">{product.category || "Sem categoria"}</small>
                                  </span>
                                </div>
                              </td>
                              <td className="font-mono text-xs">{getProductPrintCode(product)}</td>
                              <td>
                                <StatusBadge tone="gray">{[meta.color, meta.size].filter(Boolean).join(" / ") || "Produto"}</StatusBadge>
                              </td>
                              <td className="text-right font-bold text-[#172033]">{product.current_stock}</td>
                              <td className="text-right">
                                <input
                                  aria-label={`Quantidade lista ${product.name}`}
                                  className="ml-auto h-10 w-20 rounded-xl border border-[#cfd7e4] text-center text-sm font-black text-[#172033] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={inputQuantity(quantities[product.id])}
                                  onChange={(event) => setProductQuantity(product.id, event.target.value)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-2xl border border-[#e3e8f0] bg-[#101827] p-4 text-white shadow-lg shadow-[#101827]/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Fila de impressao</p>
                  <strong className="mt-1 block text-3xl font-black tracking-[-.05em]">{totalLabels}</strong>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white">
                  <Printer className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/[.07] p-3">
                  <span className="block text-white/45">Produtos</span>
                  <strong className="mt-1 block text-lg">{selectedItems.length}</strong>
                </div>
                <div className="rounded-xl bg-white/[.07] p-3">
                  <span className="block text-white/45">Modelo</span>
                  <strong className="mt-1 block text-lg">40x30</strong>
                </div>
              </div>
              <button className="btn mt-4 w-full bg-white text-[#101827] hover:bg-blue-50" type="button" onClick={printLabels} disabled={!totalLabels}>
                <Printer className="h-4 w-4" /> Imprimir etiquetas
              </button>
            </div>

            <div className="rounded-2xl border border-[#e3e8f0] bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <Barcode className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-black text-[#172033]">Preview 40x30</h3>
              </div>
              {previewProduct ? (
                <div className="mx-auto grid w-full max-w-[320px] gap-3">
                  <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#111827] bg-white text-black shadow-inner">
                    <img src="/Etiq-model.svg" alt="" className="absolute inset-0 h-full w-full object-fill" />
                    <span className="absolute left-[5.2%] right-[5.2%] top-[25.5%] h-[13%] bg-white" />
                    <span className="absolute left-[29%] right-[8%] top-[53.2%] h-[25.8%] bg-white" />
                    <span className="absolute bottom-[3.7%] left-[33.5%] right-[6.2%] h-[12%] bg-white" />
                    <div className="absolute left-[6%] right-[6%] top-[4.5%] flex items-start justify-between gap-2 text-[10px] font-black uppercase">
                      <span className="truncate opacity-0">Corpo & Evolucao</span>
                      <span>{formatLabelCurrency(previewProduct.selling_price)}</span>
                    </div>
                    <strong className="absolute left-[5.5%] right-[5.5%] top-[26.2%] max-h-[11%] overflow-hidden text-center text-sm font-black uppercase leading-tight">{previewProduct.name}</strong>
                    <div className="absolute left-[30%] right-[8%] top-[54%] h-[22.5%] [&_svg]:h-full [&_svg]:w-full [&_svg]:fill-black" dangerouslySetInnerHTML={{ __html: code128SvgMarkup(previewCode, 42) }} />
                    <div className="absolute left-[30%] right-[8%] top-[77.5%] overflow-hidden text-center font-mono text-[10px] font-black tracking-widest">{previewCode}</div>
                    <div className="absolute bottom-[5.7%] left-[34%] right-[7%] flex justify-between gap-2 text-[9px] font-black uppercase">
                      <span className="truncate">{[previewMeta?.color, previewMeta?.size].filter(Boolean).join(" / ") || "Produto"}</span>
                      <span className="truncate">{previewProduct.sku || previewProduct.internal_code || previewProduct.category || ""}</span>
                    </div>
                  </div>
                  <p className="text-center text-xs leading-5 text-[#657085]">
                    O navegador abre a fila de impressao. Selecione a DIABEL/PT260 no driver do Windows e deixe escala em 100%.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#cfd7e4] p-6 text-center text-xs text-[#657085]">
                  Busque um produto para visualizar a etiqueta.
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
