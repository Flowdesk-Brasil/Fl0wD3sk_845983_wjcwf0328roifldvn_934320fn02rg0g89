"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Barcode, CheckCircle2, ClipboardList, Eraser, Layers3, PackageCheck, PackageSearch, Printer, RadioTower, RotateCcw, ScanBarcode, Search, Settings2, Tag, Usb, Zap } from "lucide-react";
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

const LOCAL_PT260_BRIDGE_URL = "http://127.0.0.1:4217";

type PrintApiPayload = {
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

type PrinterDiagnosticPayload = {
  status?: "ok" | "warning" | "unknown";
  message?: string;
  printer?: { name?: string; portName?: string };
};

type MatrixRow = {
  color: string;
  cells: Record<string, Product | undefined>;
};

function productHaystack(product: Product) {
  return normalizeProductText([
    product.name,
    product.barcode,
    product.sku,
    product.internal_code,
    product.category,
    product.subcategory,
    product.brand,
    product.variant_color,
    product.variant_size,
    product.variant_label,
    product.primary_barcode,
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

function toMatrixRows(products: Product[], sizes: string[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>();
  for (const product of products) {
    const meta = getLabelProductMeta(product);
    const row = rows.get(meta.color) ?? { color: meta.color, cells: {} };
    if (meta.size && sizes.includes(meta.size)) {
      row.cells[meta.size] = product;
    }
    rows.set(meta.color, row);
  }
  return [...rows.values()].sort((a, b) => a.color.localeCompare(b.color, "pt-BR"));
}

function inputQuantity(value: number | undefined) {
  return Number.isFinite(value) ? String(value) : "0";
}

async function readJsonPayload<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

async function sendToLocalPt260Bridge(items: ProductLabelPrintItem[]) {
  const response = await fetch(`${LOCAL_PT260_BRIDGE_URL}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const payload = await readJsonPayload<PrintApiPayload>(response);

  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? "A ponte local PT260 nao conseguiu imprimir.");
  }

  return payload;
}

async function getLocalPt260Diagnostics() {
  const response = await fetch(`${LOCAL_PT260_BRIDGE_URL}/printers`, { cache: "no-store" });
  const payload = await readJsonPayload<PrinterDiagnosticPayload>(response);

  if (!response.ok) {
    throw new Error(payload.message ?? "A ponte local PT260 nao respondeu ao diagnostico.");
  }

  return payload;
}

export default function ReimpressaoEtiquetasPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printerInfo, setPrinterInfo] = useState<{ status: "ok" | "warning" | "unknown"; message: string } | null>(null);
  const [directPrinting, setDirectPrinting] = useState(false);
  const [testingMode, setTestingMode] = useState<number | null>(null);

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
    const rootId = selectedProduct.parent_product_id ?? selectedProduct.id;
    const sameFamily = activeProducts.filter((product) => product.id === rootId || product.parent_product_id === rootId);
    if (sameFamily.length > 1) return sameFamily.sort(compareProducts);

    const selectedMeta = getLabelProductMeta(selectedProduct);
    const sameBase = activeProducts.filter((product) => getLabelProductMeta(product).baseName === selectedMeta.baseName);
    const group = sameBase.length > 1 ? sameBase : searchResults.length ? searchResults : [selectedProduct];
    return [...new Map(group.map((product) => [product.id, product])).values()].sort(compareProducts);
  }, [activeProducts, searchResults, selectedProduct]);

  const visibleSizes = useMemo(() => {
    const sizes = groupedProducts
      .map((product) => getLabelProductMeta(product).size)
      .filter((size): size is string => Boolean(size) && LABEL_SIZES.includes(size as (typeof LABEL_SIZES)[number]));
    return LABEL_SIZES.filter((size) => sizes.includes(size));
  }, [groupedProducts]);

  const shouldUseSizeMatrix = visibleSizes.length > 0 && groupedProducts.filter((product) => {
    const size = getLabelProductMeta(product).size;
    return Boolean(size && LABEL_SIZES.includes(size as (typeof LABEL_SIZES)[number]) && visibleSizes.includes(size as (typeof LABEL_SIZES)[number]));
  }).length > 1;

  const matrixRows = useMemo(() => toMatrixRows(groupedProducts, visibleSizes), [groupedProducts, visibleSizes]);

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
  const selectedStock = groupedProducts.reduce((total, product) => total + Number(product.current_stock || 0), 0);
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

  async function printDirectLabels() {
    setError(null);
    setMessage(null);
    setPrinterInfo(null);

    if (!selectedItems.length) {
      setError("Informe pelo menos uma quantidade antes de imprimir.");
      return;
    }

    setDirectPrinting(true);
    try {
      const response = await fetch("/api/printers/label-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedItems }),
      });
      const payload = await readJsonPayload<PrintApiPayload>(response);

      if (!response.ok || !payload.success) {
        if (payload.code === "unsupported_platform") {
          const bridgePayload = await sendToLocalPt260Bridge(selectedItems);
          setMessage(bridgePayload.message ?? `Ponte local PT260 enviou ${totalLabels} etiqueta(s).`);
          setPrinterInfo({
            status: "ok",
            message: "Impressao feita pela ponte local do Windows em 127.0.0.1:4217.",
          });
          return;
        }
        throw new Error(payload.error ?? "Nao foi possivel imprimir direto na PT260.");
      }

      setMessage(payload.message ?? `${totalLabels} etiqueta(s) enviadas direto para a PT260.`);
    } catch (err) {
      if (err instanceof Error && !/ponte local|127\.0\.0\.1|Failed to fetch|fetch/i.test(err.message)) {
        setError(err.message);
      } else {
        setError(
          "Ponte local PT260 nao encontrada ou bloqueada. No Windows da etiquetadora rode `npm run pt260:bridge`, deixe este painel aberto no navegador e tente imprimir novamente.",
        );
      }
    } finally {
      setDirectPrinting(false);
    }
  }

  async function checkPrinter() {
    setPrinterInfo({ status: "unknown", message: "Verificando API local e ponte PT260..." });
    try {
      const response = await fetch("/api/printers/diagnostics", { cache: "no-store" });
      const payload = await readJsonPayload<PrinterDiagnosticPayload>(response);
      if (payload.status === "unknown") {
        const bridgePayload = await getLocalPt260Diagnostics();
        setPrinterInfo({
          status: bridgePayload.status ?? "ok",
          message: bridgePayload.message ?? "Ponte local PT260 respondeu com sucesso.",
        });
        return;
      }
      setPrinterInfo({
        status: payload.status ?? (response.ok ? "ok" : "warning"),
        message: payload.message ?? "Diagnostico concluido.",
      });
    } catch (err) {
      setPrinterInfo({
        status: "warning",
        message: err instanceof Error
          ? `${err.message} Rode npm run pt260:bridge no Windows da PT260 para liberar diagnostico e impressao direta pela Vercel.`
          : "Nao foi possivel validar a impressora. Rode npm run pt260:bridge no Windows da PT260.",
      });
    }
  }

  async function sendPrinterProtocolTest(mode: number) {
    setError(null);
    setMessage(null);
    setTestingMode(mode);
    try {
      const response = await fetch(`${LOCAL_PT260_BRIDGE_URL}/test-print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await readJsonPayload<PrintApiPayload>(response);

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? `Nao foi possivel enviar o teste ${mode} para a PT260.`);
      }

      setMessage(payload.message ?? `Teste ${mode} enviado para a PT260.`);
      setPrinterInfo({
        status: "ok",
        message: `Teste ${mode} entregue para a ponte local. Veja qual etiqueta saiu correta para fixarmos o protocolo definitivo.`,
      });
    } catch (err) {
      setError(err instanceof Error
        ? `${err.message} Rode npm run pt260:bridge no Windows da etiquetadora e tente novamente.`
        : "Nao foi possivel testar a PT260 pela ponte local.");
    } finally {
      setTestingMode(null);
    }
  }

  if (loading) return <LoadingState label="Carregando produtos da loja..." />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Logistica & Loja"
        title="Reimpressao de Etiquetas"
        description="Busque por codigo de barras, SKU, codigo interno ou nome e imprima etiquetas 40x30 em lote para produtos e variacoes."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="button" onClick={checkPrinter}>
              <Settings2 className="h-4 w-4 shrink-0" /> Validar impressora
            </button>
            <button className="btn btn-primary" type="button" onClick={printDirectLabels} disabled={!totalLabels || directPrinting}>
              <RadioTower className="h-4 w-4 shrink-0" /> {directPrinting ? "Enviando..." : "Imprimir direto"}
            </button>
          </div>
        }
      />

      <section className="overflow-hidden rounded-[28px] border border-[#dbe4f0] bg-[linear-gradient(135deg,#101827,#17233a_58%,#0f63ff)] p-5 text-white shadow-[0_24px_80px_rgba(16,24,39,.18)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.14em] text-white/70">
              <Zap className="h-3.5 w-3.5" /> Operacao de etiquetas
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-[-.05em]">Reimpressao com leitura rapida, variantes inteligentes e fila 40x30.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">Bipe o produto, ajuste quantidades por variacao e envie a fila para a PT260. A tabela mostra somente o que existe no cadastro do produto.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <ClipboardList className="h-4 w-4 text-blue-100" />
              <span className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Fila</span>
              <strong className="mt-1 block text-2xl">{totalLabels}</strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <Layers3 className="h-4 w-4 text-blue-100" />
              <span className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Itens</span>
              <strong className="mt-1 block text-2xl">{groupedProducts.length}</strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <PackageCheck className="h-4 w-4 text-blue-100" />
              <span className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Estoque</span>
              <strong className="mt-1 block text-2xl">{selectedStock}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#dbe4f0] bg-white shadow-[0_18px_60px_rgba(16,24,39,.08)]">
        <div className="card-header">
          <div>
            <h2>Central de reimpressao</h2>
            <p>Busca operacional, selecao de variantes, preview e impressao direta em uma unica tela.</p>
          </div>
          <StatusBadge tone={totalLabels ? "blue" : "gray"}>{totalLabels} etiquetas</StatusBadge>
        </div>
        <div className="grid gap-5 bg-[#f6f8fb] p-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:p-5">
          <div className="grid gap-5">
            <div className="rounded-3xl border border-[#dbe4f0] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-blue-600">Entrada de produto</p>
                  <h3 className="mt-1 text-base font-black tracking-[-.03em] text-[#172033]">Leitor de barras ou busca manual</h3>
                </div>
                <ScanBarcode className="h-5 w-5 text-[#8d97aa]" />
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative block min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#8d97aa]" />
                <input
                  className="field h-[52px] w-full rounded-2xl border-[#cfd7e4] bg-[#f8fafc] pl-10 text-base font-semibold"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Insira o code bar, SKU ou nome do produto"
                  autoFocus
                />
              </label>
              <button className="btn btn-secondary" type="button" onClick={clearQuantities} disabled={!Object.keys(quantities).length}>
                <Eraser className="h-4 w-4 shrink-0" /> Zerar
              </button>
              <button className="btn btn-secondary" type="button" onClick={resetSearch}>
                <RotateCcw className="h-4 w-4 shrink-0" /> Limpar
              </button>
              </div>
            </div>

            <ErrorBanner message={error} />
            {message && (
              <div className="success-banner">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            {!query.trim() ? (
              <div className="rounded-3xl border border-dashed border-[#cfd7e4] bg-white p-10 text-center shadow-sm">
                <ScanBarcode className="mx-auto h-10 w-10 text-[#8d97aa]" />
                <h3 className="mt-4 text-sm font-black text-[#172033]">Pronto para bipar o produto</h3>
                <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-[#657085]">
                  Aponte o leitor para o codigo de barras ou digite o codigo. Depois ajuste as quantidades na tabela e envie para a etiquetadora 40x30.
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
                <div className="rounded-3xl border border-[#dbe4f0] bg-white p-4 shadow-sm">
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

                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[#657085]">
                      {shouldUseSizeMatrix
                        ? "Tabela inteligente por cor e somente pelos tamanhos encontrados nesse produto."
                        : "Produto simples ou sem numeracao: informe a quantidade direto na linha do item."}
                    </p>
                    <StatusBadge tone="blue">{groupedProducts.length} item(ns)</StatusBadge>
                  </div>

                  <div className="table-wrap rounded-2xl border border-[#dbe4f0] bg-white">
                    <table className="data-table">
                      <thead>
                        {shouldUseSizeMatrix ? (
                          <tr>
                            <th className="min-w-[220px]">Cor / Variacao</th>
                            {visibleSizes.map((size) => <th key={size} className="text-center">{size}</th>)}
                          </tr>
                        ) : (
                          <tr>
                            <th>Produto</th>
                            <th>Codigo</th>
                            <th>Tipo</th>
                            <th className="text-right">Estoque</th>
                            <th className="text-right">Qtd.</th>
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {shouldUseSizeMatrix ? matrixRows.map((row) => (
                          <tr key={row.color}>
                            <td>
                              <strong className="text-xs text-[#172033]">{row.color}</strong>
                            </td>
                            {visibleSizes.map((size) => {
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
                        )) : groupedProducts.map((product) => {
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
                                <StatusBadge tone="gray">{[meta.color !== "Variacao" ? meta.color : null, meta.size].filter(Boolean).join(" / ") || product.unit_measure || "Produto"}</StatusBadge>
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
            <div className="rounded-[28px] border border-[#101827] bg-[#101827] p-5 text-white shadow-[0_22px_70px_rgba(16,24,39,.22)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Fila de impressao</p>
                  <strong className="mt-1 block text-3xl font-black tracking-[-.05em]">{totalLabels}</strong>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white">
                  <Printer className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-white/[.07] p-3">
                  <span className="block text-white/45">Produtos</span>
                  <strong className="mt-1 block text-lg">{selectedItems.length}</strong>
                </div>
                <div className="rounded-xl bg-white/[.07] p-3">
                  <span className="block text-white/45">Modelo</span>
                  <strong className="mt-1 block text-lg">40x30</strong>
                </div>
                <div className="rounded-xl bg-white/[.07] p-3">
                  <span className="block text-white/45">Modo</span>
                  <strong className="mt-1 block text-lg">TSPL</strong>
                </div>
              </div>
              <button className="btn mt-4 w-full bg-white text-[#101827] hover:bg-blue-50" type="button" onClick={printDirectLabels} disabled={!totalLabels || directPrinting}>
                <Usb className="h-4 w-4 shrink-0" /> {directPrinting ? "Enviando TSPL..." : "Enviar TSPL para PT260"}
              </button>
              <button className="btn mt-2 w-full border border-white/15 bg-white/[.08] text-white hover:bg-white/[.14]" type="button" onClick={printLabels} disabled={!totalLabels}>
                <Printer className="h-4 w-4 shrink-0" /> Fallback navegador
              </button>
              <button className="btn mt-2 w-full border border-white/15 bg-white/[.08] text-white hover:bg-white/[.14]" type="button" onClick={checkPrinter}>
                <AlertTriangle className="h-4 w-4 shrink-0" /> Validar PT260
              </button>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[.06] p-3 text-xs leading-5 text-white/65">
                <strong className="block text-white">Ponte local PT260</strong>
                Protocolo confirmado: TSPL calibrado com densidade 8 e velocidade 2. Em Vercel, rode <code className="rounded bg-white/10 px-1 py-0.5 text-white">npm run pt260:bridge</code> no Windows da etiquetadora.
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((mode) => (
                    <button
                      key={mode}
                      className="rounded-lg border border-white/10 bg-white/[.08] px-2 py-1.5 text-[11px] font-black text-white hover:bg-white/[.16] disabled:opacity-55"
                      type="button"
                      onClick={() => sendPrinterProtocolTest(mode)}
                      disabled={testingMode !== null}
                    >
                      {testingMode === mode ? "..." : mode <= 2 ? `TSPL ${mode}` : `Diag ${mode}`}
                    </button>
                  ))}
                </div>
              </div>
              {printerInfo && (
                <div className={cn(
                  "mt-3 rounded-xl border p-3 text-xs leading-5",
                  printerInfo.status === "ok" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-50" : "border-amber-300/30 bg-amber-300/10 text-amber-50",
                )}>
                  {printerInfo.message}
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-[#dbe4f0] bg-white p-5 shadow-sm">
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
                    O modo direto usa a API local quando o painel roda no Windows ou a ponte PT260 quando o painel esta na Vercel. Use o fallback do navegador somente se o driver grafico exigir impressao visual.
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
