"use client";

import React, { useEffect, useState, useRef } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, CheckCircle, Package } from "lucide-react";
import { getProducts, createSale, createSaleItem, updateProduct, createInventoryTransaction } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ErrorBanner, Modal } from "@/components/ui";

interface CartItem extends Product {
  cart_quantity: number;
}

export default function PdvPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH">("PIX");
  const [processing, setProcessing] = useState(false);
  const [saleCompleted, setSaleCompleted] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProducts()
      .then(prods => setProducts(prods.filter(p => p.active)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Barcode scanner listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If we are in an input, don't intercept unless it's the search input specifically
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== searchInputRef.current) return;
      
      if (e.key === 'Enter' && search.trim()) {
        e.preventDefault();
        const barcode = search.trim();
        const product = products.find(p => p.barcode === barcode || p.sku === barcode || p.internal_code === barcode);
        
        if (product) {
          addToCart(product);
          setSearch("");
        } else {
          // It might be a search query, just leave it there
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [search, products]);

  const addToCart = (product: Product) => {
    if (product.current_stock <= 0) {
      setError(`O produto ${product.name} está sem estoque.`);
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (existing.cart_quantity >= product.current_stock) {
          setError(`Estoque insuficiente para ${product.name}. Máximo: ${product.current_stock}`);
          return prev;
        }
        return prev.map(i => i.id === product.id ? { ...i, cart_quantity: i.cart_quantity + 1 } : i);
      }
      setError(null);
      return [...prev, { ...product, cart_quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = i.cart_quantity + delta;
        if (newQty > i.current_stock) {
          setError(`Estoque insuficiente. Máximo: ${i.current_stock}`);
          return i;
        }
        if (newQty < 1) return i;
        return { ...i, cart_quantity: newQty };
      }
      return i;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    setError(null);

    try {
      const totalAmount = cart.reduce((sum, item) => sum + (item.selling_price * item.cart_quantity), 0);
      
      const sale = await createSale({
        student_id: null, // Anonymous sale
        payment_method: paymentMethod,
        total_amount: totalAmount,
        status: "Pago"
      });

      for (const item of cart) {
        await createSaleItem({
          sale_id: sale.id,
          product_id: item.id,
          quantity: item.cart_quantity,
          unit_price: item.selling_price,
          total_price: item.selling_price * item.cart_quantity
        });

        // Baixar estoque
        const newStock = item.current_stock - item.cart_quantity;
        await updateProduct(item.id, { current_stock: newStock });
        
        await createInventoryTransaction({
          product_id: item.id,
          transaction_type: "OUT",
          quantity: item.cart_quantity,
          previous_stock: item.current_stock,
          new_stock: newStock,
          reason: `Venda PDV #${sale.id}`,
          reference_id: sale.id
        });
      }

      setSaleCompleted(true);
      // Wait 3 seconds and reset
      setTimeout(() => {
        setCart([]);
        setCheckoutModalOpen(false);
        setSaleCompleted(false);
        setSearch("");
      }, 3000);
      
    } catch (err) {
      setError("Erro ao processar a venda.");
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = search.length >= 2 
    ? products.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.barcode?.includes(search) || 
        p.sku?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const cartTotal = cart.reduce((sum, item) => sum + (item.selling_price * item.cart_quantity), 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.cart_quantity, 0);

  if (loading) return <div className="p-8 text-center text-slate-500">Iniciando Caixa...</div>;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-6rem)] gap-6 mx-auto max-w-7xl">
      
      {/* Lado Esquerdo - Catálogo e Busca */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Ponto de Venda</h1>
          <p className="text-sm text-slate-500">Bipe produtos ou busque pelo nome</p>
        </header>

        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-6 w-6 text-slate-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="block w-full pl-12 pr-4 py-5 border-2 border-slate-200 rounded-2xl text-lg bg-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition shadow-sm"
            placeholder="Bipe o código de barras ou digite o nome..."
            autoFocus
          />
        </div>

        <ErrorBanner message={error} />

        <div className="flex-1 overflow-y-auto">
          {search.length > 0 && search.length < 2 && (
            <p className="text-slate-500 text-center py-8">Digite pelo menos 2 caracteres para buscar.</p>
          )}
          
          {search.length >= 2 && filteredProducts.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p>Nenhum produto encontrado para "{search}"</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="card p-4 hover:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 transition text-left group flex flex-col h-full"
              >
                <div className="aspect-square w-full rounded-xl bg-slate-100 mb-3 flex items-center justify-center overflow-hidden border border-slate-100">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <Package className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 line-clamp-2 group-hover:text-blue-600 transition-colors">{p.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mb-2">{p.barcode || p.sku}</p>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="font-black text-slate-900">{formatCurrency(p.selling_price)}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.current_stock > 0 ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'}`}>
                    {p.current_stock} un.
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lado Direito - Carrinho */}
      <div className="w-full lg:w-[400px] xl:w-[450px] flex flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden shrink-0 h-full">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-black">Cupom Fiscal</h2>
          </div>
          <span className="bg-slate-800 text-slate-300 text-xs font-bold px-2 py-1 rounded-lg">
            {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'itens'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart className="w-16 h-16 mb-4 text-slate-200" />
              <p className="font-medium text-slate-500">O carrinho está vazio</p>
              <p className="text-sm mt-1 text-slate-400 text-center max-w-[200px]">Adicione produtos buscando ou bipando o código.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-slate-100 shrink-0 flex items-center justify-center overflow-hidden">
                    {item.photo_url ? (
                      <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate leading-tight">{item.name}</h4>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{formatCurrency(item.selling_price)} un.</div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-slate-600 transition"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="w-6 text-center font-bold text-sm text-slate-900">{item.cart_quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-slate-600 transition"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                      <span className="font-black text-slate-900">
                        {formatCurrency(item.selling_price * item.cart_quantity)}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => removeFromCart(item.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0 mt-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white p-6 border-t border-slate-200 shrink-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-end mb-6">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-sm">Total a Pagar</span>
            <span className="text-4xl font-black tracking-tighter text-blue-600">{formatCurrency(cartTotal)}</span>
          </div>
          
          <button 
            onClick={() => setCheckoutModalOpen(true)}
            disabled={cart.length === 0}
            className="w-full flex items-center justify-center gap-3 py-4 border border-transparent rounded-xl shadow-lg shadow-blue-600/20 text-lg font-black text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Finalizar Venda
          </button>
        </div>
      </div>

      <Modal open={checkoutModalOpen} onClose={() => {if (!processing && !saleCompleted) setCheckoutModalOpen(false)}} title="Finalizar Venda" size="md">
        {saleCompleted ? (
          <div className="py-12 text-center animate-in zoom-in fade-in duration-300">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">Venda Concluída!</h2>
            <p className="text-slate-500 text-lg">O estoque foi baixado automaticamente.</p>
            <p className="text-sm text-slate-400 mt-6">Preparando próximo caixa...</p>
          </div>
        ) : (
          <div className="py-4">
            <div className="text-center mb-8">
              <p className="text-slate-500 font-bold uppercase tracking-wider text-sm mb-1">Total a Pagar</p>
              <div className="text-5xl font-black tracking-tighter text-blue-600">{formatCurrency(cartTotal)}</div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-lg mb-4">Forma de Pagamento</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("PIX")}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${paymentMethod === 'PIX' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                >
                  <QrCode className="w-8 h-8 mb-2" />
                  <span className="font-bold">PIX</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CREDIT_CARD")}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${paymentMethod === 'CREDIT_CARD' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                >
                  <CreditCard className="w-8 h-8 mb-2" />
                  <span className="font-bold">Crédito</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("DEBIT_CARD")}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${paymentMethod === 'DEBIT_CARD' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                >
                  <CreditCard className="w-8 h-8 mb-2" />
                  <span className="font-bold">Débito</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CASH")}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition ${paymentMethod === 'CASH' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                >
                  <Banknote className="w-8 h-8 mb-2" />
                  <span className="font-bold">Dinheiro</span>
                </button>
              </div>

              {paymentMethod === "PIX" && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mt-6 text-center animate-in fade-in">
                  <div className="w-48 h-48 bg-white border-2 border-slate-200 rounded-xl mx-auto flex items-center justify-center mb-3">
                    <QrCode className="w-32 h-32 text-slate-800" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">Aguardando pagamento PIX...</p>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={() => setCheckoutModalOpen(false)} 
                className="btn btn-secondary"
                disabled={processing}
              >
                Voltar
              </button>
              <button 
                onClick={handleCheckout} 
                disabled={processing}
                className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 border-none px-8 shadow-lg shadow-emerald-600/20"
              >
                {processing ? "Processando..." : "Confirmar Recebimento"}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
