import React, { useState, useEffect } from 'react';
import { ExcelUploader } from './components/ExcelUploader';
import { ProductEditor } from './components/ProductEditor';
import { FlyerSettingsPanel } from './components/FlyerSettingsPanel';
import { FlyerDocument } from './components/FlyerDocument';
import { DEMO_PRODUCTS } from './data/demoProducts';
import { Product, FlyerConfig } from './types';
import { 
  FileSpreadsheet, FileText, Download, Printer, Eye, Laptop, 
  Smartphone, Sparkles, Settings, HelpCircle, CheckCircle2, ChevronRight, ArrowUpRight,
  RefreshCw
} from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'editor' | 'settings'>('upload');
  const [previewMode, setPreviewMode] = useState<'interactive' | 'print'>('interactive');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [initialEditingId, setInitialEditingId] = useState<string | null>(null);

  const handleEditProduct = (productId: string) => {
    setActiveTab('editor');
    setInitialEditingId(productId);
  };
  
  // Scraper Queue States
  const [isScrapingBatch, setIsScrapingBatch] = useState(false);
  const [scrapeIndex, setScrapeIndex] = useState(0);
  const [scrapeDelay, setScrapeDelay] = useState<number>(3000); // Default to a safe 3-second pacing to prevent 429 quota exhaustion

  // Default configuration
  const [config, setConfig] = useState<FlyerConfig>({
    title: 'OFFRES PROMOTIONNELLES DE SAISON',
    subtitle: 'La sélection premium outillage, protection et consommables pour l\'industrie.',
    date: 'Offre valable du 1er Juin au 31 Juillet 2026',
    brandColor: '#eab308', // Amber / Yellow Mabéo
    headerText: 'SELECTION EXCLUSIVE - MABEO INDUSTRIES',
    footerText: 'Prix nets Hors Taxes valables jusqu\'à épuisement des stocks. Photos non contractuelles. Ne pas jeter sur la voie publique.',
    showCover: true,
    sortByMarque: true,
    groupByCategory: false
  });

  // Download a skeleton CSV template for quick Excel writing
  const handleDownloadTemplate = () => {
    const csvContent = "Référence Mabéo;Désignation;Prix H.T.;Catégorie;Fichier;Référence Fabricant;Marque\n" +
      "1482051;Échelle télescopique aluminium 3,80 m;289.00;Travail en hauteur;;1504-008;TUBESCA-COMABI\n" +
      "4910245;Transpalette manuel renforcé 2,5 Tonnes;399.00;Manutention;;GS-25S4;PRAMAC\n" +
      "8829402;Aspirateur eau et poussière NT 30/1 Tact L;485.00;Nettoyage Aspiration;;NT-30-1-TL;KÄRCHER\n" +
      "5510291;Perceuse à colonne d'atelier Syd 20;2450.00;Machine atelier;;SYD-20P;SYDERIC\n" +
      "7012948;Servante d'atelier Roll 6 tiroirs rouge;429.00;Rangement;;ROLL.6M3;FACOM";
    
    // Add UTF-8 BOM to prevent Excel display encoding glitches when double-clicking CSV templates
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modele_importation_mabeo.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Callback when Excel items are successfully loaded
  const handleProductsLoaded = (loadedProducts: Product[]) => {
    setProducts(loadedProducts);
    setActiveTab('editor'); // Auto transition to table editor to view rows
  };

  const handleLoadDemo = () => {
    setProducts([...DEMO_PRODUCTS]);
    setActiveTab('editor');
  };

  // Add a product manually
  const handleAddProduct = (newProd: Product) => {
    setProducts([newProd, ...products]);
  };

  // Update a single row item
  const handleUpdateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(products.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Delete a product from state
  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  // Launch single scraper routine for one reference
  const handleSingleScrape = async (id: string) => {
    const target = products.find(p => p.id === id);
    if (!target) return;

    // Set item status to searching
    setProducts(prev => prev.map(p => p.id === id ? { ...p, searchStatus: 'searching' } : p));

    try {
      const idx = products.findIndex(p => p.id === id);
      const res = await fetch('/api/enrich-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: target.reference,
          refFabricant: target.refFabricant,
          marque: target.marque,
          designation: target.designation,
          categorie: target.categorie,
          prix: target.prix,
          index: idx
        })
      });

      const outcome = await res.json();
      if (outcome.success) {
        setProducts(prev => prev.map(p => p.id === id ? {
          ...p,
          designation: outcome.designation,
          imageUrl: outcome.imageUrl,
          description: outcome.description,
          categorie: outcome.categorie,
          searchStatus: 'success'
        }: p));
      } else {
        setProducts(prev => prev.map(p => p.id === id ? {
          ...p,
          imageUrl: outcome.imageUrl || p.imageUrl,
          description: outcome.description || p.description,
          searchStatus: 'failed'
        }: p));
      }
    } catch (err) {
      setProducts(prev => prev.map(p => p.id === id ? { ...p, searchStatus: 'failed' } : p));
    }
  };

  // Run the batch background queue scheduler
  const handleBatchScrape = () => {
    if (isScrapingBatch || products.length === 0) return;
    setIsScrapingBatch(true);
    setScrapeIndex(0);
  };

  // Queue background scheduler loop
  useEffect(() => {
    if (!isScrapingBatch) return;

    if (scrapeIndex >= products.length) {
      setIsScrapingBatch(false);
      return;
    }

    const currentItem = products[scrapeIndex];
    if (currentItem.searchStatus === 'success') {
      // Already scraped successfully, skip immediately to speed up
      setScrapeIndex(prev => prev + 1);
      return;
    }

    const scrapeCurrent = async () => {
      // Set state to searching
      setProducts(prev => prev.map(p => p.id === currentItem.id ? { ...p, searchStatus: 'searching' } : p));

      try {
        const res = await fetch('/api/enrich-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: currentItem.reference,
            refFabricant: currentItem.refFabricant,
            marque: currentItem.marque,
            designation: currentItem.designation,
            categorie: currentItem.categorie,
            prix: currentItem.prix,
            index: scrapeIndex
          })
        });

        const outcome = await res.json();
        setProducts(prev => prev.map(p => p.id === currentItem.id ? {
          ...p,
          designation: outcome.designation,
          imageUrl: outcome.imageUrl,
          description: outcome.description,
          categorie: outcome.categorie,
          searchStatus: outcome.success ? 'success' : 'failed'
        }: p));

      } catch (err) {
        setProducts(prev => prev.map(p => p.id === currentItem.id ? { ...p, searchStatus: 'failed' } : p));
      } finally {
        // Increment the queue pointer with customized delay/pacing interval
        setTimeout(() => {
          setScrapeIndex(prev => prev + 1);
        }, scrapeDelay);
      }
    };

    scrapeCurrent();
  }, [isScrapingBatch, scrapeIndex]);

// Helper to safely parse oklch color string and convert to standard rgb to avoid html2canvas crash
function parseOklchToRgb(oklchStr: string): string {
  try {
    const inner = oklchStr.replace(/oklch\((.*)\)/i, '$1').trim();
    const parts = inner.split('/');
    const colorParts = parts[0].trim().split(/\s+/);
    if (colorParts.length < 3) return 'rgb(120, 120, 120)';
    
    const L = parseFloat(colorParts[0]);
    const C = parseFloat(colorParts[1]);
    const H = parseFloat(colorParts[2]);
    const A = parts[1] ? parseFloat(parts[1]) : 1;
    
    if (isNaN(L) || isNaN(C)) return 'rgb(120, 120, 120)';

    let r = 120, g = 120, b = 120;

    if (C < 0.02 || isNaN(H)) {
      // Grayscale
      const val = Math.round(L * 255);
      r = g = b = val;
    } else {
      // Classify hue to rough RGB approximation
      if (H >= 45 && H < 110) {
        r = Math.round(L * 255);
        g = Math.round(L * 210);
        b = Math.round(L * 30);
      } else if (H >= 110 && H < 170) {
        r = Math.round(L * 30);
        g = Math.round(L * 230);
        b = Math.round(L * 100);
      } else if (H >= 170 && H < 290) {
        r = Math.round(L * 30);
        g = Math.round(L * 120);
        b = Math.round(L * 255);
      } else if (H >= 290 && H < 340) {
        r = Math.round(L * 230);
        g = Math.round(L * 50);
        b = Math.round(L * 230);
      } else {
        r = Math.round(L * 255);
        g = Math.round(L * 40);
        b = Math.round(L * 40);
      }
    }

    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    if (!isNaN(A) && A < 1) {
      return `rgba(${r}, ${g}, ${b}, ${A})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  } catch (error) {
    return 'rgb(120, 120, 120)';
  }
}

// Helper to safely parse oklab color string to avoid html2canvas crash
function parseOklabToRgb(oklabStr: string): string {
  try {
    const inner = oklabStr.replace(/oklab\((.*)\)/i, '$1').trim();
    const parts = inner.split('/');
    const colorParts = parts[0].trim().split(/\s+/);
    if (colorParts.length < 3) return 'rgb(120, 120, 120)';
    
    const L = parseFloat(colorParts[0]);
    const AVal = parts[1] ? parseFloat(parts[1]) : 1;

    if (isNaN(L)) return 'rgb(120, 120, 120)';

    // Simple lightness grayscale conversion
    let rgbVal = Math.round(L * 255);
    rgbVal = Math.max(0, Math.min(255, rgbVal));

    if (!isNaN(AVal) && AVal < 1) {
      return `rgba(${rgbVal}, ${rgbVal}, ${rgbVal}, ${AVal})`;
    }
    return `rgb(${rgbVal}, ${rgbVal}, ${rgbVal})`;
  } catch (error) {
    return 'rgb(120, 120, 120)';
  }
}

// Helper to parse and convert color-mix(in oklab, ...) or similar to standard CSS colors
function sanitizeColorMix(cssText: string): string {
  let result = cssText;
  let index = 0;
  while (true) {
    const startIdx = result.toLowerCase().indexOf('color-mix(', index);
    if (startIdx === -1) break;
    
    let parenCount = 1;
    let endIdx = -1;
    const startSearchingFrom = startIdx + 'color-mix('.length;
    for (let i = startSearchingFrom; i < result.length; i++) {
      if (result[i] === '(') parenCount++;
      else if (result[i] === ')') parenCount--;
      
      if (parenCount === 0) {
        endIdx = i;
        break;
      }
    }
    
    if (endIdx !== -1) {
      const fullMatch = result.substring(startIdx, endIdx + 1);
      let replacement = 'rgba(120, 120, 120, 0.5)';
      try {
        const inner = fullMatch.substring('color-mix('.length, fullMatch.length - 1).trim();
        // Inner format should be: in oklab, <color1> [pct], <color2> [pct]
        // Split commas, respecting nested functions/parentheses
        const parts: string[] = [];
        let currentPart = '';
        let nestedParen = 0;
        for (let i = 0; i < inner.length; i++) {
          const char = inner[i];
          if (char === '(') nestedParen++;
          else if (char === ')') nestedParen--;
          
          if (char === ',' && nestedParen === 0) {
            parts.push(currentPart.trim());
            currentPart = '';
          } else {
            currentPart += char;
          }
        }
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        
        if (parts.length >= 2) {
          let part1 = parts[0];
          // Strip "in <color-space>" from first part
          if (part1.toLowerCase().startsWith('in ')) {
            const lowerPart1 = part1.toLowerCase();
            const prefixes = ['in oklab', 'in oklch', 'in srgb', 'in hsl', 'in rgb', 'in xyz', 'in lab'];
            let foundPref = false;
            for (const pref of prefixes) {
              if (lowerPart1.startsWith(pref)) {
                part1 = part1.substring(pref.length).trim();
                foundPref = true;
                break;
              }
            }
            if (!foundPref) {
              const words = part1.split(/\s+/);
              if (words.length > 2) {
                part1 = words.slice(2).join(' ');
              }
            }
          }
          
          let part2 = parts[1].trim();
          
          // Function to parse weight % (e.g., "rgb(0,0,0) 30%")
          const parseColorWithPct = (partStr: string): { color: string; pct: number } => {
            const words = partStr.split(/\s+/);
            let pct = 1.0;
            let color = partStr;
            
            if (words.length > 1) {
              const lastWord = words[words.length - 1].trim();
              if (lastWord.endsWith('%')) {
                const val = parseFloat(lastWord.replace('%', ''));
                if (!isNaN(val)) {
                  pct = val / 100;
                  color = words.slice(0, words.length - 1).join(' ').trim();
                }
              }
            }
            return { color, pct };
          };
          
          const p1 = parseColorWithPct(part1);
          const p2 = parseColorWithPct(part2);
          
          let colorPart = p1.color;
          let alpha = p1.pct;
          
          if (p2.color.toLowerCase() === 'transparent') {
            colorPart = p1.color;
            alpha = p1.pct;
          } else if (p1.color.toLowerCase() === 'transparent') {
            colorPart = p2.color;
            alpha = p2.pct;
          } else {
            colorPart = p1.color;
            alpha = p1.pct;
          }
          
          // Convert nested colors
          if (colorPart.toLowerCase().startsWith('oklch(')) {
            colorPart = parseOklchToRgb(colorPart);
          } else if (colorPart.toLowerCase().startsWith('oklab(')) {
            colorPart = parseOklabToRgb(colorPart);
          }
          
          // Build equivalent RGBA / RGB color representation
          if (colorPart.startsWith('rgb(')) {
            const innerRgb = colorPart.replace(/rgb\((.*)\)/i, '$1').trim();
            const rgbValues = innerRgb.split(/[\s,]+/);
            if (rgbValues.length >= 3) {
              replacement = `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${alpha})`;
            } else {
              replacement = `rgba(120, 120, 120, ${alpha})`;
            }
          } else if (colorPart.startsWith('rgba(')) {
            const innerRgba = colorPart.replace(/rgba\((.*)\)/i, '$1').trim();
            const rgbaValues = innerRgba.split(/[\s,]+/);
            if (rgbaValues.length >= 3) {
              const origA = rgbaValues[3] ? parseFloat(rgbaValues[3]) : 1;
              replacement = `rgba(${rgbaValues[0]}, ${rgbaValues[1]}, ${rgbaValues[2]}, ${origA * alpha})`;
            } else {
              replacement = `rgba(120, 120, 120, ${alpha})`;
            }
          } else if (colorPart.startsWith('var(')) {
            const lowerVar = colorPart.toLowerCase();
            if (lowerVar.includes('amber') || lowerVar.includes('orange') || lowerVar.includes('yellow')) {
              replacement = `rgba(217, 119, 6, ${alpha})`;
            } else if (lowerVar.includes('slate') || lowerVar.includes('gray')) {
              replacement = `rgba(71, 85, 105, ${alpha})`;
            } else if (lowerVar.includes('blue') || lowerVar.includes('sky')) {
              replacement = `rgba(37, 99, 235, ${alpha})`;
            } else {
              replacement = `rgba(120, 120, 120, ${alpha})`;
            }
          } else {
            replacement = colorPart;
          }
        }
      } catch (e) {
        console.warn('Failed to parse color-mix:', fullMatch, e);
      }
      
      result = result.substring(0, startIdx) + replacement + result.substring(endIdx + 1);
      index = startIdx + replacement.length;
    } else {
      index = startSearchingFrom;
    }
  }
  return result;
}

// Helper to convert balanced parenthesis blocks for oklch and oklab to standard rgb values
function sanitizeColorFunctions(cssText: string): string {
  // First, convert any color-mix occurrences to safe colors
  let result = sanitizeColorMix(cssText);
  
  const targets = ['oklch', 'oklab'];
  for (const target of targets) {
    let index = 0;
    while (true) {
      const startIdx = result.toLowerCase().indexOf(target + '(', index);
      if (startIdx === -1) break;
      
      let parenCount = 1;
      let endIdx = -1;
      const startSearchingFrom = startIdx + target.length + 1;
      for (let i = startSearchingFrom; i < result.length; i++) {
        if (result[i] === '(') parenCount++;
        else if (result[i] === ')') parenCount--;
        
        if (parenCount === 0) {
          endIdx = i;
          break;
        }
      }
      
      if (endIdx !== -1) {
        const fullMatch = result.substring(startIdx, endIdx + 1);
        let replacement = 'rgb(120, 120, 120)';
        try {
          if (target === 'oklch') {
            replacement = parseOklchToRgb(fullMatch);
          } else {
            replacement = parseOklabToRgb(fullMatch);
          }
        } catch (e) {
          console.warn('Failed to parse color:', fullMatch, e);
        }
        result = result.substring(0, startIdx) + replacement + result.substring(endIdx + 1);
        index = startIdx + replacement.length;
      } else {
        index = startSearchingFrom;
      }
    }
  }
  return result;
}

  // Command to print/generate the flyer canvas as PDF
  const handlePrintFlyer = async () => {
    setIsGeneratingPDF(true);

    const originalPreviewMode = previewMode;
    if (previewMode !== 'print') {
      setPreviewMode('print');
      // Wait for React to re-render the cover page and table of contents
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    const canvasElement = document.getElementById('document-canvas');
    if (!canvasElement) {
      setPreviewMode(originalPreviewMode);
      setIsGeneratingPDF(false);
      return;
    }

    const originalGetComputedStyle = window.getComputedStyle;
    const originalIframeWindowDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    const originalSheetStyles = new Map<HTMLElement, string>();

    // Proxy the parent window's getComputedStyle
    window.getComputedStyle = function (elt: Element, pseudoElt?: string) {
      const style = originalGetComputedStyle.call(window, elt, pseudoElt);
      return new Proxy(style, {
        get(target: CSSStyleDeclaration, prop: string | symbol) {
          if (prop === 'getPropertyValue') {
            return function (propertyName: string) {
              const val = target.getPropertyValue(propertyName);
              if (typeof val === 'string') {
                return sanitizeColorFunctions(val);
              }
              return val;
            };
          }
          const val = Reflect.get(target, prop);
          if (typeof val === 'function') {
            return val.bind(target);
          }
          if (typeof val === 'string') {
            return sanitizeColorFunctions(val);
          }
          return val;
        }
      });
    };

    // Proxy the iframe contentWindow's getComputedStyle so cloned elements query safe colors
    if (originalIframeWindowDescriptor && originalIframeWindowDescriptor.get) {
      const origGet = originalIframeWindowDescriptor.get;
      try {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          get() {
            const win = origGet.call(this);
            if (win && !win.__computedStylePatched) {
              win.__computedStylePatched = true;
              const origGetCompStyle = win.getComputedStyle;
              if (origGetCompStyle) {
                win.getComputedStyle = function (elt: Element, pseudoElt?: string) {
                  const s = origGetCompStyle.call(win, elt, pseudoElt);
                  return new Proxy(s, {
                    get(t, p) {
                      if (p === 'getPropertyValue') {
                        return function (propertyName: string) {
                          const val = t.getPropertyValue(propertyName);
                          if (typeof val === 'string') {
                            return sanitizeColorFunctions(val);
                          }
                          return val;
                        };
                      }
                      const val = Reflect.get(t, p);
                      if (typeof val === 'function') {
                        return val.bind(t);
                      }
                      if (typeof val === 'string') {
                        return sanitizeColorFunctions(val);
                      }
                      return val;
                    }
                  });
                };
              }
            }
            return win;
          },
          configurable: true,
          enumerable: true
        });
      } catch (e) {
        console.warn('Failed to define custom contentWindow getter:', e);
      }
    }

    // Also sanitize inline styles on the rendering canvas and descendants
    const allStyledElements = [canvasElement, ...Array.from(canvasElement.querySelectorAll('*'))];
    const originalInlineStyles = new Map<HTMLElement, string>();

    allStyledElements.forEach((el: any) => {
      if (el.style && el.style.cssText) {
        const styleStr = el.style.cssText;
        if (styleStr.includes('oklch') || styleStr.includes('oklab') || styleStr.includes('color-mix')) {
          originalInlineStyles.set(el, styleStr);
          el.style.cssText = sanitizeColorFunctions(styleStr);
        }
      }
    });

    try {
      // Dynamic import to support smooth bundles
      const html2pdf = (await import('html2pdf.js')).default;

      // Extract current styling
      const originalStyle = canvasElement.getAttribute('style');

      // Temporarily expand A4 printable card with crisp margins for html2pdf conversion
      canvasElement.style.width = '210mm';
      canvasElement.style.padding = '0';
      canvasElement.style.margin = '0';
      canvasElement.style.background = '#ffffff';
      canvasElement.style.color = '#1e293b';
      canvasElement.style.boxShadow = 'none';
      canvasElement.style.border = 'none';

      // Temporarily style all page sheets as border-box 100% and exact heights to match A4
      // We set height/minHeight/maxHeight to exactly 295mm to fit inside the A4 vertical box budget.
      // This is slightly smaller than 297mm to prevent any decimal bounding rounding issues from adding blank buffer pages.
      const sheets = canvasElement.querySelectorAll('.cover-sheet, .sommaire-section, .brand-page-sheet');
      sheets.forEach((sheet: any) => {
        originalSheetStyles.set(sheet, sheet.getAttribute('style') || '');
        sheet.style.setProperty('margin', '0', 'important');
        sheet.style.setProperty('margin-bottom', '0', 'important');
        sheet.style.setProperty('border', 'none', 'important');
        sheet.style.setProperty('box-shadow', 'none', 'important');
        sheet.style.setProperty('padding', '15mm', 'important');
        sheet.style.setProperty('box-sizing', 'border-box', 'important');
        sheet.style.setProperty('background', '#ffffff', 'important');
        sheet.style.setProperty('color', '#1e293b', 'important');
        sheet.style.setProperty('width', '100%', 'important');
        sheet.style.setProperty('height', '295mm', 'important');
        sheet.style.setProperty('min-height', '295mm', 'important');
        sheet.style.setProperty('max-height', '295mm', 'important');
      });

      // Crucial: Clear any gap layouts in .flex-col of the document, which causes 40px offsets and extra blank pages
      const gapContainers = canvasElement.querySelectorAll('.flex.flex-col.gap-10');
      gapContainers.forEach((container: any) => {
        originalSheetStyles.set(container, container.getAttribute('style') || '');
        container.style.setProperty('gap', '0', 'important');
        container.style.setProperty('margin', '0', 'important');
        container.style.setProperty('padding', '0', 'important');
      });

      const opt = {
        margin: 0, // clean edge-to-edge alignment (margins handled inside page sheets)
        filename: `Flyer_Mabeo_${config.title?.replace(/[^a-z0-9]/gi, '_') || 'Promo'}_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          useCORS: true, 
          scale: 2, // High resolution Retail output
          letterRendering: true,
          logging: false,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak: { mode: ['css', 'legacy'], avoid: '.page-break-inside-avoid' }
      };

      // Generate the PDF and trigger downloading
      await html2pdf().set(opt).from(canvasElement).save();

      // Restore styling perfectly
      if (originalStyle) {
        canvasElement.setAttribute('style', originalStyle);
      } else {
        canvasElement.removeAttribute('style');
      }
    } catch (error) {
      console.error("Erreur de génération PDF:", error);
    } finally {
      // Restore child sheet styles
      originalSheetStyles.forEach((styleStr, el) => {
        try {
          if (styleStr) {
            el.setAttribute('style', styleStr);
          } else {
            el.removeAttribute('style');
          }
        } catch (e) {}
      });

      // Restore inline styles
      originalInlineStyles.forEach((styleStr, el) => {
        try {
          el.style.cssText = styleStr;
        } catch (e) {}
      });

      // Restore original getComputedStyle
      window.getComputedStyle = originalGetComputedStyle;

      // Restore original contentWindow descriptor
      if (originalIframeWindowDescriptor) {
        try {
          Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', originalIframeWindowDescriptor);
        } catch (e) {
          console.warn('Failed to restore contentWindow descriptor:', e);
        }
      }

      // Restore original previewMode state
      setPreviewMode(originalPreviewMode);

      setIsGeneratingPDF(false);
    }
  };

  return (
    <div id="flyer-generator-app" className="min-h-screen bg-[#070b13] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#070b13] to-black text-slate-100 flex flex-col antialiased selection:bg-blue-500/35">
      
      {/* Top Banner & Title Bar */}
      <header id="app-header" className="border-b border-white/10 bg-black/35 backdrop-blur-lg px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/15 text-blue-400 font-extrabold rounded-lg text-lg flex items-center justify-center border border-blue-500/25 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Générateur de Flyer Commercial Mabéo
              <span className="text-[10px] uppercase font-mono tracking-wider bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">
                Frosted Glass v1.1
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Produisez des fiches papier A4 / PDF promotionnelles élégantes, connectées et sans redondances.</p>
          </div>
        </div>

        <div className="flex gap-2 text-xs">
          <button
            id="btn-template-download"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold py-2 px-3.5 rounded-lg transition-colors border border-white/10 cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-400" />
            Télécharger le Canevas Excel
          </button>

          <button
            id="btn-native-print"
            onClick={handlePrintFlyer}
            disabled={products.length === 0 || isGeneratingPDF}
            className={`flex items-center gap-1.5 font-bold py-2.5 px-4.5 rounded-full transition-all cursor-pointer shadow-lg ${
              products.length === 0 || isGeneratingPDF
                ? 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-102 shadow-blue-500/20'
            }`}
          >
            {isGeneratingPDF ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            {isGeneratingPDF ? "Génération..." : "Imprimer / Exporter PDF"}
          </button>
        </div>
      </header>

      {/* Main Workspace split into Control and Live Preview */}
      <main id="app-workspace" className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 p-4 md:p-6 items-start">
        
        {/* Left Hand: Controller Panel (6 units wide) */}
        <div id="control-column-left" className="xl:col-span-5 flex flex-col gap-6">
          
          {/* Navigation/Steps Tracker in panel */}
          <div className="bg-white/5 border border-white/10 p-1.5 rounded-xl flex text-xs font-semibold gap-1 backdrop-blur-md shadow-lg">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'upload' 
                  ? 'bg-blue-500/20 text-white border border-blue-500/25 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              1. Import Excel
            </button>
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex-1 py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'editor' 
                  ? 'bg-blue-500/20 text-white border border-blue-500/25 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              2. Édition de Table
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'settings' 
                  ? 'bg-blue-500/20 text-white border border-blue-500/25 shadow-inner' 
                  : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              3. Gabarit Visuel
            </button>
          </div>

          {/* Active Work Area Content */}
          <div id="tab-content-panel">
            {activeTab === 'upload' && (
              <div className="flex flex-col gap-5">
                <div className="glass-card rounded-xl p-5">
                  <h3 className="font-bold text-white text-base mb-1">Importation du fichier Excel</h3>
                  <p className="text-xs text-slate-350 mb-4 leading-relaxed">
                    Ajoutez vos familles d'articles en glissant votre tableur ci-dessous. Le système prend en charge les formats Microsoft Excel standard (.xlsx, .xls) et CSV séparés par virgules ou points-virgules.
                  </p>
                  <ExcelUploader 
                    onProductsLoaded={handleProductsLoaded} 
                    onLoadDemo={handleLoadDemo} 
                  />
                </div>
                
                {/* Visual Instructions card for beginners */}
                <div className="bg-blue-500/10 rounded-xl border border-blue-500/20 p-5 flex gap-3 text-blue-200 leading-relaxed text-xs shadow-[0_0_15px_rgba(59,130,246,0.05)]">
                  <HelpCircle className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Comment démarrer en quelques secondes :</span>
                    <ol className="mt-2 list-decimal list-inside flex flex-col gap-1.5 text-blue-150">
                      <li>Cliquez sur <strong className="text-blue-300 font-bold">Injecter le catalogue de démo</strong> ci-dessus pour pré-remplir l'outil.</li>
                      <li>Cliquez sur <strong className="text-blue-300 font-bold">Lancer la recherche automatique d'images</strong> dans l'onglet Édition.</li>
                      <li>Le lisseur d'images va chercher directement sur le catalogue de Mabéo Industries et de Google pour illustrer les produits.</li>
                      <li>Configurez vos en-têtes et exportez en PDF !</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <ProductEditor
                products={products}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onBatchScrape={handleBatchScrape}
                onSingleScrape={handleSingleScrape}
                isScrapingBatch={isScrapingBatch}
                scrapeProgress={{ current: scrapeIndex, total: products.length }}
                scrapeDelay={scrapeDelay}
                setScrapeDelay={setScrapeDelay}
                initialEditingId={initialEditingId}
                onClearInitialEditingId={() => setInitialEditingId(null)}
              />
            )}

            {activeTab === 'settings' && (
              <FlyerSettingsPanel 
                config={config} 
                onChange={(updates) => setConfig({ ...config, ...updates })} 
              />
            )}
          </div>

          {/* Quick PDF instruction helper */}
          {products.length > 0 && (
            <div id="pdf-tip-panel" className="glass-card text-slate-300 p-5 rounded-xl flex flex-col gap-2.5 text-xs">
              <span className="font-bold text-slate-150 flex items-center gap-1.5">
                💡 Guide d'impression PDF
              </span>
              <p className="leading-relaxed text-slate-400">
                Pour enregistrer un flyer sous forme de fichier vectoriel PDF standardisé :
              </p>
              <ul className="flex flex-col gap-1 list-disc list-inside text-slate-450 text-[11px]">
                <li>Sélectionnez l'option <strong>'Gabarit de page A4 PDF'</strong> sur l'aperçu de droite.</li>
                <li>Cliquez sur <strong>'Imprimer / Exporter PDF'</strong> en haut de l'écran.</li>
                <li>Dans la fenêtre, définissez la Destination sur <strong className="text-white">Enregistrer au format PDF</strong>.</li>
                <li>Dans 'Plus de paramètres', cochez bien la case <strong className="text-white">Graphismes d'arrière-plan</strong> et réglez les Marges sur <strong>Aucune</strong> ou <strong>Par défaut</strong>.</li>
              </ul>
            </div>
          )}

        </div>

        {/* Right Hand: Real-time Live Document Preview (7 units wide) */}
        <div id="preview-column-right" className="xl:col-span-7 flex flex-col gap-4">
          
          {/* Preview configuration toggle bar */}
          <div id="preview-navbar" className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-md">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 pl-1.5">
              <Eye className="w-4 h-4 text-blue-400" />
              Aperçu en Temps Réel du Flyer
            </span>

            <div className="flex bg-black/25 p-1 rounded-lg text-xs font-semibold border border-white/5">
              <button
                type="button"
                onClick={() => setPreviewMode('interactive')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  previewMode === 'interactive' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Dépôt Mobile & Écran
              </button>
              
              <button
                type="button"
                onClick={() => setPreviewMode('print')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  previewMode === 'print' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Gabarit de page A4 PDF
              </button>
            </div>
          </div>

          {/* Rendering the Leaflet Canvas */}
          <div 
            id="rendered-leaflet-wrapper" 
            className={`w-full overflow-y-auto max-h-[85vh] rounded-xl border border-white/10 bg-slate-900/35 p-4 relative shadow-[inner_0_4px_30px_rgba(0,0,0,0.5)] backdrop-blur-3xl ${
              previewMode === 'print' ? 'flex justify-center' : ''
            }`}
          >
            <FlyerDocument 
              products={products} 
              config={config} 
              viewMode={previewMode} 
              onEditProduct={handleEditProduct}
            />
          </div>

        </div>

      </main>

      <footer className="bg-black/45 text-slate-500 text-center py-5 text-xs border-t border-white/10 mt-auto select-none backdrop-blur-md">
        <p>Logiciel créé par JENABA Développement</p>
      </footer>

    </div>
  );
}
