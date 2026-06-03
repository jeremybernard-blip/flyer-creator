import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload, AlertCircle, FileText, Check, HelpCircle } from 'lucide-react';
import { Product } from '../types';

interface ExcelUploaderProps {
  onProductsLoaded: (products: Product[]) => void;
  onLoadDemo: () => void;
}

export function ExcelUploader({ onProductsLoaded, onLoadDemo }: ExcelUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Impossible de lire le fichier");

        let workbook: XLSX.WorkBook;
        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder('utf-8').decode(data as ArrayBuffer);
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          const bytes = new Uint8Array(data as ArrayBuffer);
          workbook = XLSX.read(bytes, { type: 'array' });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          throw new Error("Le fichier Excel doit contenir au moins une ligne d'en-tête et une ligne de données.");
        }

        // Parse headers to match columns dynamically
        const headers = (jsonData[0] as string[]).map(h => String(h || '').trim().toLowerCase());
        
        let brandIdx = -1;
        let refIdx = -1;
        let refFabricantIdx = -1;
        let designationIdx = -1;
        let priceIdx = -1;
        let categoryIdx = -1;

        // Smart column mapping heuristic
        headers.forEach((header, index) => {
          if (header.includes('fabricant') || header.includes('fabr') || header.includes('fab') || header.includes('constructeur') || header === 'ref_fab') {
            refFabricantIdx = index;
          }
          if (header.includes('mabeo') || header.includes('mabéo') || header.includes('code mabeo') || header === 'ref_mab') {
            refIdx = index;
          } else if (refIdx === -1 && (header === 'ref' || header === 'reference' || header === 'référence')) {
            refIdx = index;
          }
          
          if (header.includes('marque') || header.includes('brand') || header.includes('constructeur')) brandIdx = index;
          if (header.includes('designation') || header.includes('désignation') || header.includes('nom') || header.includes('produit') || header.includes('title') || header.includes('libellé') || header.includes('libelle')) designationIdx = index;
          if (header.includes('prix') || header.includes('price') || header.includes('tarif') || header.includes('montant') || header.includes('eur') || header.includes('ht') || header.includes('h.t')) priceIdx = index;
          if (header.includes('cat') || header.includes('type') || header.includes('famille')) categoryIdx = index;
        });

        // Fail-safe override tailored explicitly for our User's guidelines:
        // Col A (0): Référence Mabéo
        // Col B (1): Désignation
        // Col F (5): Référence Fabricant
        // Col G (6): Marque
        if (refIdx === -1 || refIdx === brandIdx) refIdx = 0; // Col A
        if (designationIdx === -1) designationIdx = 1; // Col B
        if (refFabricantIdx === -1) refFabricantIdx = 5; // Col F
        if (brandIdx === -1) brandIdx = 6; // Col G
        
        // Price and Category defaults if not matched dynamically
        if (priceIdx === -1) priceIdx = 2; // Default to Column C
        if (categoryIdx === -1) categoryIdx = 4; // Default to Column E (or Fallback D if E empty)

        const parsedProducts: Product[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row || row.length === 0) continue;

          // Make sure columns are within row limits or default nicely
          const reference = row[refIdx] !== undefined ? String(row[refIdx]).trim() : '';
          const refFabricant = refFabricantIdx !== -1 && row[refFabricantIdx] !== undefined ? String(row[refFabricantIdx]).trim() : '';
          const designation = row[designationIdx] !== undefined ? String(row[designationIdx]).trim() : '';
          const brand = row[brandIdx] !== undefined ? String(row[brandIdx]).trim() : 'GÉNÉRIQUE';
          
          let actualPriceIdx = priceIdx;
          // Fail-safe if price is empty at designated index try nearby unmapped indices
          if ((row[actualPriceIdx] === undefined || row[actualPriceIdx] === '') && row[2] !== undefined && row[2] !== '') actualPriceIdx = 2;
          if ((row[actualPriceIdx] === undefined || row[actualPriceIdx] === '') && row[3] !== undefined && row[3] !== '') actualPriceIdx = 3;
          
          const priceValue = row[actualPriceIdx] !== undefined ? row[actualPriceIdx] : '';
          
          let category = '';
          const catLevels: string[] = [];
          for (let colIdx = 9; colIdx <= 13; colIdx++) {
            if (row[colIdx] !== undefined && row[colIdx] !== null) {
              const val = String(row[colIdx]).trim();
              if (val && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'undefined') {
                catLevels.push(val);
              }
            }
          }
          
          if (catLevels.length > 0) {
            category = catLevels[catLevels.length - 1]; // Use the leaf / deepest category level
          } else {
            let actualCategoryIdx = categoryIdx;
            if ((row[actualCategoryIdx] === undefined || row[actualCategoryIdx] === '') && row[4] !== undefined && row[4] !== '') actualCategoryIdx = 4;
            if ((row[actualCategoryIdx] === undefined || row[actualCategoryIdx] === '') && row[3] !== undefined && row[3] !== '') actualCategoryIdx = 3;
            category = row[actualCategoryIdx] ? String(row[actualCategoryIdx]).trim() : 'Fournitures Générales';
          }

          if (!reference && !designation) continue; // Skip empty rows

          // Clean price
          let parsedPrice: number | string = '';
          if (typeof priceValue === 'number') {
            parsedPrice = Math.round(priceValue * 100) / 100;
          } else if (typeof priceValue === 'string') {
            const cleaned = priceValue.replace(/[^0-9.,]/g, '').replace(',', '.');
            const numeric = parseFloat(cleaned);
            parsedPrice = isNaN(numeric) ? priceValue : Math.round(numeric * 100) / 100;
          }

          parsedProducts.push({
            id: `excel-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            reference: reference || `REF-${i}`,
            refFabricant: refFabricant || undefined,
            marque: brand.toUpperCase(),
            designation: designation || `Article ${reference}`,
            prix: parsedPrice,
            categorie: category,
            searchStatus: 'idle'
          });
        }

        if (parsedProducts.length === 0) {
          throw new Error("Aucune ligne de produit valide n'a pu être extraite.");
        }

        onProductsLoaded(parsedProducts);
      } catch (err: any) {
        setError(err.message || "Erreur lors de la lecture du fichier. Assurez-vous que le format est correct.");
        console.error(err);
      }
    };

    reader.onerror = () => {
      setError("Erreur de lecture du fichier.");
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        processFile(file);
      } else {
        setError("Type de fichier non supporté. Veuillez déposer un fichier Excel (.xlsx, .xls) ou un CSV.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div id="excel-uploader-container" className="flex flex-col gap-5 w-full">
      <div
        id="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileSelect}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/20 scale-[0.99] shadow-[0_0_15px_rgba(59,130,246,0.3)]'
            : 'border-white/10 glass-card glass-card-hover'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls,.csv"
          className="hidden"
          id="excel-file-input"
        />
        
        <div id="upload-icon-wrapper" className="p-4 bg-blue-500/10 text-blue-400 rounded-full mb-4 border border-blue-500/20">
          <Upload className="w-8 h-8" />
        </div>

        <h3 id="upload-title" className="text-base font-bold text-white mb-1">
          Déposez votre fichier Excel ou CSV ici
        </h3>
        <p id="upload-subtitle" className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
          Glissez-déposez ou cliquez pour parcourir vos fichiers (.xlsx, .xls, .csv).
        </p>

        <div id="columns-badge-row" className="flex flex-wrap gap-2 justify-center text-[10px] sm:text-[11px] text-slate-400 bg-white/5 border border-white/10 px-3 py-2 rounded-lg mb-2">
          <span className="self-center font-semibold text-slate-300">Format Requis :</span>
          <span className="bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25 text-blue-300 font-mono" title="Colonne A">Col A : Réf Mabéo</span>
          <span className="bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25 text-blue-300 font-mono" title="Colonne B">Col B : Désignation</span>
          <span className="bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25 text-blue-300 font-mono" title="Colonne F">Col F : Réf Fabricant</span>
          <span className="bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25 text-blue-300 font-mono" title="Colonne G">Col G : Marque</span>
          <span className="bg-white/5 px-2 py-0.5 rounded border border-white/10 text-slate-300 font-mono" title="Colonne C">Col C : Prix H.T. (opt)</span>
          <span className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25 text-emerald-300 font-mono" title="Colonnes J à N">Cols J à N : Catégories</span>
        </div>
      </div>

      {error && (
        <div id="upload-error" className="flex items-start gap-2.5 p-4 bg-rose-500/10 text-rose-200 border border-rose-500/20 rounded-xl text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <div>
            <span className="font-bold text-rose-300">Erreur d'importation :</span>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div id="demo-box" className="p-5 glass-card rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex gap-3 items-center">
          <div className="bg-blue-500/10 border border-blue-500/25 p-2.5 rounded-lg text-blue-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-200 text-sm">Vous n'avez pas de fichier Excel sous la main ?</h4>
            <p className="text-xs text-slate-450 mt-1 leading-relaxed">
              Testez instantanément avec notre catalogue de démonstration contenant de grandes marques (Facom, Bosch, 3M, Delta Plus, uvex).
            </p>
          </div>
        </div>
        <button
          type="button"
          id="load-demo-button"
          onClick={onLoadDemo}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 text-xs font-semibold rounded-full transition-all cursor-pointer shrink-0 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-98"
        >
          Injecter le catalogue de démo
        </button>
      </div>
    </div>
  );
}
