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
  logoUrl?: string;
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

export function productLabelMarkup(product: Product, meta?: Partial<LabelProductMeta>, options: LabelPrintOptions = {}) {
  const code = getProductPrintCode(product);
  const size = meta?.size ?? inferLabelSize(product);
  const color = meta?.color ?? inferLabelColor(product);
  const hasSize = Boolean(size);
  const secondary = [product.sku, product.internal_code].filter(Boolean).join(" | ");
  const templateUrl = options.templateUrl ?? "/Etiq-model.svg";
  const logoUrl = options.logoUrl ?? "/imagotipo.svg";

  return `
    <section class="etiqueta${hasSize ? "" : " etiqueta-sem-tamanho"}" aria-label="Etiqueta 40x30mm" style="--label-template: url('${htmlEscape(templateUrl)}')">
      <div class="mascara-logo"></div>
      <img class="logo" alt="Logo" src="${htmlEscape(logoUrl)}">
      <strong class="label-preco">${htmlEscape(formatLabelCurrency(product.selling_price))}</strong>
      <strong class="label-produto">${htmlEscape(product.name)}</strong>
      ${hasSize ? `<span class="label-tamanho">${htmlEscape(size)}</span>` : ""}
      <div class="label-barcode">${code128SvgMarkup(code, 44)}</div>
      <div class="label-codigo">${htmlEscape(code)}</div>
      <div class="label-rodape">
        <span>${htmlEscape(color && color !== "Variacao" ? color : product.unit_measure || product.category || "Produto")}</span>
        <span>${htmlEscape(secondary || product.brand || "")}</span>
      </div>
    </section>
  `;
}

export function makeLabelPrintDocument(items: ProductLabelPrintItem[], options: LabelPrintOptions = {}) {
  const labels = items.flatMap((item) =>
    Array.from({ length: Math.max(0, item.quantity) }, () => productLabelMarkup(item.product, item.meta, options)),
  );

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etiqueta 40x30mm</title>
  <style>
    @page {
      size: 40mm 30mm;
      margin: 0;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
    }

    body {
      width: 40mm;
    }

    .etiqueta {
      position: relative;
      width: 40mm;
      height: 30mm;
      overflow: hidden;
      background-color: #fff;
      background-image: var(--label-template);
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      break-after: page;
      page-break-after: always;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .mascara-logo {
      position: absolute;
      left: 10.25mm;
      top: 0.95mm;
      width: 19.50mm;
      height: 5.50mm;
      background: #fff;
    }

    .logo {
      position: absolute;
      left: 10.625mm;
      top: 1.2109mm;
      width: 18.75mm;
      height: 4.6875mm;
      object-fit: fill;
      display: block;
      filter: brightness(0);
    }

    .label-preco,
    .label-produto,
    .label-tamanho,
    .label-codigo,
    .label-rodape {
      position: absolute;
      z-index: 3;
      color: #000;
      line-height: 1;
      text-transform: uppercase;
    }

    .label-preco {
      right: 2.55mm;
      top: 2.78mm;
      width: 9.2mm;
      font-size: 5.1pt;
      font-weight: 950;
      text-align: center;
      white-space: nowrap;
    }

    .label-produto {
      left: 3.3mm;
      right: 3.3mm;
      top: 8.92mm;
      height: 4.4mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-size: 6.7pt;
      font-weight: 900;
      text-align: center;
      letter-spacing: 0;
    }

    .label-tamanho {
      left: 3.12mm;
      top: 16.62mm;
      width: 6.66mm;
      height: 6.66mm;
      display: grid;
      place-items: center;
      font-size: 8pt;
      font-weight: 950;
      text-align: center;
      background: #fff;
    }

    .label-barcode {
      position: absolute;
      z-index: 3;
      left: 12mm;
      right: 3.3mm;
      top: 16.1mm;
      height: 6.82mm;
      background: #fff;
    }

    .label-barcode svg {
      display: block;
      width: 100%;
      height: 100%;
      fill: #000;
    }

    .label-codigo {
      left: 12mm;
      right: 3.3mm;
      top: 23.12mm;
      overflow: hidden;
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: 4.1pt;
      font-weight: 900;
      letter-spacing: .15pt;
      text-align: center;
      white-space: nowrap;
      background: #fff;
    }

    .label-rodape {
      left: 12.9mm;
      right: 2.9mm;
      bottom: 1.55mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1mm;
      overflow: hidden;
      font-size: 4.2pt;
      font-weight: 900;
      background: #fff;
    }

    .label-rodape span {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .etiqueta-sem-tamanho .label-barcode {
      left: 5.2mm;
      right: 5.2mm;
      top: 15.55mm;
      height: 7.35mm;
    }

    .etiqueta-sem-tamanho .label-codigo {
      left: 5.2mm;
      right: 5.2mm;
      top: 23.25mm;
    }

    .etiqueta-sem-tamanho .label-rodape {
      left: 5.2mm;
      right: 5.2mm;
    }

    @media screen {
      body {
        min-height: 100vh;
        display: grid;
        place-items: center;
        gap: 8mm;
        padding: 8mm;
        background: #f2f2f2;
      }

      .etiqueta {
        box-shadow: 0 4px 24px rgba(0,0,0,.25);
      }
    }

    @media print {
      html, body {
        width: 40mm;
        min-height: 0;
        background: #fff;
      }

      body {
        display: block;
        padding: 0;
      }

      .etiqueta {
        box-shadow: none;
      }
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
    const hasSize = Boolean(meta.size);
    const variation = [meta.color !== "Variacao" ? meta.color : null, meta.size].filter(Boolean).join(" / ") || product.unit_measure || "Produto";
    const secondary = product.sku || product.internal_code || product.category || "";
    const quantity = Math.max(1, Math.min(999, Number(item.quantity) || 1));
    const barcodeX = hasSize ? 92 : 42;
    const codeX = hasSize ? 106 : 62;
    const codeWidth = hasSize ? 184 : 220;

    return [
      "SIZE 40 mm,30 mm",
      "GAP 2 mm,0 mm",
      "DENSITY 8",
      "SPEED 2",
      "DIRECTION 1",
      "REFERENCE 0,0",
      "CLS",
      `TEXT 24,18,"2",0,1,1,"${tsplText("Corpo & Evolucao", 24)}"`,
      `TEXT 250,18,"2",0,1,1,"${tsplText(formatLabelCurrency(product.selling_price), 12)}"`,
      `TEXT 24,58,"3",0,1,1,"${tsplText(product.name, 32)}"`,
      ...(hasSize ? [
        "BOX 25,132,78,190,2",
        `TEXT 38,151,"3",0,1,1,"${tsplText(meta.size, 8)}"`,
      ] : []),
      `TEXT 24,120,"1",0,1,1,"${tsplText("MANTER ESSA ETIQUETA EM CASO DE TROCA", 42)}"`,
      `BARCODE ${barcodeX},142,"128",58,1,0,2,2,"${code}"`,
      `TEXT ${codeX},206,"1",0,1,1,"${tsplText(code, codeWidth)}"`,
      `TEXT ${hasSize ? 104 : 42},226,"1",0,1,1,"${tsplText(secondary || variation, hasSize ? 20 : 32)}"`,
      ...(hasSize ? [`TEXT 222,226,"1",0,1,1,"${tsplText(variation, 18)}"`] : []),
      `PRINT 1,${quantity}`,
      "",
    ].join("\r\n");
  }).join("\r\n");
}
