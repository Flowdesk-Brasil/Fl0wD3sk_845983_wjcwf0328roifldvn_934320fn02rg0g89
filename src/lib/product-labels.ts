import type { Product } from "@/lib/types";

export const LABEL_SIZES = ["P", "M", "G", "GG", "G1", "G2", "G3"] as const;

export type LabelSize = (typeof LABEL_SIZES)[number] | "PP" | "XG" | "XGG" | "U";

export type LabelProductMeta = {
  color: string;
  size: string | null;
  baseName: string;
  searchKey: string;
};

export type ProductLabelPrintItem = {
  product: Product;
  quantity: number;
  meta?: Partial<LabelProductMeta>;
};

export type LabelPrintOptions = {
  templateUrl?: string;
};

const CODE_128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const COLOR_WORDS: Record<string, string[]> = {
  Branca: ["BRANCA", "BRANCO", "WHITE"],
  Preta: ["PRETA", "PRETO", "BLACK"],
  Amarela: ["AMARELA", "AMARELO", "YELLOW"],
  Verde: ["VERDE", "GREEN"],
  Azul: ["AZUL", "BLUE"],
  Rosa: ["ROSA", "PINK"],
  Vermelha: ["VERMELHA", "VERMELHO", "RED"],
  Cinza: ["CINZA", "GRAFITE", "GREY", "GRAY"],
  Bege: ["BEGE", "NUDE", "CREME"],
  Marrom: ["MARROM", "BROWN"],
  Laranja: ["LARANJA", "ORANGE"],
  Roxa: ["ROXA", "ROXO", "PURPLE"],
  Lilas: ["LILAS", "LILAS"],
};

const SIZE_WORDS = ["XGG", "GG", "G3", "G2", "G1", "XG", "PP", "P", "M", "G", "U"];

export function normalizeProductText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function productText(product: Product) {
  return normalizeProductText([
    product.name,
    product.sku,
    product.internal_code,
    product.barcode,
    product.category,
    product.subcategory,
    product.brand,
  ].filter(Boolean).join(" "));
}

export function inferLabelSize(product: Product): string | null {
  if (product.variant_size?.trim()) return product.variant_size.trim().toUpperCase();
  const tokens = new Set(productText(product).split(/\s+/).filter(Boolean));
  for (const size of SIZE_WORDS) {
    if (tokens.has(size)) return size;
  }
  return null;
}

export function inferLabelColor(product: Product): string {
  if (product.variant_color?.trim()) return product.variant_color.trim();
  if (product.variant_label?.trim()) return product.variant_label.trim();
  const text = productText(product);
  const tokens = new Set(text.split(/\s+/).filter(Boolean));
  for (const [label, aliases] of Object.entries(COLOR_WORDS)) {
    if (aliases.some((alias) => tokens.has(alias))) return label;
  }
  return product.subcategory || product.category || "Variacao";
}

export function inferBaseProductName(product: Product): string {
  if (product.parent_product_id) return product.parent_product_id;
  let base = normalizeProductText(product.name);
  for (const size of SIZE_WORDS) {
    base = base.replace(new RegExp(`\\b${size}\\b`, "g"), " ");
  }
  for (const aliases of Object.values(COLOR_WORDS)) {
    for (const alias of aliases) base = base.replace(new RegExp(`\\b${alias}\\b`, "g"), " ");
  }
  base = base.replace(/\s+/g, " ").trim();
  return base || normalizeProductText(product.name) || product.name;
}

export function getLabelProductMeta(product: Product): LabelProductMeta {
  return {
    color: inferLabelColor(product),
    size: inferLabelSize(product),
    baseName: inferBaseProductName(product),
    searchKey: productText(product),
  };
}

export function getProductPrintCode(product: Product) {
  return product.barcode || product.primary_barcode || product.sku || product.internal_code || product.id.slice(0, 12);
}

function htmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatLabelCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function tsplText(value: string | number | null | undefined, maxLength = 36) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/"/g, "'")
    .slice(0, maxLength);
}

function code128Values(value: string) {
  const safe = value.replace(/[^\x20-\x7E]/g, "").slice(0, 48) || "SEM-CODIGO";
  const values = [...safe].map((char) => char.charCodeAt(0) - 32);
  const startCodeB = 104;
  let checksum = startCodeB;
  values.forEach((code, index) => {
    checksum += code * (index + 1);
  });
  return {
    text: safe,
    sequence: [startCodeB, ...values, checksum % 103, 106],
  };
}

export function code128SvgMarkup(value: string, height = 44) {
  const { sequence } = code128Values(value);
  let x = 0;
  const bars: string[] = [];

  for (const code of sequence) {
    const pattern = CODE_128_PATTERNS[code];
    for (let index = 0; index < pattern.length; index++) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" />`);
      }
      x += width;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" aria-hidden="true">${bars.join("")}</svg>`;
}

function labelMarkup(product: Product, meta?: Partial<LabelProductMeta>, templateUrl?: string) {
  const code = getProductPrintCode(product);
  const variation = [meta?.color ?? inferLabelColor(product), meta?.size ?? inferLabelSize(product)]
    .filter(Boolean)
    .join(" / ");
  const secondary = [product.sku, product.internal_code].filter(Boolean).join(" | ");

  return `
    <section class="label${templateUrl ? " label-with-template" : ""}">
      ${templateUrl ? `<img class="label-template" src="${htmlEscape(templateUrl)}" alt="" />` : ""}
      <span class="label-cover label-cover-title"></span>
      <span class="label-cover label-cover-info"></span>
      <span class="label-cover label-cover-barcode"></span>
      <span class="label-cover label-cover-price"></span>
      <div class="label-top">
        <strong>Corpo & Evolucao</strong>
        <span>${htmlEscape(formatLabelCurrency(product.selling_price))}</span>
      </div>
      <div class="label-title">${htmlEscape(product.name)}</div>
      <div class="label-barcode">${code128SvgMarkup(code, 42)}</div>
      <div class="label-code">${htmlEscape(code)}</div>
      <div class="label-footer">
        <span>${htmlEscape(variation || "Produto")}</span>
        <span>${htmlEscape(secondary || product.category || "")}</span>
      </div>
    </section>
  `;
}

export function makeLabelPrintDocument(items: ProductLabelPrintItem[], options: LabelPrintOptions = {}) {
  const labels = items.flatMap((item) =>
    Array.from({ length: Math.max(0, item.quantity) }, () => labelMarkup(item.product, item.meta, options.templateUrl)),
  );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas 40x30</title>
  <style>
    @page { size: 40mm 30mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    body { width: 40mm; }
    .label {
      width: 40mm;
      height: 30mm;
      position: relative;
      overflow: hidden;
      background: #fff;
      break-after: page;
      page-break-after: always;
    }
    .label-template { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; object-fit: fill; }
    .label-cover { position: absolute; z-index: 1; display: none; background: #fff; }
    .label-with-template .label-cover { display: block; }
    .label-cover-title { left: 1.8mm; right: 1.8mm; top: 7.65mm; height: 3.9mm; }
    .label-cover-info { left: 1.8mm; right: 1.8mm; top: 11.9mm; height: 2.8mm; }
    .label-cover-barcode { left: 11.6mm; right: 2.8mm; top: 16mm; height: 7.8mm; }
    .label-cover-price { left: 13.4mm; right: 2.5mm; bottom: 1.1mm; height: 3.6mm; }
    .label-top {
      position: absolute;
      z-index: 2;
      left: 2.4mm;
      right: 2.4mm;
      top: 1.25mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.2mm;
      font-size: 5.3pt;
      line-height: 1;
      text-transform: uppercase;
    }
    .label-with-template .label-top strong { visibility: hidden; }
    .label-top strong { max-width: 22mm; overflow: hidden; white-space: nowrap; font-weight: 800; letter-spacing: .4pt; }
    .label-top span { font-weight: 900; font-size: 6pt; white-space: nowrap; }
    .label-title {
      position: absolute;
      z-index: 2;
      left: 2.1mm;
      right: 2.1mm;
      top: 7.85mm;
      height: 3.4mm;
      overflow: hidden;
      font-size: 6.4pt;
      font-weight: 900;
      line-height: 1.05;
      text-align: center;
      text-transform: uppercase;
    }
    .label-barcode { position: absolute; z-index: 2; left: 12mm; right: 3.2mm; top: 16.2mm; height: 6.8mm; }
    .label-barcode svg { display: block; width: 100%; height: 100%; fill: #000; }
    .label-code {
      position: absolute;
      z-index: 2;
      left: 12mm;
      right: 3.2mm;
      top: 23.25mm;
      overflow: hidden;
      text-align: center;
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: 5.2pt;
      font-weight: 900;
      letter-spacing: .45pt;
      white-space: nowrap;
    }
    .label-footer {
      position: absolute;
      z-index: 2;
      left: 13.7mm;
      right: 2.8mm;
      bottom: 1.75mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1mm;
      font-size: 4.9pt;
      font-weight: 900;
      line-height: 1;
      text-transform: uppercase;
    }
    .label-footer span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    @media screen {
      body { padding: 8mm; width: auto; background: #e5e7eb; }
      .label { margin: 0 auto 8mm; box-shadow: 0 8px 28px rgba(0,0,0,.18); }
    }
  </style>
</head>
<body>${labels.join("")}</body>
</html>`;
}

export function makeTsplLabelCommands(items: ProductLabelPrintItem[]) {
  return items.map((item) => {
    const product = item.product;
    const code = tsplText(getProductPrintCode(product), 48) || "SEM-CODIGO";
    const meta = {
      color: item.meta?.color ?? inferLabelColor(product),
      size: item.meta?.size ?? inferLabelSize(product),
    };
    const variation = [meta.color !== "Variacao" ? meta.color : null, meta.size].filter(Boolean).join(" / ") || product.unit_measure || "Produto";
    const secondary = product.sku || product.internal_code || product.category || "";
    const quantity = Math.max(1, Math.min(999, Number(item.quantity) || 1));

    return [
      "SIZE 40 mm,30 mm",
      "GAP 2 mm,0 mm",
      "DIRECTION 1",
      "REFERENCE 0,0",
      "CLS",
      `TEXT 24,18,"2",0,1,1,"${tsplText("Corpo & Evolucao", 24)}"`,
      `TEXT 250,18,"2",0,1,1,"${tsplText(formatLabelCurrency(product.selling_price), 12)}"`,
      `TEXT 24,58,"3",0,1,1,"${tsplText(product.name, 32)}"`,
      `TEXT 24,96,"1",0,1,1,"${tsplText(variation, 24)}"`,
      `TEXT 184,96,"1",0,1,1,"${tsplText("CODIGO", 12)}"`,
      `TEXT 24,120,"1",0,1,1,"${tsplText("MANTER ESSA ETIQUETA EM CASO DE TROCA", 42)}"`,
      `BARCODE 92,142,"128",58,1,0,2,2,"${code}"`,
      `TEXT 106,206,"1",0,1,1,"${code}"`,
      `TEXT 24,226,"1",0,1,1,"${tsplText(secondary, 20)}"`,
      `TEXT 222,226,"1",0,1,1,"${tsplText(variation, 18)}"`,
      `PRINT 1,${quantity}`,
      "",
    ].join("\r\n");
  }).join("\r\n");
}
