import React from 'react';
import { Product, MergedProduct, FlyerConfig } from '../types';
import { BookOpen, Tag, Phone, Globe, Mail, Landmark, Image as ImageIcon, ChevronRight, Sparkles, ExternalLink, Edit } from 'lucide-react';

interface FlyerDocumentProps {
  products: Product[];
  config: FlyerConfig;
  viewMode: 'interactive' | 'print';
  onEditProduct?: (productId: string) => void;
}

// Helper to group by brand and then merge products with identical images
export function groupAndMergeProducts(products: Product[]): Record<string, MergedProduct[]> {
  const groupedByBrand: Record<string, Product[]> = {};

  // 1. Group by Brand first
  products.forEach(p => {
    const brandName = p.marque ? p.marque.toUpperCase() : 'GÉNÉRIQUE';
    if (!groupedByBrand[brandName]) {
      groupedByBrand[brandName] = [];
    }
    groupedByBrand[brandName].push(p);
  });

  const mergedByBrand: Record<string, MergedProduct[]> = {};

  // 2. Within each brand, merge products sharing identical photo / image url, manufacturer reference, or designation
  Object.keys(groupedByBrand).forEach(brand => {
    const brandProducts = groupedByBrand[brand];
    const imageGroups: Record<string, Product[]> = {};

    brandProducts.forEach(p => {
      let key = p.id;
      
      // Merge by real HTTP image URL first
      if (p.imageUrl && p.imageUrl.trim() !== "" && p.imageUrl.startsWith("http") && !p.imageUrl.startsWith("data:image")) {
        key = `img-${p.imageUrl.trim()}`;
      } else if (p.refFabricant && p.refFabricant.trim() !== "") {
        key = `mfg-${p.refFabricant.trim().toLowerCase()}`;
      } else if (p.designation && p.designation.trim() !== "") {
        key = `desig-${p.designation.trim().toLowerCase()}`;
      }
      
      if (!imageGroups[key]) {
        imageGroups[key] = [];
      }
      imageGroups[key].push(p);
    });

    mergedByBrand[brand] = Object.entries(imageGroups).map(([imgKey, items], index) => {
      const firstItem = items[0];
      
      // Determine common title/designation by finding standard patterns 
      // or we just use the first item's designation
      let commonDesignation = firstItem.designation;
      
      // If there are multiple items merged, we can clean up the common title 
      // (e.g. if they have size differences like "Casque orange" vs "Casque bleu", 
      // we can try to show root name, or simply use the first plus general variants tag)
      if (items.length > 1) {
        // Find common prefix if any, or just use the first item's name
        const prefix = findCommonPrefix(items.map(it => it.designation));
        if (prefix && prefix.length > 5) {
          commonDesignation = prefix.trim().replace(/[-–,]+$/, '');
        }
      }

      return {
        id: `merged-${brand}-${index}-${Date.now()}`,
        marque: brand,
        categorie: firstItem.categorie || 'Fournitures Générales',
        imageUrl: firstItem.imageUrl || '',
        description: firstItem.description || `Matériel industriel haute-fidélité de marque ${brand}. Conçu pour les professionnels les plus exigeants de la filière.`,
        commonDesignation,
        variants: items.map(it => ({
          id: it.id,
          reference: it.reference,
          refFabricant: it.refFabricant,
          designation: it.designation,
          prix: it.prix
        }))
      };
    });
  });

  return mergedByBrand;
}

// Find common prefix in an array of strings
function findCommonPrefix(strings: string[]): string {
  if (!strings || strings.length === 0) return '';
  let sorted = strings.concat().sort();
  let a = sorted[0];
  let b = sorted[sorted.length - 1];
  let L = a.length;
  let i = 0;
  while (i < L && a.charAt(i) === b.charAt(i)) {
    i++;
  }
  return a.substring(0, i);
}

export function FlyerDocument({ products, config, viewMode, onEditProduct }: FlyerDocumentProps) {
  const mergedData = groupAndMergeProducts(products);
  const sortedBrands = Object.keys(mergedData).sort();

  const brandColor = config.brandColor || "#1e3a8a";
  const { allPages, brandStartPages } = React.useMemo(() => {
    let globalPageNum = 1;
    const pagesList: Array<{
      type: 'cover' | 'sommaire' | 'brand';
      brandName?: string;
      brandPageNum?: number;
      isLastPageOfBrand?: boolean;
      products?: MergedProduct[];
      globalPageNum: number;
    }> = [];

    // 1. Cover Page
    if (config.showCover) {
      pagesList.push({
        type: 'cover',
        globalPageNum: globalPageNum++
      });
    }

    // 2. Sommaire Page
    const showSommaire = viewMode === 'print' || products.length > 5;
    if (showSommaire) {
      pagesList.push({
        type: 'sommaire',
        globalPageNum: globalPageNum++
      });
    }

    const startPages: Record<string, number> = {};

    // 3. Brand Pages
    sortedBrands.forEach((brand) => {
      startPages[brand] = globalPageNum;
      const brandProducts = mergedData[brand] || [];

      let currentPageProducts: MergedProduct[] = [];
      let currentPageUsedHeight = 45; // Start with 45mm header offset on brand page 1
      let brandPageNum = 1;

      brandProducts.forEach((p) => {
        const numVariants = p.variants.length;
        // Precise height in mm including cards, borders, margins
        const cardHeight = 35 + (numVariants * 7.5);

        const maxBudgetForCurrentPage = brandPageNum === 1 ? 232 : 242; // Leave a safe container margin for and 15mm page borders

        if (currentPageUsedHeight + cardHeight > maxBudgetForCurrentPage && currentPageProducts.length > 0) {
          // Push current completed page
          pagesList.push({
            type: 'brand',
            brandName: brand,
            brandPageNum,
            isLastPageOfBrand: false,
            products: currentPageProducts,
            globalPageNum: globalPageNum++
          });

          // Move to next page of the brand
          brandPageNum++;
          currentPageProducts = [p];
          currentPageUsedHeight = 25 + cardHeight; // Mini brand header for subsequent pages starts at 25mm offset
        } else {
          currentPageProducts.push(p);
          currentPageUsedHeight += cardHeight;
        }
      });

      // Commit last page
      if (currentPageProducts.length > 0) {
        pagesList.push({
          type: 'brand',
          brandName: brand,
          brandPageNum,
          isLastPageOfBrand: true,
          products: currentPageProducts,
          globalPageNum: globalPageNum++
        });
      }
    });

    return { allPages: pagesList, brandStartPages: startPages };
  }, [sortedBrands, mergedData, config.showCover, viewMode, products.length]);

  return (
    <div 
      id="flyer-document-rendering"
      className={`w-full flex flex-col items-center ${viewMode === 'print' ? 'bg-slate-200 py-10 print:py-0 print:bg-white' : ''}`}
    >
      <div 
        id="document-canvas"
        className={`w-full bg-white text-slate-800 font-sans shadow-lg transition-all duration-300 ${
          viewMode === 'print' 
            ? 'w-[210mm] min-h-[297mm] p-0 border border-slate-200 print:p-0 print:border-none print:shadow-none print:w-full print:min-h-0' 
            : 'rounded-xl p-5 md:p-8 max-w-5xl'
        }`}
      >
        
        {/* VIEW MODE: PRINT (PRE-PAGINATED CHUNKED A4 PAGES) */}
        {viewMode === 'print' && (
          <div className="flex flex-col gap-10 w-full print:gap-0">
            {allPages.map((page) => {
              const totalPages = allPages.length;

              if (page.type === 'cover') {
                return (
                  <div 
                    key={`cover-page-sheet-${page.globalPageNum}`}
                    id="cover-page-sheet" 
                    className="cover-sheet flex flex-col justify-between h-[295mm] w-full p-[15mm] border-b-2 border-slate-200 mb-10 pb-10 print:mb-0 print:pb-0 page-break-after box-border bg-white"
                  >
                    {/* Cover Header */}
                    <div className="flex justify-between items-center pb-5 border-b-4" style={{ borderColor: brandColor }}>
                      <div className="flex items-center gap-3">
                        {config.companyLogoUrl ? (
                          <img src={config.companyLogoUrl} alt="Logo" className="h-10 object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex items-center gap-1.5 font-bold text-lg tracking-tight">
                            <span className="p-1 px-2 rounded-md text-white font-black text-sm" style={{ backgroundColor: brandColor }}>M</span>
                            <span>MABÉO</span>
                          </div>
                        )}
                        <span className="text-xs text-slate-400 font-mono tracking-wider border-l border-slate-300 pl-3">SÉLECTION PROFESSIONNELLE</span>
                      </div>
                    </div>

                    {/* Cover Middle */}
                    <div className="my-auto flex flex-col gap-6 py-10">
                      <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">OFFRE PROMOTIONNELLE EXCLUSIVE</span>
                      <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 leading-none" style={{ color: brandColor }}>
                        {config.title || "OFFRES DE SAISON"}
                      </h1>
                      <p className="text-xl text-slate-650 font-normal leading-relaxed max-w-2xl">
                        {config.subtitle || "Découvrez nos outils, consommables et équipements de protection individuelle d'un niveau professionnel au meilleur tarif."}
                      </p>

                      {/* Decorative block */}
                      <div className="h-2 w-32 rounded" style={{ backgroundColor: brandColor }}></div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-10 max-w-xl bg-slate-50 p-5 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-xs text-slate-400 uppercase block font-medium">Fournisseurs</span>
                          <span className="text-lg font-bold text-slate-800 mt-1 block">{sortedBrands.length} Marques</span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 uppercase block font-medium">Articles</span>
                          <span className="text-lg font-bold text-slate-800 mt-1 block">{products.length} Mises en avant</span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 uppercase block font-medium">Date de validité</span>
                          <span className="text-sm font-bold text-amber-800 mt-1 block whitespace-normal leading-tight break-words">{config.date || "Validité Immédiate"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Cover Footer */}
                    <div className="pt-5 border-t border-slate-200 flex justify-between items-center text-xs text-slate-400">
                      <div>
                        <p className="font-semibold text-slate-600 font-sans text-[11px]">Distribué par votre partenaire spécialiste industriel</p>
                        <div className="mt-1 flex gap-4 text-[10px] text-slate-500 font-sans">
                          <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> mabeo-industries.com</span>
                          <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Sélection professionnelle</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-mono tracking-wider block text-slate-400">CATALOGUE SÉLECTION</span>
                        <span className="font-mono text-[9px] text-slate-400 mt-0.5 block">Page {page.globalPageNum} / {totalPages}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (page.type === 'sommaire') {
                return (
                  <div 
                    key={`sommaire-page-sheet-${page.globalPageNum}`}
                    id="sommaire-sheet" 
                    className="sommaire-section flex flex-col justify-between h-[295mm] w-full p-[15mm] border-b-2 border-slate-200 mb-10 pb-8 page-break-after box-border bg-white"
                  >
                    {/* Header Mini */}
                    <div className="flex justify-between items-center text-xs text-slate-400 pb-3 border-b border-slate-100 shrink-0">
                      <span className="font-semibold uppercase" style={{ color: brandColor }}>{config.headerText || "SÉLECTION PROFESSIONNELLE MABÉO"}</span>
                      <span className="font-mono">{config.date}</span>
                    </div>

                    <div className="my-auto py-5 flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-6 shrink-0">
                        <BookOpen className="w-5 h-5" style={{ color: brandColor }} />
                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sommaire du Catalogue</h2>
                      </div>
                      <p className="text-xs text-slate-500 mb-8 max-w-xl shrink-0 leading-relaxed">
                        Retrouvez ci-dessous l'index des marques sélectionnées pour cette campagne de promotion professionnelle et leurs pages de présentation de fiches produits respectives.
                      </p>

                      {/* Dynamic Table of Contents List */}
                      <div id="toc-grid" className="grid grid-cols-2 gap-x-12 gap-y-4 max-w-4xl">
                        {sortedBrands.map((brand, i) => {
                          const totalRefs = mergedData[brand].reduce((sum, item) => sum + item.variants.length, 0);
                          const startPage = brandStartPages[brand];

                          return (
                            <div 
                              key={brand}
                              className="flex items-center justify-between text-sm py-1 border-b border-dashed border-slate-200"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 font-mono text-xs w-5">{(i + 1).toString().padStart(2, '0')}.</span>
                                <span className="font-bold text-slate-800 uppercase">{brand}</span>
                              </div>
                              <div className="flex items-center gap-3 font-mono text-xs">
                                <span className="text-slate-400 text-[10px] mr-2">{totalRefs} {totalRefs > 1 ? 'articles' : 'article'}</span>
                                <span className="font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 min-w-[65px] text-center">
                                  Page {startPage}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer Mini */}
                    <div className="text-center text-[10px] text-slate-400 pt-3 border-t border-slate-100 flex justify-between shrink-0">
                      <span className="truncate max-w-[300px]">{config.footerText || "Sélection exclusive Mabéo"}</span>
                      <span className="font-mono">Page {page.globalPageNum} / {totalPages}</span>
                    </div>
                  </div>
                );
              }

              if (page.type === 'brand') {
                const brand = page.brandName!;
                const brandPageNum = page.brandPageNum!;
                const brandProducts = page.products || [];

                return (
                  <div 
                    key={`brand-${brand}-page-${brandPageNum}`}
                    id={`brand-${brand}-page-${brandPageNum}`}
                    className="brand-page-sheet flex flex-col justify-between h-[295mm] w-full p-[15mm] border-b-2 border-slate-200 mb-10 pb-8 page-break-after box-border bg-white"
                  >
                    {/* Brand Section Header */}
                    <div className="flex justify-between items-center text-xs text-slate-400 pb-3 border-b border-slate-100 mb-4 shrink-0">
                      <span className="font-semibold uppercase" style={{ color: brandColor }}>{config.headerText || "SÉLECTION PRO - MABÉO"}</span>
                      <span className="font-mono uppercase">SECTION {brand} {brandPageNum > 1 ? `(Suite ${brandPageNum})` : ''}</span>
                    </div>

                    <div className="flex-1 flex flex-col gap-4 justify-start w-full">
                      {/* Big Banner on Brand Page 1, small alert sub-banner on subsequent pages */}
                      {brandPageNum === 1 ? (
                        <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-sm mb-1 shrink-0">
                          <div>
                            <span className="text-[9px] uppercase font-mono tracking-widest text-amber-400 block mb-0.5">MARQUE DISTRIBUÉE</span>
                            <h2 className="text-xl font-black tracking-tight uppercase flex items-center gap-2">
                              {brand}
                              <span className="text-[10px] font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">
                                {mergedData[brand].length} {mergedData[brand].length > 1 ? 'fiches de produits' : 'fiche de produit'}
                              </span>
                            </h2>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 py-0.5 px-2 bg-slate-800 rounded-lg">PRODUITS PRO</span>
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg flex items-center justify-between shadow-xs mb-1 shrink-0">
                          <h2 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                            <span>{brand}</span>
                            <span className="text-[8px] font-medium text-slate-500 bg-slate-200 px-1.5 py-0.2 rounded font-mono">
                              Suite (Page {brandPageNum})
                            </span>
                          </h2>
                          <span className="font-mono text-[9px] text-slate-400">PRODUITS SÉLECTIONNÉS</span>
                        </div>
                      )}

                      {/* Products Grid in Print Sheet - always 1 column to avoid column resizing overflows/cuts */}
                      <div className="grid grid-cols-1 gap-5">
                        {brandProducts.map((p) => {
                          const hasVariants = p.variants.length > 1;

                          return (
                            <div 
                              key={p.id}
                              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex gap-5 items-stretch overflow-hidden relative page-break-inside-avoid"
                              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                            >
                              {/* Image Area */}
                              <div className="w-[110px] h-[110px] bg-slate-50 border border-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative">
                                {p.imageUrl ? (
                                  <img 
                                    src={p.imageUrl} 
                                    alt={p.commonDesignation} 
                                    className="w-full h-full object-contain p-2 mix-blend-multiply"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="text-center p-2 text-slate-350">
                                    <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-60" />
                                    <span className="text-[8px] font-mono block">Image</span>
                                  </div>
                                )}
                                <span className="absolute top-1 left-1 bg-slate-800/90 text-white text-[8px] font-semibold px-1.5 py-0.2 rounded font-mono max-w-[85px] truncate">
                                  {p.categorie || 'SÉLECTION'}
                                </span>
                              </div>

                              {/* Details Area */}
                              <div className="flex flex-col justify-between flex-1 gap-2.5">
                                <div className="flex flex-col gap-1">
                                  <h3 className="font-bold text-slate-900 tracking-tight text-sm leading-tight">
                                    {p.commonDesignation}
                                  </h3>
                                  <p className="text-[11px] text-slate-550 leading-normal font-normal line-clamp-2">
                                    {p.description}
                                  </p>
                                </div>

                                {/* Variants table - auto-layout table to ensure prices/references NEVER overlap */}
                                <div className="mt-auto">
                                  <div className="border border-slate-150 rounded-lg overflow-hidden bg-slate-50/50">
                                    {(() => {
                                      const anyHasRefFabricant = p.variants.some(v => v.refFabricant);
                                      return (
                                        <table className="w-full text-left border-collapse text-[10px] table-auto">
                                          <thead>
                                            <tr className="bg-slate-150 text-slate-600 font-semibold border-b border-slate-200">
                                              <th className="px-2 py-1 text-slate-500 font-mono whitespace-nowrap min-w-[70px]">Réf. Mabéo</th>
                                              {anyHasRefFabricant && <th className="px-2 py-1 text-slate-500 font-mono whitespace-nowrap min-w-[70px]">Réf. Fabricant</th>}
                                              {hasVariants && <th className="px-2 py-1 text-slate-500">Modèle / Spécifications</th>}
                                              <th className="px-2 py-1 text-right text-slate-500 whitespace-nowrap min-w-[65px] font-sans">Prix H.T.</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {p.variants.map((v, vIndex) => (
                                              <tr 
                                                key={v.reference + vIndex} 
                                                className={`group/row border-b border-slate-100 hover:bg-amber-50/70 transition-colors last:border-b-0 ${vIndex % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                                              >
                                                <td className="px-2 py-1 font-mono font-semibold text-slate-800 select-all whitespace-nowrap">
                                                  {v.reference}
                                                </td>
                                                {anyHasRefFabricant && (
                                                  <td className="px-2 py-1 font-mono text-slate-500 select-all whitespace-nowrap">
                                                    {v.refFabricant || <span className="opacity-40">-</span>}
                                                  </td>
                                                )}
                                                {hasVariants && (
                                                  <td className="px-2 py-1 text-slate-600 font-normal max-w-[150px] sm:max-w-[200px] md:max-w-[250px] truncate" title={v.designation}>
                                                    {v.designation.replace(new RegExp(`^${p.commonDesignation}`, 'i'), '').replace(/^[-–, ]+/, '') || v.designation || 'Standard'}
                                                  </td>
                                                )}
                                                <td className="px-2 py-1 text-right font-black text-slate-900 tabular-nums whitespace-nowrap text-xs">
                                                  {typeof v.prix === 'number' ? `${v.prix.toFixed(2)} €` : v.prix || "Sur devis"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {/* Footer link */}
                                <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5">
                                  <span className="font-mono">Fiche : {p.variants[0].reference}</span>
                                  <a 
                                    href={`https://www.mabeo-industries.com/fr/recherche?q=${encodeURIComponent(p.variants[0].reference)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-500 hover:text-slate-850 flex items-center gap-1 font-medium select-none"
                                  >
                                    Commander en ligne
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center text-[10px] text-slate-400 mt-4 pt-3 border-t border-slate-100 flex justify-between shrink-0 font-sans">
                      <span className="truncate max-w-[300px]">{config.footerText || "Photos non contractuelles. Offre réservée aux professionnels."}</span>
                      <span className="font-mono font-medium">Page {page.globalPageNum} / {totalPages}</span>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}

        {/* VIEW MODE: INTERACTIVE (FLUID WEB VIEW) */}
        {viewMode === 'interactive' && (
          <div className="flex flex-col gap-10">
            {/* DYNAMIC SOMMAIRE / TABLE OF CONTENTS (In Web View) */}
            {products.length > 5 && (
              <div id="sommaire-interactive-view" className="sommaire-section flex flex-col justify-between pb-8 border-b border-slate-200 box-border bg-white rounded-xl p-5 md:p-8 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-6">
                  <BookOpen className="w-5 h-5 text-amber-600" style={{ color: brandColor }} />
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sommaire Dynamique du Catalogue</h2>
                </div>
                <p className="text-xs text-slate-500 mb-6 max-w-xl">
                  Retrouvez ci-dessous la liste des marques proposées. Cliquez sur une marque pour faire défiler automatiquement et consulter ses produits.
                </p>
                <div id="toc-grid-interactive" className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 max-w-4xl">
                  {sortedBrands.map((brand, i) => {
                    const totalRefs = mergedData[brand].reduce((sum, item) => sum + item.variants.length, 0);
                    return (
                      <a 
                        key={brand}
                        href={`#brand-section-${brand}`}
                        className="group flex items-center justify-between text-sm py-1 border-b border-dashed border-slate-200 hover:border-slate-400 hover:text-amber-600 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-xs w-5">{(i + 1).toString().padStart(2, '0')}.</span>
                          <span className="font-semibold text-slate-800 group-hover:text-amber-700 transition-colors uppercase">{brand}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
                          <span>{totalRefs} {totalRefs > 1 ? 'articles' : 'article'}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BRANDS / PRODUCTS DIRECTORY */}
            <div id="directory-content" className="flex flex-col gap-10">
              {sortedBrands.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-xl border border-slate-200">
                  <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Votre catalogue est actuellement vide.</p>
                  <p className="text-xs text-slate-400 mt-1">Importez un fichier Excel ou injectez des données de démonstration pour commencer.</p>
                </div>
              ) : (
                sortedBrands.map((brand, brandIndex) => {
                  const mergedProducts = mergedData[brand];

                  return (
                    <div 
                      key={brand}
                      id={`brand-section-${brand}`}
                      className="brand-section scroll-mt-6 flex flex-col justify-between box-border bg-white"
                    >
                      {/* Brand Section Header */}
                      <div className="flex justify-between items-center text-xs text-slate-400 pb-3 border-b border-slate-100 mb-6">
                        <span className="font-semibold uppercase" style={{ color: brandColor }}>{config.headerText || "SÉLECTION PRO - MABÉO"}</span>
                        <span className="font-mono uppercase">SECTION {brand}</span>
                      </div>

                      <div className="flex flex-col gap-6 w-full">
                        {/* Brand Banner Title */}
                        <div className="bg-slate-900 text-white p-5 rounded-xl flex items-center justify-between shadow-sm">
                          <div>
                            <span className="text-[10px] uppercase font-mono tracking-widest text-amber-400 block mb-1">MARQUE DISTRIBUÉE</span>
                            <h2 className="text-2xl font-black tracking-tight uppercase flex items-center gap-2">
                              {brand}
                              <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">
                                {mergedProducts.length} {mergedProducts.length > 1 ? 'fiches de produits' : 'fiche de produit'}
                              </span>
                            </h2>
                          </div>
                          <span className="font-mono text-xs text-slate-400 py-1 px-3 bg-slate-800 rounded-lg">PRODUITS PRO</span>
                        </div>

                        {/* Products Grid / Template Layout */}
                        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                          {mergedProducts.map((p) => {
                            const hasVariants = p.variants.length > 1;

                            return (
                              <div 
                                key={p.id}
                                id={`product-card-${p.id}`}
                                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-5 items-stretch overflow-hidden relative"
                              >
                                {/* Product Image Area */}
                                <div className="w-full md:w-2/5 aspect-square bg-slate-50 border border-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative group min-h-[140px]">
                                  {p.imageUrl ? (
                                    <img 
                                      src={p.imageUrl} 
                                      alt={p.commonDesignation} 
                                      className="w-full h-full object-contain p-2 mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="text-center p-4 text-slate-350">
                                      <ImageIcon className="w-8 h-8 mx-auto mb-1.5 opacity-60" />
                                      <span className="text-[10px] font-mono block">Image manquante</span>
                                    </div>
                                  )}
                                  <span className="absolute top-2 left-2 bg-slate-800/95 text-white text-[9px] font-semibold px-2 py-0.5 rounded hover:opacity-100 tracking-wider shadow-sm uppercase font-mono">
                                    {p.categorie.substring(0, 18)}{p.categorie.length > 18 ? '...' : ''}
                                  </span>
                                </div>

                                {/* Product Details Area */}
                                <div className="flex flex-col justify-between flex-1 gap-3.5">
                                  {/* Title & Description */}
                                  <div className="flex flex-col gap-1.5">
                                    <h3 className="font-bold text-slate-900 tracking-tight text-base leading-snug">
                                      {p.commonDesignation}
                                    </h3>
                                    <p className="text-xs text-slate-500 leading-relaxed font-normal line-clamp-3">
                                      {p.description}
                                    </p>
                                  </div>

                                  {/* Variants table */}
                                  <div className="mt-auto">
                                    <div className="text-[10px] text-slate-400 font-semibold mb-1.5 uppercase tracking-wider">
                                      {hasVariants ? "RÉFÉRENCES ET DETAILS ASSOCIES" : "FICHE TECHNIQUE ET TARIF"}
                                    </div>
                                    <div className="border border-slate-150 rounded-lg overflow-hidden bg-slate-50/50">
                                      {(() => {
                                        const anyHasRefFabricant = p.variants.some(v => v.refFabricant);
                                        return (
                                          <table className="w-full text-left border-collapse text-[10px] sm:text-[11px] table-auto">
                                            <thead>
                                              <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-150">
                                                <th className="px-2 py-1 text-slate-500 font-mono whitespace-nowrap min-w-[70px]">Réf. Mabéo</th>
                                                {anyHasRefFabricant && <th className="px-2 py-1 text-slate-500 font-mono whitespace-nowrap min-w-[70px]">Réf. Fabricant</th>}
                                                {hasVariants && <th className="px-2 py-1 text-slate-500">Modèle</th>}
                                                <th className="px-2 py-1 text-right text-slate-500 whitespace-nowrap min-w-[65px] font-sans">Prix H.T.</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {p.variants.map((v, vIndex) => (
                                                <tr 
                                                  key={v.reference + vIndex} 
                                                  onClick={() => {
                                                    if (onEditProduct && v.id) {
                                                      onEditProduct(v.id);
                                                    }
                                                  }}
                                                  className={`group/row border-b border-slate-100 hover:bg-amber-50/70 transition-colors last:border-b-0 ${vIndex % 2 === 1 ? 'bg-slate-50/30' : ''} ${onEditProduct ? 'cursor-pointer' : ''}`}
                                                  title={onEditProduct ? "Cliquez pour modifier directement cet article" : undefined}
                                                >
                                                  <td className="px-2 py-1 font-mono font-medium text-slate-800 select-all whitespace-nowrap" title={v.reference}>
                                                    {v.reference}
                                                  </td>
                                                  {anyHasRefFabricant && (
                                                    <td className="px-2 py-1 font-mono text-slate-500 select-all whitespace-nowrap" title={v.refFabricant || ''}>
                                                      {v.refFabricant || <span className="opacity-40">-</span>}
                                                    </td>
                                                  )}
                                                  {hasVariants && (
                                                    <td className="px-2 py-1 text-slate-600 font-normal max-w-[120px] sm:max-w-[180px] break-words truncate" title={v.designation}>
                                                      {v.designation.replace(new RegExp(`^${p.commonDesignation}`, 'i'), '').replace(/^[-–, ]+/, '') || v.designation || 'Standard'}
                                                    </td>
                                                  )}
                                                  <td className="px-2 py-1 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1">
                                                      <span>{typeof v.prix === 'number' ? `${v.prix.toFixed(2)} €` : v.prix || "Sur devis"}</span>
                                                      {onEditProduct && v.id && (
                                                        <Edit className="w-3 h-3 text-amber-600 opacity-0 group-hover/row:opacity-100 transition-opacity print:hidden shrink-0 ml-1" />
                                                      )}
                                                    </div>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  {/* Footer links to online store */}
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                                    <span className="font-mono select-none">Fiche : {p.variants[0].reference}</span>
                                    <div className="flex items-center gap-3">
                                      {onEditProduct && p.variants[0].id && (
                                        <button 
                                          type="button"
                                          onClick={() => onEditProduct(p.variants[0].id!)}
                                          className="print:hidden text-amber-600 hover:text-amber-800 flex items-center gap-1 font-semibold transition-colors cursor-pointer border-none bg-transparent"
                                          title="Modifier directement cet article"
                                        >
                                          <Edit className="w-3 h-3" />
                                          Modifier
                                        </button>
                                      )}
                                      <a 
                                        href={`https://www.mabeo-industries.com/fr/recherche?q=${encodeURIComponent(p.variants[0].reference)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-600 hover:text-slate-850 flex items-center gap-1 font-medium transition-colors"
                                      >
                                        Commander en ligne
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>

                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Brand Section Footer */}
                      <div className="text-center text-[10px] text-slate-400 mt-6 pt-3 border-t border-slate-100 flex justify-between">
                        <span className="truncate max-w-[200px]">{config.footerText || "Photos non contractuelles"}</span>
                        <span>Fiche(s) de la section {brand}</span>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
